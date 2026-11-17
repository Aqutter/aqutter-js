// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AQUTTER_NATIVE_TAG, defineAqutterNative } from '../src/nativeview'
import type { AqutterNativeElement } from '../src/nativeview'

class FakeSocket {
  static readonly OPEN = 1
  static instances: FakeSocket[] = []
  readyState = 1
  binaryType = ''
  sent: string[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
  }

  get messages(): { type: string, [key: string]: unknown }[] {
    return this.sent.map(raw => JSON.parse(raw))
  }

  reply(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

type Host = AqutterNativeElement & HTMLElement

const mountElement = async (attributes: Record<string, string> = {}): Promise<{ element: Host, socket: FakeSocket }> => {
  const element = document.createElement(AQUTTER_NATIVE_TAG) as Host
  element.setAttribute('session', 'map')
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }
  Object.defineProperty(element, 'clientWidth', { value: 200, configurable: true })
  Object.defineProperty(element, 'clientHeight', { value: 100, configurable: true })
  element.getBoundingClientRect = () => ({ left: 20, top: 10, width: 200, height: 100, right: 220, bottom: 110, x: 20, y: 10, toJSON: () => ({}) })
  const before = FakeSocket.instances.length
  document.body.append(element)
  await vi.waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(before))
  const socket = FakeSocket.instances.at(-1) as FakeSocket
  socket.onopen?.()
  return { element, socket }
}

describe('<aqutter-native> mode', () => {
  let frames: (() => void)[]

  beforeEach(() => {
    FakeSocket.instances = []
    frames = []
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('aqutterEndpoint', { port: 1234, token: 't' })
    ;(window as unknown as { aqutterEndpoint: unknown }).aqutterEndpoint = { port: 1234, token: 't' }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ putImageData: () => {}, drawImage: () => {} } as unknown as CanvasRenderingContext2D)
    document.body.innerHTML = ''
    defineAqutterNative()
  })
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const flush = (): void => frames.splice(0).forEach(callback => callback())
  const canvasOf = (element: Host): HTMLCanvasElement | null => element.shadowRoot?.querySelector('canvas') ?? null

  it('requests auto by default and reports pageReady from the DOM', async () => {
    const { socket } = await mountElement()
    expect(socket.messages[0]).toEqual({ type: 'mode', request: 'auto', pageReady: true })
  })

  it('reports pageReady false when an ancestor is opaque', async () => {
    document.body.style.backgroundColor = 'rgb(255, 255, 255)'
    const { socket } = await mountElement({ mode: 'auto' })
    expect(socket.messages[0]).toMatchObject({ request: 'auto', pageReady: false })
    document.body.removeAttribute('style')
  })

  it('sends the attribute value as the request, and treats an invalid value as auto (one warning)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mirror = await mountElement({ mode: 'mirror' })
    expect(mirror.socket.messages[0]).toMatchObject({ request: 'mirror' })
    const passthrough = await mountElement({ mode: 'passthrough' })
    expect(passthrough.socket.messages[0]).toMatchObject({ request: 'passthrough' })
    const bad = await mountElement({ mode: 'sideways' })
    expect(bad.socket.messages[0]).toMatchObject({ request: 'auto' })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('passthrough: removes the canvas, fires aqutter-mode, and reports its layout', async () => {
    const { element, socket } = await mountElement()
    const events: unknown[] = []
    element.addEventListener('aqutter-mode', event => events.push((event as CustomEvent).detail))
    expect(canvasOf(element)).not.toBeNull()

    socket.reply({ type: 'mode', mode: 'passthrough' })
    expect(events).toEqual([{ mode: 'passthrough' }])
    expect(element.effectiveMode).toBe('passthrough')
    expect(canvasOf(element)).toBeNull()
    const layouts = socket.messages.filter(message => message.type === 'layout')
    expect(layouts).toHaveLength(1)
    expect(layouts[0]).toMatchObject({ left: 20, top: 10, width: 200, height: 100, visible: true })
  })

  it('mirror: keeps the canvas and does not report a layout', async () => {
    const { element, socket } = await mountElement()
    const events: unknown[] = []
    element.addEventListener('aqutter-mode', event => events.push((event as CustomEvent).detail))
    socket.reply({ type: 'mode', mode: 'mirror', reason: 'page-not-ready' })
    expect(events).toEqual([{ mode: 'mirror', reason: 'page-not-ready' }])
    expect(canvasOf(element)).not.toBeNull()
    expect(socket.messages.some(message => message.type === 'layout')).toBe(false)
  })

  it('passthrough: gestures use the host element box, like the canvas in mirror', async () => {
    const { element, socket } = await mountElement({ 'double-tap': 'off' })
    socket.reply({ type: 'mode', mode: 'passthrough' })
    const init = { bubbles: true, pointerId: 1, pointerType: 'mouse', clientX: 120, clientY: 60 }
    const down = new PointerEvent('pointerdown', init)
    const up = new PointerEvent('pointerup', init)
    element.setPointerCapture = () => {}
    element.dispatchEvent(down)
    element.dispatchEvent(up)
    const tap = socket.messages.find(message => message.type === 'tap')
    expect(tap).toMatchObject({ type: 'tap', x: 0.5, y: 0.5 })
  })

  it('changing mode renegotiates on a new connection and puts the canvas back for mirror', async () => {
    const { element, socket } = await mountElement({ mode: 'passthrough' })
    socket.reply({ type: 'mode', mode: 'passthrough' })
    expect(canvasOf(element)).toBeNull()

    const before = FakeSocket.instances.length
    element.setAttribute('mode', 'mirror')
    await vi.waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(before))
    const next = FakeSocket.instances.at(-1) as FakeSocket
    next.onopen?.()
    expect(next.messages[0]).toMatchObject({ type: 'mode', request: 'mirror' })
    expect(canvasOf(element)).not.toBeNull()
    next.reply({ type: 'mode', mode: 'mirror' })
    expect(element.effectiveMode).toBe('mirror')
  })

  it('stops reporting its layout when removed', async () => {
    const { element, socket } = await mountElement()
    socket.reply({ type: 'mode', mode: 'passthrough' })
    element.remove()
    const count = socket.messages.filter(message => message.type === 'layout').length
    window.dispatchEvent(new Event('scroll'))
    flush()
    expect(socket.messages.filter(message => message.type === 'layout')).toHaveLength(count)
  })
})
