import { BridgeHandler } from '../contract/bridge'
import { callFlutter } from '../index'
import { DEFAULT_GESTURE_OPTIONS, GestureRecognizer, IOS_GESTURE_OPTIONS, isIosTouch } from './gestures'
import type { DoubleTapMode, GestureOptions } from './gestures'
import { toPointerMessage } from './pointer'
import type { AqutterNativePointerPhase } from './pointer'
import { AqutterNative } from './native'
import type { AqutterNativeFit, AqutterNativeMessage } from './native'

/** 預設的自訂元素標籤。 */
export const AQUTTER_NATIVE_TAG = 'aqutter-native'

/** 放開後多久內到達的「沒有 pointerup 的 click」才算被吃掉的第二下（毫秒）。 */
const PHANTOM_CLICK_MAX_MS = 250

const FITS: readonly AqutterNativeFit[] = ['fill', 'contain', 'cover']

/** `input` 屬性：回傳什麼輸入給原生端。`gestures` 語意手勢（預設）；`pointers` 原始指標事件；`both` 兩者。 */
type InputMode = 'gestures' | 'pointers' | 'both'
const INPUT_MODES: readonly InputMode[] = ['gestures', 'pointers', 'both']

const TEMPLATE = `
<style>
  :host { display: block; position: relative; overflow: hidden; touch-action: none; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; user-select: none; -webkit-user-select: none; }
</style>
<canvas part="canvas"></canvas>
`

/** `<aqutter-native>` 元素對外的介面。 */
export interface AqutterNativeElement extends HTMLElement {
  /** 送訊息給原生端；尚未連線時丟棄並回傳 false。 */
  send: (message: AqutterNativeMessage) => boolean
  /** 送自訂指令（原生端 `AqutterNativeMessage.type == 'command'`）。 */
  sendCommand: (name: string, args?: unknown) => boolean
  readonly connected: boolean
}

/**
 * 建立元素類別。刻意包成函式而非頂層 `class … extends HTMLElement`：
 * 伺服端渲染（沒有 `HTMLElement`）也會 import 本套件，頂層 extends 會在 import 時就拋 ReferenceError。
 */
