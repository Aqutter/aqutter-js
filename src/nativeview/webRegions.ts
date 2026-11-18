/**
 * 穿透元素的「網頁區域」取樣：元素矩形內，哪些地方的觸控要留給網頁（疊在上面的按鈕、面板）。
 *
 * 原生端（iOS）拿到這份清單後，把元素矩形扣掉網頁區域的部分直接交給原生 view，其餘照舊進 WebView。
 * 以 `document.elementFromPoint` 取樣，所以 `pointer-events`、堆疊順序與不透明覆蓋都照 DOM 的語意。
 */

/** 一個網頁區域，CSS 像素，相對元素左上角。 */
export interface AqutterWebRegion {
  x: number
  y: number
  width: number
  height: number
}

/** 取樣格的邊長（CSS 像素）。 */
export const WEB_REGION_STEP = 8

/** 回報的區域數量上限，超過時改用較粗的外框。 */
export const MAX_WEB_REGIONS = 64

/** 同一組格子（欄起迄）；`[from, to)`。 */
type Run = readonly [number, number]

interface Band {
  top: number
  bottom: number
  runs: Run[]
}

const sameRuns = (a: Run[], b: Run[]): boolean =>
  a.length === b.length && a.every((run, index) => run[0] === b[index]![0] && run[1] === b[index]![1])

/** 把格子（`true`＝網頁）合成橫帶：每列連續的網頁格合成一段，上下相同的列合併。 */
const toBands = (grid: boolean[][]): Band[] => {
  const bands: Band[] = []
  grid.forEach((row, rowIndex) => {
    const runs: Run[] = []
    let start = -1
    row.forEach((web, column) => {
      if (web && start < 0) {
        start = column
      }
      if (!web && start >= 0) {
        runs.push([start, column])
        start = -1
      }
    })
    if (start >= 0) {
      runs.push([start, row.length])
    }
    if (runs.length === 0) {
      return
    }
    const last = bands.at(-1)
    if (last && last.bottom === rowIndex && sameRuns(last.runs, runs)) {
      last.bottom = rowIndex + 1
    }
    else {
      bands.push({ top: rowIndex, bottom: rowIndex + 1, runs })
    }
  })
  return bands
}

/** 把格子座標換成相對元素左上角的矩形（最後一欄／列可能不滿一格，要裁到元素大小）。 */
const toRegion = (column: number, row: number, columns: number, rows: number, width: number, height: number): AqutterWebRegion => ({
  x: column * WEB_REGION_STEP,
  y: row * WEB_REGION_STEP,
  width: Math.min(columns * WEB_REGION_STEP, width) - column * WEB_REGION_STEP,
  height: Math.min(rows * WEB_REGION_STEP, height) - row * WEB_REGION_STEP,
})

/**
 * 把格子網格轉成區域清單。超過 [MAX_WEB_REGIONS] 時改取每個橫帶的外框（網頁區域只會變大，原生觸控更保守），
 * 還是超過就用整體外框。`width`、`height` 是元素（被裁到視窗內的部分）的大小。
 */
export const gridToRegions = (grid: boolean[][], width: number, height: number): AqutterWebRegion[] => {
  const rows = grid.length
  const columns = grid[0]?.length ?? 0
  const bands = toBands(grid)
  const exact = bands.flatMap(band => band.runs.map(run =>
    toRegion(run[0], band.top, run[1], band.bottom, width, height)))
  if (exact.length <= MAX_WEB_REGIONS) {
    return exact
  }
  const boxes = bands.map(band =>
    toRegion(band.runs[0]![0], band.top, band.runs.at(-1)![1], band.bottom, width, height))
  if (boxes.length <= MAX_WEB_REGIONS) {
    return boxes
  }
  const left = Math.min(...bands.map(band => band.runs[0]![0]))
  const right = Math.max(...bands.map(band => band.runs.at(-1)![1]))
  return [toRegion(left, bands[0]!.top, right, bands.at(-1)!.bottom, width, height)].filter(() => columns > 0 && rows > 0)
}

/** 取樣用的命中函式；測試時可注入。 */
export type HitTest = (x: number, y: number) => Element | null

/**
 * 取樣元素目前的網頁區域。命中元素本身（含 shadow 內部，`elementFromPoint` 會重新指向宿主）或沒有命中任何元素
 * 的格子算原生，其餘算網頁。環境沒有 `document.elementFromPoint` 時回 `undefined`（無法取樣，等於不支援）。
 */
export const sampleWebRegions = (element: Element, hit?: HitTest): AqutterWebRegion[] | undefined => {
  const hitTest = hit ?? (typeof document !== 'undefined' && typeof document.elementFromPoint === 'function'
    ? (x: number, y: number) => document.elementFromPoint(x, y)
    : undefined)
  if (!hitTest) {
    return undefined
  }
  const rect = element.getBoundingClientRect()
  const viewportWidth = typeof window === 'undefined' ? rect.right : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? rect.bottom : window.innerHeight
  // 視窗外的部分手指碰不到，不取樣；座標仍以元素左上角為原點，所以區域不受裁切影響
  const left = Math.max(rect.left, 0)
  const top = Math.max(rect.top, 0)
  const right = Math.min(rect.right, viewportWidth)
  const bottom = Math.min(rect.bottom, viewportHeight)
  const width = right - left
  const height = bottom - top
  if (!(width > 0 && height > 0)) {
    return []
  }
  const columns = Math.ceil(width / WEB_REGION_STEP)
  const rows = Math.ceil(height / WEB_REGION_STEP)
  const grid: boolean[][] = []
  for (let row = 0; row < rows; row++) {
    const cells: boolean[] = []
    const y = top + Math.min((row + 0.5) * WEB_REGION_STEP, height - 0.5)
    for (let column = 0; column < columns; column++) {
      const x = left + Math.min((column + 0.5) * WEB_REGION_STEP, width - 0.5)
      const found = hitTest(x, y)
      cells.push(found !== null && found !== element && !element.contains(found))
    }
    grid.push(cells)
  }
  // 格子座標是相對「被裁過的矩形」；換回相對元素左上角
  const regions = gridToRegions(grid, width, height)
  const offsetX = left - rect.left
  const offsetY = top - rect.top
  return regions.map(region => ({ ...region, x: region.x + offsetX, y: region.y + offsetY }))
}
