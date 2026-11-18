// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AQUTTER_BG_ATTRIBUTE, clearAncestorBackgrounds, readCornerRadii, roundedRectSvg, startSeeThrough } from '../src/nativeview/seeThrough'
import type { AqutterNativeLayout } from '../src/nativeview'

const layout = (patch: Partial<AqutterNativeLayout> = {}): AqutterNativeLayout => ({
  type: 'layout',
  left: 40,
  top: 200,
  width: 320,
  height: 300,
  visible: true,
  sentAt: 0,
  ...patch,
})

const rectOf = (left: number, top: number, width: number, height: number) => (): DOMRect =>
  ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

describe('clearAncestorBackgrounds', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
    document.body.removeAttribute('style')
    document.body.innerHTML = '<div id="wrapper"><div id="self"></div></div>'
  })
  afterEach(() => {
    document.documentElement.removeAttribute('style')
  })

  it('makes opaque ancestors transparent and restores their inline styles', () => {
    document.documentElement.setAttribute('style', 'background-color: rgb(1, 2, 3)')
    document.body.setAttribute('style', 'background-image: linear-gradient(red, blue)')
    const wrapper = document.getElementById('wrapper') as HTMLElement
    wrapper.setAttribute('style', 'background-color: rgba(0, 0, 0, 0.5); color: red')
    const self = document.getElementById('self') as HTMLElement

    const restore = clearAncestorBackgrounds(self)
    expect(document.documentElement.style.getPropertyValue('background-color')).toBe('transparent')
    expect(document.documentElement.style.getPropertyPriority('background-color')).toBe('important')
    expect(document.body.style.getPropertyValue('background-image')).toBe('none')
    expect(wrapper.style.getPropertyValue('background-color')).toBe('rgba(0, 0, 0, 0.5)')

    restore()
    expect(document.documentElement.style.getPropertyValue('background-color')).toBe('rgb(1, 2, 3)')
    expect(document.documentElement.style.getPropertyPriority('background-color')).toBe('')
    expect(document.body.style.getPropertyValue('background-image')).toContain('linear-gradient')
    expect(wrapper.style.getPropertyValue('color')).toBe('red')
  })

  it('leaves already transparent ancestors alone', () => {
    const self = document.getElementById('self') as HTMLElement
    const restore = clearAncestorBackgrounds(self)
    expect(document.body.getAttribute('style') ?? '').toBe('')
    restore()
  })

  it('does not touch the element itself', () => {
    const self = document.getElementById('self') as HTMLElement
    self.setAttribute('style', 'background-color: rgb(9, 9, 9)')
    const restore = clearAncestorBackgrounds(self)
    expect(self.style.getPropertyValue('background-color')).toBe('rgb(9, 9, 9)')
    restore()
  })

  it('looks through a shadow root to its host', () => {
    document.body.innerHTML = '<div id="host" style="background-color: rgb(1, 2, 3)"></div>'
    const host = document.getElementById('host') as HTMLElement
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<div id="inner"></div>'
    const restore = clearAncestorBackgrounds(root.getElementById('inner') as HTMLElement)
    expect(host.style.getPropertyValue('background-color')).toBe('transparent')
    restore()
    expect(host.style.getPropertyValue('background-color')).toBe('rgb(1, 2, 3)')
  })
})

describe('roundedRectSvg / readCornerRadii', () => {
  it('builds a path with the requested corner radii', () => {
    const svg = roundedRectSvg(100, 50, [10, 20, 5, 0])
    expect(svg).toContain('width="100"')
    expect(svg).toContain('height="50"')
    expect(svg).toContain('M10 0H80A20 20 0 0 1 100 20')
  })

  it('reads each corner (px and %) and clamps to half of the smaller side', () => {
    document.body.innerHTML = '<div id="e" style="border-top-left-radius: 40px; border-top-right-radius: 50%; border-bottom-right-radius: 500px; border-bottom-left-radius: 0"></div>'
    const element = document.getElementById('e') as HTMLElement
    expect(readCornerRadii(element, 200, 100)).toEqual([40, 50, 50, 0])
  })
})

