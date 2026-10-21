/**
 * 把指標事件辨識成語意手勢，供回傳給原生端。座標一律為 0..1 的正規化值（相對元素大小）。
 *
 * 辨識規則：
 * - 單指按下後移動超過 {@link GestureOptions.slop} → `pan`（start / update / end）
 * - 單指在 slop 內放開 → `tap`；{@link GestureOptions.doubleTapMs} 內於近處再點一次 → `doubleTap`。
 *   {@link GestureOptions.doubleTap} 決定兩者的關係：
 *   - `exclusive`（預設）：互斥。雙擊只送 `doubleTap`，不會同時送 `tap`；代價是單擊要等雙擊視窗過了才能確定，
 *     晚約 {@link GestureOptions.doubleTapMs} 毫秒送出。
 *   - `both`：不延遲。每一下立刻送 `tap`，第二下之後再送 `doubleTap`（雙擊會同時有兩次 `tap` 與一次 `doubleTap`）。
 *   - `off`：不辨識雙擊，每一下立刻送 `tap`。
 * - 單指按住超過 {@link GestureOptions.longPressMs} 沒移動 → `longPress`（放開後不再送 `tap`）
 * - 第二指按下 → 結束 pan、開始 `pinch`（`scale` 為自 pinch 開始的累計倍率，`x`/`y` 為兩指中心）
 */

export type GesturePhase = 'start' | 'update' | 'end'

export type AqutterNativeGesture =
  | { type: 'tap' | 'doubleTap' | 'longPress', x: number, y: number }
  | { type: 'pan', phase: GesturePhase, x: number, y: number, dx: number, dy: number }
  | { type: 'pinch', phase: GesturePhase, scale: number, x: number, y: number }

/** 單擊與雙擊的關係，見檔頭說明。 */
export type DoubleTapMode = 'exclusive' | 'both' | 'off'

export interface GestureOptions {
  /** 判定為移動的像素門檻。 */
  slop: number
  doubleTap: DoubleTapMode
  longPressMs: number
  doubleTapMs: number
  /** 第一下放開到第二下按下的最短間隔（毫秒）；更短視為觸控誤報（兩次獨立的點擊），不算雙擊。 */
  doubleTapMinMs: number
  /** 兩次點擊被視為「同一處」的最大距離（像素）。 */
  doubleTapDistance: number
}

/** 互斥模式等待第二下的計時寬限（毫秒），吸收事件晚到的抖動。 */
export const DOUBLE_TAP_GRACE_MS = 0

export const DEFAULT_GESTURE_OPTIONS: GestureOptions = {
  slop: 8,
  doubleTap: 'exclusive',
  longPressMs: 500,
  doubleTapMs: 130,
  doubleTapMinMs: 40,
  doubleTapDistance: 32,
}

/**
 * iOS（含 iPadOS）的預設：同一個快速雙擊，iPad 實機量到「第一下放開到第二下按下」約 225–260 ms、兩下相距 9–36 px，
 * 比 Android 慢；用 130 ms 的預設在 iPad 上點不中。兩下的距離也寬得多：真人在大畫面上的連點常相距 50–160 px。這是兩台裝置各一組的實測，不是平台規格；
 * 不符合你的手感時用元素屬性 `double-tap-ms` / `double-tap-distance` 覆寫。
 */
export const IOS_GESTURE_OPTIONS: GestureOptions = {
  ...DEFAULT_GESTURE_OPTIONS,
  // 手指按下時會自然滑動：8 px 會把不少點擊判成拖曳（第二下變 pan，雙擊就湊不成）；18 px 與 Flutter 的 kTouchSlop 一致
  slop: 18,
  doubleTapMs: 300,
  doubleTapDistance: 80,
}

/** 這個環境是不是 iOS 觸控（iPhone、iPad；iPadOS 的 UA 會自稱 Macintosh，所以另看觸控點數）。 */
export const isIosTouch = (nav: { userAgent: string, platform?: string, maxTouchPoints?: number } | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean => {
  if (!nav) {
    return false
  }
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)
}

interface Point {
  x: number
  y: number
}

