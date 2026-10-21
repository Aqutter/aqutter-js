import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AQUTTER_NATIVE_HEADER_LENGTH, AqutterNative, AqutterNativeFormat } from '../src/nativeview'

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

  receive(data: ArrayBuffer): void {
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

const setup = () => {
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
