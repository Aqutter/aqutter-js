// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_WEB_REGIONS, sampleWebRegions, trackLayout, WEB_REGION_STEP } from '../src/nativeview'
import type { AqutterNativeLayout, AqutterWebRegion } from '../src/nativeview'

describe('sampleWebRegions / trackLayout webRegions', () => {
  let rect: { left: number, top: number, width: number, height: number }
  let element: HTMLElement
  let overlay: HTMLElement
  let frames: (() => void)[]
  const originalHit = document.elementFromPoint

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'Date', 'performance'] })
    frames = []
    rect = { left: 40, top: 200, width: 320, height: 300 }
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    document.body.innerHTML = '<div id="map"></div><div id="overlay"></div>'
    element = document.getElementById('map') as HTMLElement
    overlay = document.getElementById('overlay') as HTMLElement
    element.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.elementFromPoint = originalHit
  })

  const flush = (): void => frames.splice(0).forEach(callback => callback())

  /** 元素內 y 相對座標達到 [from] 的地方由 overlay 命中，其餘命中元素本身。 */
  const stripBelow = (from: number) => (x: number, y: number): Element | null => (y - rect.top >= from ? overlay : element)

  it('returns nothing when everything hits the element, its children, or nothing at all', () => {
    const child = document.createElement('span')
    element.append(child)
    expect(sampleWebRegions(element, () => element)).toEqual([])
    expect(sampleWebRegions(element, () => child)).toEqual([])
    expect(sampleWebRegions(element, () => null)).toEqual([])
  })

  it('reports a strip of web content as one region relative to the element', () => {
    // 格中心 4 + 8r >= 250 → 第 31 列開始（y = 248），最後一列只有 4px
    expect(sampleWebRegions(element, stripBelow(250))).toEqual([{ x: 0, y: 248, width: 320, height: 52 }])
  })

  it('splits around a hole and keeps regions disjoint', () => {
    const hit = (x: number, y: number): Element | null => (x - rect.left >= 100 && x - rect.left < 140 && y - rect.top >= 100 && y - rect.top < 140 ? overlay : element)
    const regions = sampleWebRegions(element, hit)!
    expect(regions).toEqual([{ x: 96, y: 96, width: 40, height: 40 }])
  })

  it('merges to coarser boxes when there are too many regions, never shrinking the web area', () => {
    // 棋盤：每隔一格一個網頁格，精確表示遠超過上限
    const hit = (x: number, y: number): Element | null =>
      (Math.floor((x - rect.left) / WEB_REGION_STEP) + Math.floor((y - rect.top) / WEB_REGION_STEP)) % 2 === 0 ? overlay : element
    const regions = sampleWebRegions(element, hit)!
    expect(regions.length).toBeLessThanOrEqual(MAX_WEB_REGIONS)
    expect(regions.length).toBeGreaterThan(0)
    const covered = (x: number, y: number): boolean => regions.some((r: AqutterWebRegion) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height)
    for (let row = 0; row < 37; row++) {
      for (let column = 0; column < 40; column++) {
        if ((row + column) % 2 === 0) {
          expect(covered(column * WEB_REGION_STEP + 1, row * WEB_REGION_STEP + 1)).toBe(true)
        }
      }
    }
  })

  it('only samples the part inside the viewport and keeps coordinates relative to the element', () => {
    rect = { left: -100, top: 200, width: 320, height: 40 }
    expect(sampleWebRegions(element, () => overlay)).toEqual([{ x: 100, y: 0, width: 220, height: 40 }])
    rect = { left: 40, top: 5000, width: 320, height: 40 }
    expect(sampleWebRegions(element, () => overlay)).toEqual([])
  })

  it('cannot sample without elementFromPoint', () => {
    document.elementFromPoint = undefined as unknown as typeof document.elementFromPoint
    expect(sampleWebRegions(element)).toBeUndefined()
  })

  describe('trackLayout', () => {
    const track = (sent: AqutterNativeLayout[], sampleRegions = true) =>
      trackLayout(element, (layout) => {
        sent.push(layout)
        return true
      }, { sampleRegions })

    it('adds webRegions only when asked to', () => {
      document.elementFromPoint = (x, y) => stripBelow(250)(x, y)
      const off: AqutterNativeLayout[] = []
      track(off, false).stop()
      expect(off[0]).not.toHaveProperty('webRegions')

      const on: AqutterNativeLayout[] = []
      track(on).stop()
      expect(on[0]!.webRegions).toEqual([{ x: 0, y: 248, width: 320, height: 52 }])
    })

    it('omits the field when the environment cannot sample', () => {
      document.elementFromPoint = undefined as unknown as typeof document.elementFromPoint
      const sent: AqutterNativeLayout[] = []
      track(sent).stop()
      expect(sent[0]).not.toHaveProperty('webRegions')
    })

    it('sends an empty list when the element is not visible', () => {
      document.elementFromPoint = () => overlay
      rect.width = 0
      const sent: AqutterNativeLayout[] = []
      track(sent).stop()
      expect(sent[0]).toMatchObject({ visible: false, webRegions: [] })
    })

    it('throttles resampling to once per interval and resends when the regions change', () => {
      let from = 250
      document.elementFromPoint = (x, y) => stripBelow(from)(x, y)
      const sent: AqutterNativeLayout[] = []
      const tracker = track(sent)
      expect(sent).toHaveLength(1)

      from = 100
      window.dispatchEvent(new Event('scroll'))
      flush()
      expect(sent).toHaveLength(1)

      vi.advanceTimersByTime(150)
      flush()
      expect(sent).toHaveLength(2)
      expect(sent[1]!.webRegions).toEqual([{ x: 0, y: 96, width: 320, height: 204 }])
      tracker.stop()
    })

    it('resamples when the DOM around the element changes', async () => {
      let from = 250
      document.elementFromPoint = (x, y) => stripBelow(from)(x, y)
      const sent: AqutterNativeLayout[] = []
      const tracker = track(sent)
      from = 200
      vi.advanceTimersByTime(150)
      overlay.setAttribute('class', 'changed')
      // happy-dom 的 MutationObserver 用自己的計時器送達，等到它排了下一個動畫畫面
      await vi.waitFor(() => expect(frames.length).toBeGreaterThan(0))
      flush()
      expect(sent).toHaveLength(2)
      expect(sent[1]!.webRegions![0]!.y).toBe(200)
      tracker.stop()
    })

    it('stop cancels a pending resample', () => {
      document.elementFromPoint = () => element
      const sent: AqutterNativeLayout[] = []
      const tracker = track(sent)
      window.dispatchEvent(new Event('scroll'))
      flush()
      tracker.stop()
      vi.advanceTimersByTime(500)
      flush()
      expect(sent).toHaveLength(1)
    })
  })
})