/** 計時器介面；測試時注入假的。 */
export interface Scheduler {
  now: () => number
  setTimeout: (callback: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const realScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

export class GestureRecognizer {
  private readonly pointers = new Map<number, Point>()
  private origin: Point | null = null
  private last: Point | null = null
  private panning = false
  private longPressed = false
  private longPressTimer: unknown = null
  /** 互斥模式下，放開後等待雙擊視窗的第一下；視窗過了或確定不是雙擊時才送出 `tap`。 */
  private pendingTap: { at: number, point: Point, timer: unknown } | null = null
  /** 目前這一下按下，是否符合「接在 pendingTap 之後的第二下」的條件（間隔與距離）。 */
  private secondPress = false
  private lastTap: { at: number, point: Point } | null = null
  /** 這一次按下的時刻；雙擊間隔從「第一下放開」算到「第二下按下」（與系統手勢一致），不含按住的時間。 */
  private downAt = 0

  private pinchStartDistance = 0
  private pinching = false

  constructor(
    private readonly emit: (gesture: AqutterNativeGesture) => void,
    /** 元素目前的 CSS 尺寸；每次事件重新讀取，因為元素可能被縮放。 */
    private readonly size: () => { width: number, height: number },
    private readonly options: GestureOptions = DEFAULT_GESTURE_OPTIONS,
    private readonly scheduler: Scheduler = realScheduler,
  ) {}

  private normalize(point: Point): Point {
    const { width, height } = this.size()
    return { x: width > 0 ? point.x / width : 0, y: height > 0 ? point.y / height : 0 }
  }

  private center(): Point {
    const points = [...this.pointers.values()]
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    }
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()]
    return distance(a, b)
  }

  private clearLongPress(): void {
    if (this.longPressTimer !== null) {
      this.scheduler.clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }
  }

  /** [time]：事件發生的時刻（毫秒，單調）。傳 `event.timeStamp`；省略則用處理當下的時鐘。 */
  pointerDown(id: number, point: Point, time?: number): void {
    this.pointers.set(id, point)
    if (this.pointers.size === 1) {
      this.origin = point
      this.last = point
      this.panning = false
      this.longPressed = false
      this.downAt = time ?? this.scheduler.now()
      this.checkSecondPress(point)
      this.longPressTimer = this.scheduler.setTimeout(() => {
        this.longPressTimer = null
        if (!this.panning && this.origin) {
          this.longPressed = true
          this.flushPendingTap()
          const n = this.normalize(this.origin)
          this.emit({ type: 'longPress', x: n.x, y: n.y })
        }
      }, this.options.longPressMs)
      return
    }
    if (this.pointers.size === 2) {
      this.clearLongPress()
      this.flushPendingTap()
      this.endPan()
      this.pinching = true
      this.pinchStartDistance = Math.max(this.pinchDistance(), 1)
      const c = this.normalize(this.center())
      this.emit({ type: 'pinch', phase: 'start', scale: 1, x: c.x, y: c.y })
    }
  }

  pointerMove(id: number, point: Point): void {
    if (!this.pointers.has(id)) {
      return
    }
    this.pointers.set(id, point)
    if (this.pinching && this.pointers.size >= 2) {
      const c = this.normalize(this.center())
      this.emit({ type: 'pinch', phase: 'update', scale: this.pinchDistance() / this.pinchStartDistance, x: c.x, y: c.y })
      return
    }
    if (this.pointers.size !== 1 || !this.origin || !this.last) {
      return
    }
    if (!this.panning) {
      if (distance(point, this.origin) < this.options.slop) {
        return
      }
      this.clearLongPress()
      this.flushPendingTap()
      this.panning = true
      const n = this.normalize(point)
      this.emit({ type: 'pan', phase: 'start', x: n.x, y: n.y, dx: 0, dy: 0 })
      this.last = point
      return
    }
    const { width, height } = this.size()
    const to = this.normalize(point)
    const delta = { dx: width > 0 ? (point.x - this.last.x) / width : 0, dy: height > 0 ? (point.y - this.last.y) / height : 0 }
    this.last = point
    this.emit({ type: 'pan', phase: 'update', x: to.x, y: to.y, ...delta })
  }

