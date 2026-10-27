import { AqutterNativeFormat, decodeAqutterNativeFrame, peekAqutterNativeSeq } from './frame'
import { getEndpoint } from '../endpoint'
import type { AqutterNativeFrame } from './frame'
import type { AqutterNativeGesture } from './gestures'
import type { AqutterNativePointer } from './pointer'

/** 原生端的連線資訊（殼注入的 `window.aqutterEndpoint`）。 */
export interface AqutterNativeEndpoint {
  port: number
  token: string
}

/** 網頁 → 原生的訊息：語意手勢、原始指標事件，或自訂指令。 */
export type AqutterNativeMessage = AqutterNativeGesture | AqutterNativePointer | { type: 'command', name: string, args?: unknown }

/** 協定內部訊息：確認收幀、回報顯示尺寸。由本類別自動送出，不屬於 [AqutterNativeMessage]。 */
type ControlMessage =
  | { type: 'ack', seq: number }
  | { type: 'resize', width: number, height: number, dpr: number }
  | { type: 'visibility', visible: boolean }
  | { type: 'config', maxInFlight: number | 'auto' }

/** 顯示尺寸（CSS 像素）與裝置像素比。 */
export interface AqutterNativeViewportInfo {
  width: number
  height: number
  devicePixelRatio: number
}

/** 顯示模式，對應 CSS `object-fit`。 */
export type AqutterNativeFit = 'fill' | 'contain' | 'cover'

export interface AqutterNativeOptions {
  /** 與原生端 `AqutterNative.sessionId` 一致。 */
  session: string
  canvas: HTMLCanvasElement
  /** 取得連線資訊；省略時讀殼注入的 `window.aqutterEndpoint`（每次連線前重新讀取）。 */
  resolveEndpoint?: () => Promise<AqutterNativeEndpoint>
  /** 斷線後重連的間隔（毫秒）。 */
  reconnectMs?: number
  /** 連線狀態改變時呼叫。 */
  onStatus?: (connected: boolean) => void
  /**
   * 取得目前顯示尺寸。提供後會回報給原生端（連線時與 [AqutterNative.reportSize] 被呼叫時），
   * 原生端據此只擷取網頁實際需要的像素，而不是固定解析度。
   */
  measure?: () => AqutterNativeViewportInfo | null
  /** 每個連線在途（已送出、未確認）的幀數上限（1 到 8）；省略用原生端的預設。1 沒有排隊、延遲最低但吞吐較低；`'auto'` 由原生端探測各值的實際幀率後自動選擇。 */
  maxInFlight?: number | 'auto'
  /** 每畫完一幀呼叫；`latencyMs` 為（網頁收到時間 − 原生送出時間），兩邊時鐘同機所以可信。 */
  onFrame?: (info: { width: number, height: number, bytes: number, latencyMs: number, drawMs: number }) => void
}

const DEFAULT_RECONNECT_MS = 800
/** 連續幾次「連線還沒打開就被關掉」後，提示可能是 CSP 擋掉。 */
const CONNECT_FAILURE_HINT_AFTER = 3

/** 排程下一次繪製；沒有 `requestAnimationFrame` 的環境退回 setTimeout。 */
const scheduleFrame = (callback: () => void): void => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => callback())
    return
  }
  setTimeout(callback, 0)
}

/**
 * 連到原生端的鏡像工作階段：把收到的幀畫進 canvas，並提供 [send] 回傳訊息。
 *
 * - 斷線會自動重連（原生端重啟、WebView 重掛後仍能接回）。[stop] 之後不再重連。
 * - 同一個繪製週期內收到多幀只畫最新一幀。每一幀（含之後被丟棄或畫不出來的）在**收到時**就回覆確認，
 *   不等畫完；否則原生端會以為網頁卡住而停止送幀，或確認往返多出一個繪製週期（流量控制，見 `doc/nativeview.md`）。
 * - 繪製 RGBA 不複製像素：`ImageData` 直接包住收到的緩衝區。
 */
/** 一幀的兩則原始訊息。 */
interface RawFrame {
  header: ArrayBuffer
  payload: ArrayBuffer
}

export class AqutterNative {
  private socket: WebSocket | null = null
  private stopped = true
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly context: CanvasRenderingContext2D

