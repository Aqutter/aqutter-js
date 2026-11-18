/**
 * 穿透模式的網頁端：回報元素的矩形，以及判斷頁面能不能穿透。
 *
 * 穿透時原生內容畫在（透明的）WebView 下面，原生端需要知道元素在視窗中的位置與大小才能把內容放對地方，
 * 元素移動（任何祖先捲動）、改變大小、視窗改變、頁面可見性改變時都要回報。
 */

import { sampleWebRegions } from './webRegions'
import type { AqutterWebRegion } from './webRegions'

/** `{"type":"layout",...}`：元素的矩形，CSS 像素，相對 WebView 視窗左上角（`getBoundingClientRect()`）。 */
export interface AqutterNativeLayout {
  type: 'layout'
  left: number
  top: number
  width: number
  height: number
  /** 元素沒渲染、`display:none`、寬或高為 0、或頁面不可見時為 `false`。 */
  visible: boolean
  /** 送出時的 epoch 毫秒，供原生端量傳遞延遲。 */
  sentAt: number
  /**
   * 元素矩形內「網頁要接管觸控」的區域（相對元素左上角）。有這個欄位（含空陣列）表示這個 client 支援原生觸控，
   * 元素矩形扣掉這些區域的部分，觸控可以直接交給原生；沒有這個欄位則觸控全部走網頁。
   */
  webRegions?: AqutterWebRegion[]
}

/** 量測元素目前的矩形與可見性。 */
export const measureLayout = (element: Element): AqutterNativeLayout => {
  const rect = element.getBoundingClientRect()
  const pageVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
  return {
    type: 'layout',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    visible: element.isConnected && rect.width > 0 && rect.height > 0 && pageVisible,
    sentAt: Date.now(),
  }
}

const sameRegions = (a?: AqutterWebRegion[], b?: AqutterWebRegion[]): boolean => {
  if (a === b) {
    return true
  }
  return !!a && !!b && a.length === b.length
    && a.every((r, i) => r.x === b[i]!.x && r.y === b[i]!.y && r.width === b[i]!.width && r.height === b[i]!.height)
}

const sameLayout = (a: AqutterNativeLayout, b: AqutterNativeLayout): boolean =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height && a.visible === b.visible
  && sameRegions(a.webRegions, b.webRegions)

/** 排程到下一個動畫畫面；沒有 `requestAnimationFrame` 的環境退回 setTimeout。 */
const scheduleFrame = (callback: () => void): number => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(() => callback())
  }
  return setTimeout(callback, 0) as unknown as number
}

const cancelFrame = (handle: number): void => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle)
}

/**
 * 追蹤元素的矩形並回報：開始時立刻送一次；之後元素大小改變（`ResizeObserver`）、任何祖先捲動
 * （捕獲階段的 `scroll`，不必知道是哪個祖先在捲）、視窗大小改變、分頁可見性改變時再送。
 * 每個動畫畫面最多一則，內容與上一則相同就不送。回傳取消追蹤的函式。
 *
 * [send] 回傳 `false`（尚未連線）時不記為已送，下次變動或 [AqutterLayoutTracker.flush] 會再送。
 */
export interface AqutterLayoutTracker {
  /** 取消追蹤。 */
  stop: () => void
  /** 強制重送目前的矩形（例如重新連線後原生端不認得舊狀態）。 */
  flush: () => void
}

/** 網頁區域取樣的最短間隔（毫秒）。 */
export const WEB_REGION_SAMPLE_INTERVAL = 100

export interface AqutterLayoutOptions {
  /** 一併取樣並回報 `webRegions`（原生觸控用）。預設 `false`。 */
  sampleRegions?: boolean
}

