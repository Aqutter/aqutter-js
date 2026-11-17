import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AQUTTER_NATIVE_HEADER_LENGTH, AqutterNative, AqutterNativeFormat } from '../src/nativeview'
import type { AqutterNativeLayout, AqutterNativeModeInfo, AqutterNativeOptions } from '../src/nativeview'

interface TestFrame { header: ArrayBuffer, payload: ArrayBuffer }

const makeFrame = (seq: number, format = AqutterNativeFormat.Rgba, width = 1, height = 1): TestFrame => {
  const payloadLength = format === AqutterNativeFormat.Rgba ? width * height * 4 : 3
  const header = new ArrayBuffer(AQUTTER_NATIVE_HEADER_LENGTH)
  const view = new DataView(header)
  view.setUint32(0, width, true)
  view.setUint32(4, height, true)
  view.setUint32(8, format, true)
  view.setUint32(12, seq, true)
  view.setFloat64(16, Date.now(), true)
  const payload = new ArrayBuffer(payloadLength)
  new Uint8Array(payload).fill(seq)
  return { header, payload }
}

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

  receive(data: ArrayBuffer | string): void {
    this.onmessage?.({ data })
  }

  /** 一幀 = 標頭、像素兩則訊息。 */
  receiveFrame(frame: TestFrame): void {
    this.receive(frame.header)
    this.receive(frame.payload)
  }

  get messages(): { type: string, [key: string]: unknown }[] {
    return this.sent.map(raw => JSON.parse(raw))
  }
}

interface PutCall { data: Uint8ClampedArray, width: number, height: number }

const setup = (extra: Partial<AqutterNativeOptions> = {}) => {
  const puts: PutCall[] = []
  const drawn: unknown[] = []
  const context = {
    putImageData: (image: PutCall) => puts.push(image),
    drawImage: (bitmap: unknown) => drawn.push(bitmap),
  }
  const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement
  const frames: (() => void)[] = []
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('ArrayBuffer', ArrayBuffer)
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback))
  let measured: { width: number, height: number, devicePixelRatio: number } | null = { width: 100, height: 50, devicePixelRatio: 2 }
  const native = new AqutterNative({
    session: 's',
    canvas,
    resolveEndpoint: async () => ({ port: 1234, token: 't' }),
    measure: () => measured,
    ...extra,
  })
  native.start()
  return {
    native,
    puts,
    drawn,
    flush: () => frames.splice(0).forEach(callback => callback()),
    setMeasured: (value: typeof measured) => {
      measured = value
    },
    socket: async () => {
      await Promise.resolve()
      await Promise.resolve()
      const socket = FakeSocket.instances.at(-1) as FakeSocket
      socket.onopen?.()
      return socket
    },
  }
}