  /** 等待下一個繪製週期的幀（標頭 + 像素）；只留最新一幀。 */
  private pending: RawFrame | null = null
  /** 已收到標頭、等待像素的那一則；null 表示下一則訊息是標頭。 */
  private awaitingPayload: ArrayBuffer | null = null
  private frameScheduled = false
  /** 已經開始繪製的最大序號，用來丟棄亂序的舊幀。 */
  private lastSeq = -1
  /** 每次開始繪製遞增；非同步解碼（PNG）完成後若已有更新的繪製就放棄。 */
  private drawToken = 0
  private lastReported = ''
  private visible = true
  private lastVisibleSent: boolean | null = null
  /** 連續「未曾打開就關閉」的次數；打開過即歸零。 */
  private failedConnects = 0
  private connectHintShown = false

  constructor(private readonly options: AqutterNativeOptions) {
    const context = options.canvas.getContext('2d')
    if (!context) {
      throw new Error('[aqutterNative] 2d canvas context is not available')
    }
    this.context = context
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  start(): void {
    if (!this.stopped) {
      return
    }
    this.stopped = false
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.pending = null
    this.socket?.close()
    this.socket = null
  }

  /** 送訊息給原生端；尚未連線時丟棄並回傳 false。 */
  send(message: AqutterNativeMessage): boolean {
    return this.sendRaw(message)
  }

  /** 重新量測並把顯示尺寸回報給原生端（尺寸沒變就不送）。元素大小改變時呼叫。 */
  /** 設定在途幀數上限；連線中隨時可改，重新連線時會補送。 */
  setMaxInFlight(limit: number | 'auto' | undefined): void {
    this.maxInFlight = limit
    this.flushMaxInFlight()
  }

  private maxInFlight: number | 'auto' | undefined
  private lastMaxInFlightSent: number | 'auto' | undefined

  private flushMaxInFlight(): void {
    const limit = this.maxInFlight
    if (limit === undefined || limit === this.lastMaxInFlightSent) {
      return
    }
    if (this.sendRaw({ type: 'config', maxInFlight: limit })) {
      this.lastMaxInFlightSent = limit
    }
  }

  reportSize(): void {
    const viewport = this.options.measure?.()
    if (!viewport || viewport.width <= 0 || viewport.height <= 0) {
      return
    }
    const key = `${viewport.width}x${viewport.height}@${viewport.devicePixelRatio}`
    if (key === this.lastReported) {
      return
    }
    if (this.sendRaw({ type: 'resize', width: viewport.width, height: viewport.height, dpr: viewport.devicePixelRatio })) {
      this.lastReported = key
    }
  }

  /**
   * 設定元素目前是否看得到（在畫面內、分頁可見）。看不到時原生端暫停擷取與送幀，看得到時立刻補一幀。
   * 狀態沒變不重送；連線時會補送目前狀態。
   */
  setVisible(visible: boolean): void {
    this.visible = visible
    this.flushVisible()
  }

  private flushVisible(): void {
    if (this.lastVisibleSent === this.visible) {
      return
    }
    if (this.sendRaw({ type: 'visibility', visible: this.visible })) {
      this.lastVisibleSent = this.visible
    }
  }

  private sendRaw(message: AqutterNativeMessage | ControlMessage): boolean {
    if (!this.connected) {
      return false
    }
    this.socket?.send(JSON.stringify(message))
    return true
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) {
      return
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, this.options.reconnectMs ?? DEFAULT_RECONNECT_MS)
  }

  /**
   * 連線還沒打開就被關掉。網頁若設了 CSP 而 `connect-src` 沒放行 `ws://127.0.0.1:*`，瀏覽器會靜默擋掉
   * 這條 WebSocket，畫面只會是空白、沒有任何錯誤——連續失敗幾次後提示一次，讓人知道去查 CSP。
   */
  private noteConnectFailure(url: string): void {
    this.failedConnects += 1
    if (this.failedConnects < CONNECT_FAILURE_HINT_AFTER || this.connectHintShown) {
      return
    }
    this.connectHintShown = true
    const target = url.replace(/\?.*$/, '')
    console.warn(`[aqutterNative] 連線 ${target} 連續失敗 ${this.failedConnects} 次。若網頁設了 Content-Security-Policy，`
      + '`connect-src` 需要允許 `ws://127.0.0.1:*`，否則連線會被靜默擋掉、畫面只會是空白（見 docs/nativeview.md 的「網頁的 CSP」）。')
  }