export const trackLayout = (
  element: Element,
  send: (layout: AqutterNativeLayout) => boolean,
  options: AqutterLayoutOptions = {},
): AqutterLayoutTracker => {
  let frame = 0
  let scheduled = false
  let last: AqutterNativeLayout | null = null
  let stopped = false
  let regions: AqutterWebRegion[] | undefined
  let regionsDirty = true
  let lastSampleAt = Number.NEGATIVE_INFINITY
  let sampleTimer: ReturnType<typeof setTimeout> | null = null
  const clock = (): number => typeof performance === 'undefined' ? Date.now() : performance.now()

  /** 取樣（有節流）：太快就排一個 trailing 的重新回報，之後那次才會真正取樣。 */
  const sampleIfDue = (force: boolean): void => {
    if (!regionsDirty && !force) {
      return
    }
    const wait = WEB_REGION_SAMPLE_INTERVAL - (clock() - lastSampleAt)
    if (!force && wait > 0) {
      sampleTimer ??= setTimeout(() => {
        sampleTimer = null
        schedule()
      }, wait)
      return
    }
    regions = sampleWebRegions(element)
    regionsDirty = false
    lastSampleAt = clock()
  }

  const report = (force: boolean): void => {
    scheduled = false
    if (stopped) {
      return
    }
    const next = measureLayout(element)
    if (options.sampleRegions) {
      if (next.visible) {
        sampleIfDue(force)
      }
      const known = next.visible ? regions : []
      if (known) {
        next.webRegions = known
      }
    }
    if (!force && last && sameLayout(last, next)) {
      return
    }
    if (send(next)) {
      last = next
    }
  }
  const schedule = (): void => {
    regionsDirty = true
    if (scheduled || stopped) {
      return
    }
    scheduled = true
    frame = scheduleFrame(() => report(false))
  }

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  observer?.observe(element)
  // 疊在元素上的網頁內容改變（新增、移除、class／style 變動）時，網頁區域也會變
  const mutations = options.sampleRegions && typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null
  mutations?.observe(document.documentElement, { subtree: true, childList: true, attributes: true })
  window.addEventListener('scroll', schedule, { capture: true, passive: true })
  window.addEventListener('resize', schedule, { passive: true })
  document.addEventListener('visibilitychange', schedule)
  report(true)

  return {
    stop: () => {
      stopped = true
      if (scheduled) {
        cancelFrame(frame)
      }
      observer?.disconnect()
      mutations?.disconnect()
      if (sampleTimer) {
        clearTimeout(sampleTimer)
        sampleTimer = null
      }
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      document.removeEventListener('visibilitychange', schedule)
    },
    flush: () => report(true),
  }
}

/**
 * 解析 CSS 顏色的 alpha（0 到 1）。支援 `transparent`、`rgb()`／`rgba()`（逗號或空白語法，`/ alpha` 與百分比）
 * 與 `color(... / alpha)`；認不得的非空值保守地當作不透明（1），讓頁面偵測偏向「不可穿透」。
 */
export const cssColorAlpha = (value: string): number => {
  const text = value.trim().toLowerCase()
  if (text === '' || text === 'transparent') {
    return 0
  }
  const match = /^(?:rgba?|hsla?|color)\((.*)\)$/.exec(text)
  if (!match) {
    return 1
  }
  const body = match[1]!
  const slash = body.indexOf('/')
  let alphaText: string | undefined
  if (slash >= 0) {
    alphaText = body.slice(slash + 1).trim()
  }
  else if (/^(?:rgba|hsla)/.test(text)) {
    const parts = body.split(',').map(part => part.trim())
    if (parts.length === 4) {
      alphaText = parts[3]
    }
  }
  if (alphaText === undefined) {
    return 1
  }
  const alpha = alphaText.endsWith('%') ? Number.parseFloat(alphaText) / 100 : Number.parseFloat(alphaText)
  return Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1
}

/** 「不透明」的門檻：alpha 達到它就視為會蓋住後方的原生內容。 */
export const OPAQUE_ALPHA = 0.99

/** 元素的上一層：一般的父元素，或跨過 shadow DOM 邊界的宿主。 */
const parentOf = (node: Element): Element | null => {
  if (node.parentElement) {
    return node.parentElement
  }
  const root = node.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

/**
 * 頁面可不可以穿透：元素往上到 `<html>` 的每個祖先，`background-color` 的 alpha 都小於 [OPAQUE_ALPHA]
 * 且 `background-image` 為 `none`。只看祖先，不看兄弟、偽元素與 `box-shadow` 遮罩，也不看元素自己。
 */
export const detectPageReady = (element: Element): boolean => {
  for (let node = parentOf(element); node; node = parentOf(node)) {
    const style = getComputedStyle(node)
    if (cssColorAlpha(style.backgroundColor) >= OPAQUE_ALPHA) {
      return false
    }
    const image = style.backgroundImage
    if (image && image !== 'none') {
      return false
    }
  }
  return true
}