describe('AqutterNative', () => {
  beforeEach(() => {
    FakeSocket.instances = []
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects to /native/<session> with the token', async () => {
    const { socket } = setup()
    expect((await socket()).url).toBe('ws://127.0.0.1:1234/native/s?token=t')
  })

  it('draws RGBA without copying the pixels', async () => {
    const { socket, puts, flush } = setup()
    const ws = await socket()
    const frame = makeFrame(1)
    ws.receiveFrame(frame)
    flush()
    expect(puts).toHaveLength(1)
    expect(puts[0].data.buffer).toBe(frame.payload)
    expect(puts[0].data.byteOffset).toBe(0)
  })

  it('draws only the newest frame of a burst and acknowledges every frame once', async () => {
    const { socket, puts, flush } = setup()
    const ws = await socket()
    ws.receiveFrame(makeFrame(1))
    ws.receiveFrame(makeFrame(2))
    ws.receiveFrame(makeFrame(3))
    flush()
    expect(puts).toHaveLength(1)
    expect(puts[0].data[0]).toBe(3)
    const acks = ws.messages.filter(message => message.type === 'ack')
    expect(acks.map(ack => ack.seq).sort()).toEqual([1, 2, 3])
  })

  it('drops frames that arrive out of order but still acknowledges them', async () => {
    const { socket, puts, flush } = setup()
    const ws = await socket()
    ws.receiveFrame(makeFrame(5))
    flush()
    ws.receiveFrame(makeFrame(4))
    flush()
    expect(puts).toHaveLength(1)
    expect(ws.messages.filter(message => message.type === 'ack').map(ack => ack.seq)).toEqual([5, 4])
  })

  it('does not let a slow PNG decode overwrite a newer frame', async () => {
    const { socket, drawn, flush } = setup()
    const resolvers: ((bitmap: { id: number, close: () => void }) => void)[] = []
    vi.stubGlobal('createImageBitmap', () => new Promise((resolve) => {
      resolvers.push(resolve as (bitmap: { id: number, close: () => void }) => void)
    }))
    const ws = await socket()
    ws.receiveFrame(makeFrame(1, AqutterNativeFormat.Jpeg))
    flush()
    ws.receiveFrame(makeFrame(2, AqutterNativeFormat.Jpeg))
    flush()
    // 較新的幀（第二個解碼）先完成，舊的後完成
    resolvers[1]({ id: 2, close: () => undefined })
    await Promise.resolve()
    await Promise.resolve()
    resolvers[0]({ id: 1, close: () => undefined })
    await Promise.resolve()
    await Promise.resolve()
    expect(drawn).toEqual([{ id: 2, close: expect.any(Function) }])
    expect(ws.messages.filter(message => message.type === 'ack')).toHaveLength(2)
  })

  it('acknowledges frames it cannot decode', async () => {
    const { socket, puts, flush } = setup()
    const ws = await socket()
    ws.receive(new ArrayBuffer(4)) // 標頭太短
    ws.receive(new ArrayBuffer(4))
    flush()
    expect(puts).toHaveLength(0)
    expect(ws.messages.filter(message => message.type === 'ack')).toHaveLength(1)
  })

  it('reports the display size on connect and again only when it changes', async () => {
    const { socket, native, setMeasured } = setup()
    const ws = await socket()
    const resizes = () => ws.messages.filter(message => message.type === 'resize')
    expect(resizes()).toEqual([{ type: 'resize', width: 100, height: 50, dpr: 2 }])
    native.reportSize()
    expect(resizes()).toHaveLength(1)
    setMeasured({ width: 200, height: 50, devicePixelRatio: 2 })
    native.reportSize()
    expect(resizes().at(-1)).toEqual({ type: 'resize', width: 200, height: 50, dpr: 2 })
    setMeasured({ width: 0, height: 0, devicePixelRatio: 2 })
    native.reportSize()
    expect(resizes()).toHaveLength(2)
  })

  it('reports visibility on connect and only when it changes', async () => {
    const { socket, native } = setup()
    const ws = await socket()
    expect(ws.messages.filter(message => message.type === 'visibility')).toEqual([{ type: 'visibility', visible: true }])
    native.setVisible(true)
    expect(ws.messages.filter(message => message.type === 'visibility')).toHaveLength(1)
    native.setVisible(false)
    native.setVisible(false)
    native.setVisible(true)
    expect(ws.messages.filter(message => message.type === 'visibility').map(message => message.visible)).toEqual([true, false, true])
  })

  it('sends the hidden state recorded before the socket opened', async () => {
    const { socket, native } = setup()
    native.setVisible(false)
    const ws = await socket()
    expect(ws.messages.filter(message => message.type === 'visibility')).toEqual([{ type: 'visibility', visible: false }])
  })
})