  private async connect(): Promise<void> {
    let endpoint: AqutterNativeEndpoint
    try {
      endpoint = await (this.options.resolveEndpoint ?? getEndpoint)()
    }
    catch {
      this.scheduleReconnect()
      return
    }
    if (this.stopped) {
      return
    }
    const url = `ws://127.0.0.1:${endpoint.port}/native/${encodeURIComponent(this.options.session)}?token=${encodeURIComponent(endpoint.token)}`
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    let opened = false
    socket.onopen = () => {
      opened = true
      this.failedConnects = 0
      // 新連線：序號與尺寸回報都重來（原生端的工作階段可能重建過）
      this.lastSeq = -1
      this.awaitingPayload = null
      this.lastReported = ''
      this.lastVisibleSent = null
      this.lastMaxInFlightSent = undefined
      this.options.onStatus?.(true)
      if (this.maxInFlight === undefined) {
        this.maxInFlight = this.options.maxInFlight
      }
      this.flushMaxInFlight()
      this.reportSize()
      this.flushVisible()
    }
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null
      }
      if (!opened) {
        this.noteConnectFailure(url)
      }
      this.pending = null
      this.awaitingPayload = null
      this.options.onStatus?.(false)
      this.scheduleReconnect()
    }
    socket.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) {
        return
      }
      // 嚴格交替：標頭、像素、標頭、像素…
      if (this.awaitingPayload === null) {
        this.awaitingPayload = event.data
        return
      }
      const header = this.awaitingPayload
      this.awaitingPayload = null
      // 收到就確認，不等畫完：畫要等下一個繪製週期，確認若等到那時，往返延遲會多出約一個週期，
      // 原生端的「未確認上限」就會卡住送幀。網頁不會因此堆積——pending 只留最新一幀。
      // 網頁主執行緒忙碌時 onmessage 不會執行，確認自然延後，流量控制仍然有效。
      this.ack(header)
      this.enqueue({ header, payload: event.data })
    }
  }

  /** 收到一幀：只留最新的，下一個繪製週期再畫；被取代的舊幀直接丟掉（收到時已確認）。 */
  private enqueue(frame: RawFrame): void {
    this.pending = frame
    if (!this.frameScheduled) {
      this.frameScheduled = true
      scheduleFrame(() => {
        this.frameScheduled = false
        const next = this.pending
        this.pending = null
        if (next) {
          void this.draw(next)
        }
      })
    }
  }

  /** 讀出幀序號並回覆確認；標頭不合法時序號用 0（原生端只用計數）。 */
  private ack(header: ArrayBuffer): void {
    this.sendRaw({ type: 'ack', seq: peekAqutterNativeSeq(header) })
  }

  private async draw(raw: RawFrame): Promise<void> {
    let frame: AqutterNativeFrame
    try {
      frame = decodeAqutterNativeFrame(raw.header, raw.payload)
    }
    catch {
      return // 標頭或像素不合法：丟棄（收到時已確認）
    }
    if (frame.seq <= this.lastSeq) {
      return // 亂序的舊幀
    }
    this.lastSeq = frame.seq
    const token = ++this.drawToken
    const drawStart = performance.now()
    const { canvas } = this.options
    if (frame.format === AqutterNativeFormat.Rgba) {
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width
        canvas.height = frame.height
      }
      // 不複製：ImageData 直接包住收到的像素緩衝區
      const pixels = new Uint8ClampedArray(raw.payload, 0, frame.payload.byteLength)
      this.context.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0)
    }
    else {
      const bitmap = await createImageBitmap(new Blob([frame.payload.slice()], { type: 'image/jpeg' }))
      if (token !== this.drawToken) {
        bitmap.close() // 解碼期間已經有更新的幀開始繪製
        return
      }
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width
        canvas.height = frame.height
      }
      this.context.drawImage(bitmap, 0, 0, frame.width, frame.height)
      bitmap.close()
    }
    this.options.onFrame?.({ width: frame.width, height: frame.height, bytes: raw.header.byteLength + raw.payload.byteLength, latencyMs: Date.now() - frame.sentAt, drawMs: performance.now() - drawStart })
  }
}
