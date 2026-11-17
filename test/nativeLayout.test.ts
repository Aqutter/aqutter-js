// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cssColorAlpha, detectPageReady, measureLayout, trackLayout } from '../src/nativeview'
import type { AqutterNativeLayout } from '../src/nativeview'

describe('cssColorAlpha', () => {
  it.each([
    ['', 0],
    ['transparent', 0],
    ['rgba(0, 0, 0, 0)', 0],
    ['rgba(0, 0, 0, 0.5)', 0.5],
    ['rgb(255, 255, 255)', 1],
    ['rgb(0 0 0 / 50%)', 0.5],
    ['rgb(0 0 0 / 0.25)', 0.25],
    ['color(srgb 1 1 1 / 0.2)', 0.2],
    ['hsla(120, 100%, 50%, 0.3)', 0.3],
    ['#ffffff', 1],
    ['red', 1],
    ['something-new(1 2 3)', 1],
  ])('%s -> %s', (value, alpha) => {
    expect(cssColorAlpha(value)).toBeCloseTo(alpha)
  })

  it('clamps out-of-range alpha and treats garbage as opaque', () => {
    expect(cssColorAlpha('rgba(0, 0, 0, 2)')).toBe(1)
    expect(cssColorAlpha('rgba(0, 0, 0, -1)')).toBe(0)
    expect(cssColorAlpha('rgb(0 0 0 / nope)')).toBe(1)
  })
})

describe('detectPageReady', () => {
  const build = (styles: Partial<Record<'html' | 'body' | 'wrapper' | 'self', string>>): HTMLElement => {
    document.documentElement.setAttribute('style', styles.html ?? '')
    document.body.setAttribute('style', styles.body ?? '')
    document.body.innerHTML = `<div id="wrapper" style="${styles.wrapper ?? ''}"><div id="self" style="${styles.self ?? ''}"></div></div>`
    return document.getElementById('self') as HTMLElement
  }

  it('is ready when no ancestor paints a background', () => {
    expect(detectPageReady(build({}))).toBe(true)
  })

  it('is ready with a translucent or transparent background', () => {
    expect(detectPageReady(build({ wrapper: 'background-color: rgba(0, 0, 0, 0.5)' }))).toBe(true)
    expect(detectPageReady(build({ body: 'background-color: transparent' }))).toBe(true)
  })

  it('is not ready when any ancestor up to <html> has an opaque background color', () => {
    expect(detectPageReady(build({ wrapper: 'background-color: rgb(255, 255, 255)' }))).toBe(false)
    expect(detectPageReady(build({ body: 'background-color: #101010' }))).toBe(false)
    expect(detectPageReady(build({ html: 'background-color: black' }))).toBe(false)
  })

  it('is not ready when an ancestor has a background image', () => {
    expect(detectPageReady(build({ wrapper: 'background-image: linear-gradient(red, blue)' }))).toBe(false)
  })

  it('looks only at ancestors, not at the element itself', () => {
    expect(detectPageReady(build({ self: 'background-color: rgb(255, 0, 0)' }))).toBe(true)
  })

  it('looks through a shadow root to its host', () => {
    document.body.innerHTML = '<div id="host" style="background-color: rgb(1, 2, 3)"></div>'
    const host = document.getElementById('host') as HTMLElement
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<div id="inner"></div>'
    expect(detectPageReady(root.getElementById('inner') as HTMLElement)).toBe(false)
  })
})

describe('measureLayout / trackLayout', () => {
  let frames: (() => void)[]
  let rect: { left: number, top: number, width: number, height: number }
  let element: HTMLElement

  beforeEach(() => {
    frames = []
    rect = { left: 40, top: 200, width: 320, height: 300 }
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    document.body.innerHTML = '<div id="hole"></div>'
    element = document.getElementById('hole') as HTMLElement
    element.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  const flush = (): void => frames.splice(0).forEach(callback => callback())

  it('measures the rect with visibility and a timestamp', () => {
    const layout = measureLayout(element)
    expect(layout).toMatchObject({ type: 'layout', left: 40, top: 200, width: 320, height: 300, visible: true })
    expect(typeof layout.sentAt).toBe('number')
  })

  it('is not visible when collapsed, detached, or the page is hidden', () => {
    rect.width = 0
    expect(measureLayout(element).visible).toBe(false)
    rect.width = 320
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    expect(measureLayout(element).visible).toBe(false)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    element.remove()
    expect(measureLayout(element).visible).toBe(false)
  })

  it('reports immediately, then once per frame after a scroll, and skips identical rects', () => {
    const sent: AqutterNativeLayout[] = []
    const tracker = trackLayout(element, (layout) => {
      sent.push(layout)
      return true
    })
    expect(sent).toHaveLength(1)

    rect.top = 150
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    expect(frames).toHaveLength(1)
    flush()
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({ top: 150 })

    window.dispatchEvent(new Event('scroll'))
    flush()
    expect(sent).toHaveLength(2)
    tracker.stop()
  })

  it('catches scrolls of any ancestor (capture phase)', () => {
    const sent: AqutterNativeLayout[] = []
    const tracker = trackLayout(element, (layout) => {
      sent.push(layout)
      return true
    })
    rect.top = 10
    document.body.dispatchEvent(new Event('scroll'))
    flush()
    expect(sent).toHaveLength(2)
    tracker.stop()
  })

  it('reports again when the page becomes hidden', () => {
    const sent: AqutterNativeLayout[] = []
    const tracker = trackLayout(element, (layout) => {
      sent.push(layout)
      return true
    })
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    flush()
    expect(sent.at(-1)?.visible).toBe(false)
    tracker.stop()
  })

  it('does not record a rejected send, and flush forces a resend', () => {
    let accept = false
    const sent: AqutterNativeLayout[] = []
    const tracker = trackLayout(element, (layout) => {
      sent.push(layout)
      return accept
    })
    expect(sent).toHaveLength(1)
    window.dispatchEvent(new Event('scroll'))
    flush()
    expect(sent).toHaveLength(2)

    accept = true
    tracker.flush()
    expect(sent).toHaveLength(3)
    window.dispatchEvent(new Event('scroll'))
    flush()
    expect(sent).toHaveLength(3)
    tracker.stop()
  })

  it('stops reporting after stop()', () => {
    const sent: AqutterNativeLayout[] = []
    const tracker = trackLayout(element, (layout) => {
      sent.push(layout)
      return true
    })
    tracker.stop()
    rect.top = 5
    window.dispatchEvent(new Event('scroll'))
    flush()
    expect(sent).toHaveLength(1)
  })
})
