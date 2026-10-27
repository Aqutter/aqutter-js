import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { decodeFrame, encodeFrame } from '../src/frame'
import type { Frame } from '../src/frame'

class FakeSocket {
  static instances: FakeSocket[] = []
  static readonly OPEN = 1
  readyState = 0
  binaryType = ''
  sent: Frame[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }

  send(data: Uint8Array): void {
    this.sent.push(decodeFrame(data))
  }

  close(): void {
    this.readyState = 3
  }
}

const load = async () => await import('../src/index')

describe('public API over the transport', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.resetModules()
    vi.stubGlobal('WebSocket', FakeSocket)
    // 殼注入的連線資訊；刻意沒有 window.aqutter（舊的橋接物件），client 不該再需要它
    vi.stubGlobal('window', { aqutterEndpoint: { port: 4242, token: 'tok' } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const connected = async () => {
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    const socket = FakeSocket.instances[0]!
    socket.readyState = 1
    socket.onopen?.()
    return socket
  }

  const reply = (socket: FakeSocket, frame: Frame): void => {
    const bytes = encodeFrame(frame)
    socket.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
  }

  it('callPluginRaw sends <id>.<method> over the transport and resolves with the result', async () => {
    const { callPluginRaw } = await load()
    const call = callPluginRaw('maps', 'moveTo', { lat: 1 })
    const socket = await connected()
    expect(socket.url).toBe('ws://127.0.0.1:4242/channel/aqutter.rpc?token=tok')
    expect(socket.sent[0]).toMatchObject({ t: 'call', name: 'maps.moveTo', p: { lat: 1 } })
    reply(socket, { t: 'res', id: socket.sent[0]!.id!, p: { ok: true } })
    await expect(call).resolves.toEqual({ ok: true })
  })

  it('callPluginRaw without a payload sends an empty object', async () => {
    const { callPluginRaw } = await load()
    const call = callPluginRaw('maps', 'ping')
    const socket = await connected()
    expect(socket.sent[0]!.p).toEqual({})
    reply(socket, { t: 'res', id: socket.sent[0]!.id!, p: null })
    await expect(call).resolves.toBeNull()
  })

  it('an err frame becomes an AqutterPluginError with the code', async () => {
    const { callPluginRaw, AqutterPluginError } = await load()
    const call = callPluginRaw('maps', 'moveTo')
    const socket = await connected()
    reply(socket, { t: 'err', id: socket.sent[0]!.id!, e: { code: 'UNSUPPORTED_PLATFORM', message: 'maps.moveTo is not supported on linux' } })
    const error = await call.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AqutterPluginError)
    expect((error as AqutterPluginError).code).toBe('UNSUPPORTED_PLATFORM')
    expect((error as Error).message).toBe('UNSUPPORTED_PLATFORM: maps.moveTo is not supported on linux')
  })

  it('callFlutter sends every handler over the transport, and there is no callHandler path', async () => {
    const { callFlutter } = await load()
    const call = callFlutter('platform_info' as never)
    const socket = await connected()
    expect(socket.sent[0]).toMatchObject({ t: 'call', name: 'platform_info' })
    reply(socket, { t: 'res', id: socket.sent[0]!.id!, p: { platform: 'android' } })
    await expect(call).resolves.toEqual({ platform: 'android' })
  })

  it('onFlutterEvent and onPluginEventRaw receive events from the transport', async () => {
    const { onFlutterEvent, onPluginEventRaw } = await load()
    const got: unknown[] = []
    onFlutterEvent('battery' as never, (payload: unknown) => got.push(['flutter', payload]))
    onPluginEventRaw('maps', 'moved', payload => got.push(['plugin', payload]))
    const socket = await connected()
    reply(socket, { t: 'evt', ch: 'battery', p: { level: 0.5 } })
    reply(socket, { t: 'evt', ch: 'maps.moved', p: { lat: 2 } })
    expect(got).toEqual([['flutter', { level: 0.5 }], ['plugin', { lat: 2 }]])
  })

  it('exposes the transport state', async () => {
    const { getTransportState, onTransportState } = await load()
    const states: string[] = []
    onTransportState(state => states.push(state))
    const socket = await connected()
    expect(getTransportState()).toBe('open')
    expect(states).toContain('open')
    socket.readyState = 3
    socket.onclose?.()
    expect(getTransportState()).toBe('closed')
  })

  it('outside Flutter calls throw and the transport is always closed', async () => {
    const { callPluginRaw, getTransportState, onTransportState } = await load()
    vi.stubGlobal('window', {})
    await expect(callPluginRaw('maps', 'moveTo')).rejects.toThrow(/only available inside Flutter/)
    expect(getTransportState()).toBe('closed')
    expect(onTransportState(() => {})).toBeTypeOf('function')
  })
})