describe('AqutterNative connection failure hint', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const closeNext = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(1000)
    const socket = FakeSocket.instances.at(-1) as FakeSocket
    socket.onclose?.()
  }

  it('warns once about CSP after repeated connects that never open', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setup()
    for (let i = 0; i < 5; i++) {
      await closeNext()
    }
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('ws://127.0.0.1:*')
    warn.mockRestore()
  })

  it('stays quiet when the connection opens', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setup()
    await vi.advanceTimersByTimeAsync(10)
    ;(FakeSocket.instances.at(-1) as FakeSocket).onopen?.()
    await closeNext()
    await closeNext()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('AqutterNative mode negotiation', () => {
  beforeEach(() => {
    FakeSocket.instances = []
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const layout = (extra: Partial<AqutterNativeLayout> = {}): AqutterNativeLayout => ({ type: 'layout', left: 1, top: 2, width: 3, height: 4, visible: true, sentAt: 5, ...extra })

  it('sends the mode request as the very first message, with pageReady', async () => {
    const { socket } = setup({ mode: 'auto', pageReady: () => false, maxInFlight: 2 })
    const ws = await socket()
    expect(ws.messages[0]).toEqual({ type: 'mode', request: 'auto', pageReady: false })
    expect(ws.messages.slice(1).map(message => message.type)).toEqual(['config', 'resize', 'visibility'])
  })

  it('does not negotiate without a mode option and keeps the old mirror behavior', async () => {
    const { socket, puts, flush, native } = setup()
    const ws = await socket()
    expect(ws.messages.some(message => message.type === 'mode')).toBe(false)
    ws.receiveFrame(makeFrame(1))
    flush()
    expect(puts).toHaveLength(1)
    expect(native.mode).toBeNull()
  })

  it('treats a passthrough reply as the mode: no frames are drawn or acknowledged, layout can be sent', async () => {
    const infos: AqutterNativeModeInfo[] = []
    const { socket, puts, flush, native } = setup({ mode: 'auto', onMode: info => infos.push(info) })
    const ws = await socket()
    expect(native.sendLayout(layout())).toBe(false)
    ws.receive(JSON.stringify({ type: 'mode', mode: 'passthrough' }))
    expect(infos).toEqual([{ mode: 'passthrough' }])
    expect(native.mode).toBe('passthrough')

    const acksBefore = ws.messages.filter(message => message.type === 'ack').length
    ws.receiveFrame(makeFrame(1))
    flush()
    expect(puts).toHaveLength(0)
    expect(ws.messages.filter(message => message.type === 'ack')).toHaveLength(acksBefore)

    expect(native.sendLayout(layout())).toBe(true)
    expect(ws.messages.at(-1)).toEqual(layout())
  })

  it('drops a frame that was received before the passthrough reply', async () => {
    const { socket, puts, flush } = setup({ mode: 'auto' })
    const ws = await socket()
    ws.receiveFrame(makeFrame(1))
    ws.receive(JSON.stringify({ type: 'mode', mode: 'passthrough' }))
    flush()
    expect(puts).toHaveLength(0)
  })

  it('keeps drawing frames when the reply is mirror, and reports a known reason', async () => {
    const infos: AqutterNativeModeInfo[] = []
    const { socket, puts, flush, native } = setup({ mode: 'passthrough', onMode: info => infos.push(info) })
    const ws = await socket()
    ws.receive(JSON.stringify({ type: 'mode', mode: 'mirror', reason: 'unsupported-platform' }))
    expect(infos).toEqual([{ mode: 'mirror', reason: 'unsupported-platform' }])
    ws.receiveFrame(makeFrame(1))
    flush()
    expect(puts).toHaveLength(1)
    expect(native.sendLayout(layout())).toBe(false)
  })

  it('drops an unknown reason and ignores malformed or unrelated text messages', async () => {
    const infos: AqutterNativeModeInfo[] = []
    const { socket } = setup({ mode: 'auto', onMode: info => infos.push(info) })
    const ws = await socket()
    ws.receive('not json')
    ws.receive(JSON.stringify({ type: 'other' }))
    ws.receive(JSON.stringify({ type: 'mode', mode: 'weird' }))
    expect(infos).toEqual([])
    ws.receive(JSON.stringify({ type: 'mode', mode: 'mirror', reason: 'made-up' }))
    expect(infos).toEqual([{ mode: 'mirror' }])
  })

  it('falls back to mirror with reason no-reply when the native side never answers (old native)', async () => {
    vi.useFakeTimers()
    const infos: AqutterNativeModeInfo[] = []
    const { socket, puts, flush, native } = setup({ mode: 'auto', modeTimeoutMs: 1000, onMode: info => infos.push(info) })
    const ws = await socket()
    vi.advanceTimersByTime(999)
    expect(infos).toEqual([])
    vi.advanceTimersByTime(1)
    expect(infos).toEqual([{ mode: 'mirror', reason: 'no-reply' }])
    expect(native.mode).toBe('mirror')
    ws.receiveFrame(makeFrame(1))
    flush()
    expect(puts).toHaveLength(1)
  })

  it('a reply cancels the timeout', async () => {
    vi.useFakeTimers()
    const infos: AqutterNativeModeInfo[] = []
    const { socket } = setup({ mode: 'auto', onMode: info => infos.push(info) })
    const ws = await socket()
    ws.receive(JSON.stringify({ type: 'mode', mode: 'passthrough' }))
    vi.advanceTimersByTime(5000)
    expect(infos).toEqual([{ mode: 'passthrough' }])
  })

  it('renegotiates on every new connection and forgets the previous mode', async () => {
    vi.useFakeTimers()
    const { socket, native } = setup({ mode: 'auto', reconnectMs: 10 })
    const first = await socket()
    first.receive(JSON.stringify({ type: 'mode', mode: 'passthrough' }))
    expect(native.mode).toBe('passthrough')

    first.readyState = 3
    first.onclose?.()
    expect(native.mode).toBeNull()
    await vi.advanceTimersByTimeAsync(20)
    const second = FakeSocket.instances.at(-1) as FakeSocket
    expect(second).not.toBe(first)
    second.onopen?.()
    expect(second.messages[0]).toMatchObject({ type: 'mode', request: 'auto' })
  })
})