describe('startSeeThrough marked layers', () => {
  let element: HTMLElement
  let layer: HTMLElement

  beforeEach(() => {
    document.documentElement.removeAttribute('style')
    document.body.innerHTML = `<div id="bg" ${AQUTTER_BG_ATTRIBUTE} style="background: red"></div><div id="wrapper"><div id="self" style="border-radius: 24px"></div></div>`
    element = document.getElementById('self') as HTMLElement
    layer = document.getElementById('bg') as HTMLElement
    layer.getBoundingClientRect = rectOf(0, 0, 400, 800)
  })

  it('cuts a hole at the element rect, relative to the layer, and follows updates', () => {
    const seeThrough = startSeeThrough(element)
    seeThrough.update(layout())
    expect(layer.style.getPropertyValue('mask-composite')).toBe('exclude')
    expect(layer.style.getPropertyValue('mask-position')).toBe('0 0, 40px 200px')
    expect(layer.style.getPropertyValue('mask-size')).toBe('100% 100%, 320px 300px')
    expect(decodeURIComponent(layer.style.getPropertyValue('mask-image'))).toContain('A24 24')

    seeThrough.update(layout({ top: 120 }))
    expect(layer.style.getPropertyValue('mask-position')).toBe('0 0, 40px 120px')
    seeThrough.stop()
  })

  it('offsets the hole by the layer position', () => {
    layer.getBoundingClientRect = rectOf(10, 50, 400, 800)
    const seeThrough = startSeeThrough(element)
    seeThrough.update(layout())
    expect(layer.style.getPropertyValue('mask-position')).toBe('0 0, 30px 150px')
    seeThrough.stop()
  })

  it('removes the mask while the element is not visible and when stopped', () => {
    const seeThrough = startSeeThrough(element)
    seeThrough.update(layout())
    seeThrough.update(layout({ visible: false }))
    expect(layer.style.getPropertyValue('mask-image')).toBe('')
    seeThrough.update(layout())
    expect(layer.style.getPropertyValue('mask-image')).not.toBe('')
    seeThrough.stop()
    expect(layer.style.getPropertyValue('mask-image')).toBe('')
    expect(layer.style.getPropertyValue('background')).toBe('red')
  })

  it('ignores a marked layer that is an ancestor of the element', () => {
    document.body.innerHTML = `<div id="bg" ${AQUTTER_BG_ATTRIBUTE}><div id="self"></div></div>`
    const inner = document.getElementById('self') as HTMLElement
    const wrapper = document.getElementById('bg') as HTMLElement
    const seeThrough = startSeeThrough(inner)
    seeThrough.update(layout())
    expect(wrapper.style.getPropertyValue('mask-image')).toBe('')
    seeThrough.stop()
  })

  it('picks up layers added later and restores layers whose mark is removed', async () => {
    const seeThrough = startSeeThrough(element)
    seeThrough.update(layout())
    const late = document.createElement('div')
    late.setAttribute(AQUTTER_BG_ATTRIBUTE, '')
    late.getBoundingClientRect = rectOf(0, 0, 400, 800)
    document.body.append(late)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(late.style.getPropertyValue('mask-composite')).toBe('exclude')

    layer.removeAttribute(AQUTTER_BG_ATTRIBUTE)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(layer.style.getPropertyValue('mask-image')).toBe('')
    seeThrough.stop()
    expect(late.style.getPropertyValue('mask-image')).toBe('')
  })

  it('does nothing after stop', () => {
    const seeThrough = startSeeThrough(element)
    seeThrough.stop()
    seeThrough.update(layout())
    expect(layer.style.getPropertyValue('mask-image')).toBe('')
  })
})