  pointerUp(id: number, point: Point, time?: number): void {
    if (!this.pointers.has(id)) {
      return
    }
    this.pointers.delete(id)
    if (this.pinching) {
      if (this.pointers.size < 2) {
        const c = this.normalize(point)
        this.emit({ type: 'pinch', phase: 'end', scale: 1, x: c.x, y: c.y })
        this.pinching = false
        // 剩下的手指不再接續成 pan／tap：避免收尾時誤觸
        this.origin = null
        this.last = null
      }
      return
    }
    this.clearLongPress()
    if (this.panning) {
      this.endPan()
    }
    else if (!this.longPressed && this.origin) {
      this.finishTap(this.origin, time ?? this.scheduler.now())
    }
    this.origin = null
    this.last = null
  }

  /** 目前記著的按下中指標數；手指已全部離開卻仍大於 0，代表有殘留。 */
  get activeCount(): number {
    return this.pointers.size
  }

  /** 系統取消（例如指標被攔截）：收尾進行中的手勢，不送 tap。 */
  cancel(): void {
    this.clearLongPress()
    this.flushPendingTap()
    if (this.panning) {
      this.endPan()
    }
    if (this.pinching) {
      this.pinching = false
      this.emit({ type: 'pinch', phase: 'end', scale: 1, x: 0.5, y: 0.5 })
    }
    this.pointers.clear()
    this.origin = null
    this.last = null
  }

  private endPan(): void {
    if (!this.panning) {
      return
    }
    this.panning = false
    const n = this.normalize(this.last ?? { x: 0, y: 0 })
    this.emit({ type: 'pan', phase: 'end', x: n.x, y: n.y, dx: 0, dy: 0 })
  }

  private finishTap(point: Point, now: number): void {
    const n = this.normalize(point)
    const mode = this.options.doubleTap
    if (mode === 'off') {
      this.emit({ type: 'tap', x: n.x, y: n.y })
      return
    }
    if (mode === 'exclusive') {
      if (this.pendingTap && this.secondPress) {
        // 第二下是雙擊：只送 doubleTap，第一下被它取代（不會有 tap）
        this.pendingTap = null
        this.secondPress = false
        this.emit({ type: 'doubleTap', x: n.x, y: n.y })
        return
      }
      this.flushPendingTap()
      // 等雙擊視窗：期間若接著一次符合條件的按下，這一下就變成雙擊的第一下
      // 計時器多留一點寬限：頁面忙時第二下的事件會晚到，是否為雙擊仍以事件時間戳的間隔判斷，
      // 計時器若剛好先過期，單擊就先送出、雙擊被拆成兩下
      const timer = this.scheduler.setTimeout(() => this.flushPendingTap(), this.options.doubleTapMs + DOUBLE_TAP_GRACE_MS)
      this.pendingTap = { at: now, point, timer }
      return
    }
    // both：每一下立刻送 tap；第二下之後再送 doubleTap
    const previous = this.lastTap
    const gap = previous ? this.downAt - previous.at : Infinity
    this.emit({ type: 'tap', x: n.x, y: n.y })
    if (previous && gap >= this.options.doubleTapMinMs && gap <= this.options.doubleTapMs && distance(previous.point, point) <= this.options.doubleTapDistance) {
      this.lastTap = null
      this.emit({ type: 'doubleTap', x: n.x, y: n.y })
      return
    }
    this.lastTap = { at: now, point }
  }

  /** 互斥模式：這一下按下是否接在等待中的第一下之後、且間隔與距離都符合雙擊；不符合就把等待中的單擊送出。 */
  private checkSecondPress(point: Point): void {
    const pending = this.pendingTap
    if (!pending) {
      this.secondPress = false
      return
    }
    const gap = this.downAt - pending.at
    const near = distance(pending.point, point) <= this.options.doubleTapDistance
    if (gap >= this.options.doubleTapMinMs && gap <= this.options.doubleTapMs && near) {
      // 先別送單擊：等這一下放開，若確實是一次點擊就是雙擊；視窗計時器停掉，避免在這一下按住期間過期
      this.scheduler.clearTimeout(pending.timer)
      this.secondPress = true
      return
    }
    this.flushPendingTap()
  }

  /** 送出等待中的單擊（互斥模式）；沒有等待中的就什麼都不做。 */
  private flushPendingTap(): void {
    const pending = this.pendingTap
    this.secondPress = false
    if (!pending) {
      return
    }
    this.scheduler.clearTimeout(pending.timer)
    this.pendingTap = null
    const n = this.normalize(pending.point)
    this.emit({ type: 'tap', x: n.x, y: n.y })
  }
}