const createElementClass = (): CustomElementConstructor => {
  /**
   * `<aqutter-native session="map" fit="cover">`：顯示原生端鏡像過來的畫面，並把手勢回傳。
   *
   * | 屬性 | 說明 |
   * |---|---|
   * | `session` | 與原生端 `AqutterNative.sessionId` 一致（必填） |
   * | `fit` | `fill`（預設）/ `contain` / `cover`，對應 `object-fit` |
   *
   * 事件（`CustomEvent`，不冒泡）：`aqutter-status`（`detail.connected`）、`aqutter-frame`
   * （`detail.width/height/bytes/latencyMs`）。方法：{@link send}、{@link sendCommand}。
   * 手勢訊息格式見 `AqutterNativeGesture`；元素只送出，不改變自身內容。
   */
  class AqutterNativeElement extends HTMLElement {
    static readonly observedAttributes = ['session', 'fit', 'input', 'double-tap', 'double-tap-ms', 'double-tap-min-ms', 'double-tap-distance', 'slop', 'long-press-ms', 'max-in-flight']

    private canvas: HTMLCanvasElement | null = null
    private mirror: AqutterNative | null = null
    private recognizer: GestureRecognizer | null = null
    /** 目前生效的手勢門檻（含屬性覆寫）；除錯、顯示用。 */
    gestureOptions: GestureOptions | null = null
    private resizeObserver: ResizeObserver | null = null
    private intersectionObserver: IntersectionObserver | null = null
    private inView = true

    connectedCallback(): void {
      if (!this.shadowRoot) {
        const root = this.attachShadow({ mode: 'open' })
        root.innerHTML = TEMPLATE
        this.canvas = root.querySelector('canvas')
        this.bindPointers()
      }
      this.applyFit()
      this.restart()
    }

    disconnectedCallback(): void {
      this.resizeObserver?.disconnect()
      this.resizeObserver = null
      this.intersectionObserver?.disconnect()
      this.intersectionObserver = null
      document.removeEventListener('visibilitychange', this.onVisibilityChange)
      this.touchReconcile?.abort()
      this.touchReconcile = null
      this.mirror?.stop()
      this.mirror = null
    }

    attributeChangedCallback(name: string): void {
      if (name === 'fit') {
        this.applyFit()
      }
      else if (name === 'max-in-flight') {
        this.mirror?.setMaxInFlight(this.readMaxInFlight())
      }
      else if (name === 'input' || name === 'double-tap' || name === 'double-tap-ms' || name === 'double-tap-min-ms' || name === 'double-tap-distance' || name === 'slop' || name === 'long-press-ms') {
        // 輸入相關屬性在每次事件（或下一次按下）才讀，不必重連
      }
      else if (this.isConnected) {
        this.restart()
      }
    }

    /** 送訊息給原生端；尚未連線時丟棄並回傳 false。 */
    send(message: AqutterNativeMessage): boolean {
      return this.mirror?.send(message) ?? false
    }

    /** 送自訂指令（原生端 `AqutterNativeMessage.type == 'command'`）。 */
    sendCommand(name: string, args?: unknown): boolean {
      return this.send({ type: 'command', name, args })
    }

    get connected(): boolean {
      return this.mirror?.connected ?? false
    }

    private applyFit(): void {
      const fit = this.getAttribute('fit') as AqutterNativeFit | null
      if (this.canvas) {
        this.canvas.style.objectFit = fit && FITS.includes(fit) ? fit : 'fill'
      }
    }

    /** `max-in-flight` 屬性（1 到 8 的整數，或 `auto`）；沒設或不合法回 undefined（用原生端的預設）。 */
    private readMaxInFlight(): number | 'auto' | undefined {
      if (this.getAttribute('max-in-flight') === 'auto') {
        return 'auto'
      }
      const value = Number(this.getAttribute('max-in-flight'))
      return this.hasAttribute('max-in-flight') && Number.isInteger(value) && value >= 1 && value <= 8 ? value : undefined
    }

    private restart(): void {
      this.mirror?.stop()
      this.mirror = null
      const session = this.getAttribute('session')
      if (!session || !this.canvas) {
        return
      }
      this.mirror = new AqutterNative({
        session,
        canvas: this.canvas,
        resolveEndpoint: () => callFlutter(BridgeHandler.NativeEndpoint),
      measure: () => ({ width: this.clientWidth, height: this.clientHeight, devicePixelRatio: window.devicePixelRatio || 1 }),
        onStatus: connected => this.dispatchEvent(new CustomEvent('aqutter-status', { detail: { connected } })),
        maxInFlight: this.readMaxInFlight(),
        onFrame: info => this.dispatchEvent(new CustomEvent('aqutter-frame', { detail: info })),
      })
      this.mirror.start()
      // 元素大小改變時回報給原生端，讓它只擷取需要的像素
      this.resizeObserver?.disconnect()
      this.resizeObserver = new ResizeObserver(() => this.mirror?.reportSize())
      this.resizeObserver.observe(this)
      this.observeVisibility()
    }

    /** 元素在視窗內（含 display 不為 none）且分頁可見，才算「看得到」；其餘時間請原生端暫停。 */
    private observeVisibility(): void {
      this.intersectionObserver?.disconnect()
      document.removeEventListener('visibilitychange', this.onVisibilityChange)
      document.addEventListener('visibilitychange', this.onVisibilityChange)
      if (typeof IntersectionObserver === 'undefined') {
        this.syncVisible()
        return
      }
      this.intersectionObserver = new IntersectionObserver((entries) => {
        const latest = entries.at(-1)
        this.inView = latest?.isIntersecting ?? true
        this.syncVisible()
      })
      this.intersectionObserver.observe(this)
    }

    private touchReconcile: AbortController | null = null

    private readonly onVisibilityChange = (): void => this.syncVisible()

    private syncVisible(): void {
      this.mirror?.setVisible(this.inView && document.visibilityState !== 'hidden')
    }

    private bindPointers(): void {
      const canvas = this.canvas
      if (!canvas) {
        return
      }
      const number = (attribute: string, fallback: number): number => {
        const value = Number(this.getAttribute(attribute))
        return this.hasAttribute(attribute) && Number.isFinite(value) && value > 0 ? value : fallback
      }
      const doubleTapMode = (): DoubleTapMode => {
        const value = this.getAttribute('double-tap')
        return value === 'both' || value === 'off' || value === 'exclusive' ? value : DEFAULT_GESTURE_OPTIONS.doubleTap
      }
      // 門檻以屬性覆寫：double-tap-ms、double-tap-distance、slop、long-press-ms（每次讀取，改屬性立即生效）
      const defaults = isIosTouch() ? IOS_GESTURE_OPTIONS : DEFAULT_GESTURE_OPTIONS
      const options: GestureOptions = {
        ...defaults,
        get doubleTap(): DoubleTapMode { return doubleTapMode() },
        get doubleTapMs() { return number('double-tap-ms', defaults.doubleTapMs) },
        get doubleTapMinMs() { return number('double-tap-min-ms', defaults.doubleTapMinMs) },
        get doubleTapDistance() { return number('double-tap-distance', defaults.doubleTapDistance) },
        get slop() { return number('slop', defaults.slop) },
        get longPressMs() { return number('long-press-ms', defaults.longPressMs) },
      }
      this.gestureOptions = options
      this.recognizer = new GestureRecognizer(
        gesture => this.send(gesture),
        () => ({ width: canvas.clientWidth, height: canvas.clientHeight }),
        options,
      )
      const local = (event: PointerEvent): { x: number, y: number } => {
        const rect = canvas.getBoundingClientRect()
        return { x: event.clientX - rect.left, y: event.clientY - rect.top }
      }
      const mode = (): InputMode => {
        const value = this.getAttribute('input') as InputMode | null
        return value && INPUT_MODES.includes(value) ? value : 'gestures'
      }
      const wantsGestures = (): boolean => mode() !== 'pointers'
      const wantsPointers = (): boolean => mode() !== 'gestures'
      /** 正在按下的指標；只轉送按著的移動，滑鼠游標的懸停不送。 */
      const pressed = new Set<number>()
      const sendPointer = (phase: AqutterNativePointerPhase, event: PointerEvent): void => {
        const rect = canvas.getBoundingClientRect()
        this.send(toPointerMessage(phase, event, rect, { width: canvas.clientWidth, height: canvas.clientHeight }))
      }
      canvas.addEventListener('pointerdown', (event) => {
        try {
          // 觸控的指標本來就隱含捕捉；iOS 上多做一次顯式捕捉，快速連點的第二下會變成只有 click、沒有 pointer／touch 事件
          if (event.pointerType !== 'touch') {
            canvas.setPointerCapture(event.pointerId)
          }
        }
        catch {
          // 指標已不在（例如事件是程式合成的）：不捕捉也能繼續辨識
        }
        pressed.add(event.pointerId)
        if (wantsPointers()) {
          sendPointer('down', event)
        }
        if (wantsGestures()) {
          this.recognizer?.pointerDown(event.pointerId, local(event), event.timeStamp)
        }
      })
      canvas.addEventListener('pointermove', (event) => {
        if (wantsPointers() && pressed.has(event.pointerId)) {
          sendPointer('move', event)
        }
        if (wantsGestures()) {
          this.recognizer?.pointerMove(event.pointerId, local(event))
        }
      })
      canvas.addEventListener('pointerup', (event) => {
        if (wantsPointers() && pressed.delete(event.pointerId)) {
          sendPointer('up', event)
        }
        pressed.delete(event.pointerId)
        if (wantsGestures()) {
          this.recognizer?.pointerUp(event.pointerId, local(event), event.timeStamp)
        }
      })
      // iOS 在 App 的 WebView 裡，快速連點的第二下只會補一個 click，不送任何 touch／pointer 事件，
      // 辨識器因此看不到第二下。正常的 click 緊接在 pointerup 之後；沒有對應 pointerup 的 click 有兩種：
      //   - 被吃掉的第二下：在前一下放開後約 200 ms 內到達（實機紀錄：放開後約 190 ms）
      //   - iOS 對每次點擊都會再補的一個額外 click：在放開後約 300 ms 以後到達（實機紀錄：約 340 ms）
      // 只有前者補成一次按下加放開；後者若也補，慢節奏連點的單擊會一個接一個被配成雙擊。
      let upAwaitingClick = false
      let lastUpAt = Number.NEGATIVE_INFINITY
      canvas.addEventListener('pointerdown', () => { upAwaitingClick = false })
      canvas.addEventListener('pointerup', (event) => {
        upAwaitingClick = true
        lastUpAt = event.timeStamp
      })
      canvas.addEventListener('click', (event) => {
        if (upAwaitingClick) {
          upAwaitingClick = false
          return
        }
        if (!wantsGestures() || event.timeStamp - lastUpAt > PHANTOM_CLICK_MAX_MS) {
          return
        }
        const point = local(event)
        this.recognizer?.pointerDown(-1, point, event.timeStamp)
        this.recognizer?.pointerUp(-1, point, event.timeStamp)
        lastUpAt = Number.NEGATIVE_INFINITY // 同一次放開只補一次
      })
      // 殘留保險：觸控的 pointerup／pointercancel 偶爾不會送達（例如 iPad 的系統多指手勢、App 切換），
      // 辨識器就會一直記著已經放開的手指，之後單指拖曳與縮放都被擋掉。以 touch 事件的實際觸點數對帳：
      // 螢幕上已沒有任何觸點，就把殘留全部收掉。
      const reconcile = (event: TouchEvent): void => {
        if (event.touches.length > 0) {
          return
        }
        for (const id of pressed) {
          if (wantsPointers()) {
            this.send({ type: 'pointer', phase: 'cancel', id, x: 0.5, y: 0.5, t: performance.now(), pointerType: 'touch' })
          }
        }
        pressed.clear()
        if (wantsGestures() && (this.recognizer?.activeCount ?? 0) > 0) {
          this.recognizer?.cancel()
        }
      }
      this.touchReconcile?.abort()
      this.touchReconcile = new AbortController()
      const { signal } = this.touchReconcile
      document.addEventListener('touchend', reconcile, { passive: true, signal })
      document.addEventListener('touchcancel', reconcile, { passive: true, signal })
      canvas.addEventListener('pointercancel', (event) => {
        if (wantsPointers() && pressed.delete(event.pointerId)) {
          sendPointer('cancel', event)
        }
        pressed.delete(event.pointerId)
        if (wantsGestures()) {
          this.recognizer?.cancel()
        }
      })
    }
}

  return AqutterNativeElement
}

/** 註冊自訂元素（冪等）。伺服端（沒有 `customElements`）呼叫是 no-op。 */
export const defineAqutterNative = (tag: string = AQUTTER_NATIVE_TAG): void => {
  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined' || customElements.get(tag)) {
    return
  }
  customElements.define(tag, createElementClass())
}
