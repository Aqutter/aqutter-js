import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AqutterPluginError } from '../src/error'
import { decodeFrame, encodeFrame } from '../src/frame'
import type { Frame } from '../src/frame'
import { Transport } from '../src/transport'

class FakeSocket {
  static readonly OPEN = 1
  static instances: FakeSocket[] = []
  readyState = 0
  binaryType = ''
  sent: Frame[] = []
  closeArgs: [number?, string?] | null = null
  onopen: (() => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }

  send(data: Uint8Array): void {
    this.sent.push(decodeFrame(data))
  }

  close(code?: number, reason?: string): void {
    this.closeArgs = [code, reason]
    this.readyState = 3
  }

  open(): void {
    this.readyState = 1
    this.onopen?.()
  }

  serverClose(code = 1006): void {
    this.readyState = 3
    this.onclose?.({ code })
  }

  receive(frame: Frame): void {
    const bytes = encodeFrame(frame)
    this.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
  }
}

const make = (overrides: Partial<ConstructorParameters<typeof Transport>[0]> = {}) => {
  let endpoints = 0
  return new Transport({
    resolveEndpoint: async () => ({ port: 4000 + endpoints++, token: 'a b' }),
    webSocket: FakeSocket as unknown as typeof WebSocket,
    ...overrides,
  })
}

const lastSocket = (): FakeSocket => FakeSocket.instances.at(-1)!

describe('Transport', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('connects to /channel/aqutter.rpc with the encoded token and reports the state', async () => {
    const transport = make()
    const states: string[] = []
    transport.onState(state => states.push(state))
    transport.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(lastSocket().url).toBe('ws://127.0.0.1:4000/channel/aqutter.rpc?token=a%20b')
    expect(lastSocket().binaryType).toBe('arraybuffer')
    lastSocket().open()
    expect(states).toEqual(['connecting', 'open'])
  })

  it('queues calls made before the connection is open and sends them in order', async () => {
    const transport = make()
    const first = transport.call('a.one', { n: 1 })
    const second = transport.call('a.two', { n: 2 })
    await vi.advanceTimersByTimeAsync(0)
    lastSocket().open()
    expect(lastSocket().sent.map(frame => frame.name)).toEqual(['a.one', 'a.two'])
    lastSocket().receive({ t: 'res', id: lastSocket().sent[1]!.id!, p: 'two' })
    lastSocket().receive({ t: 'res', id: lastSocket().sent[0]!.id!, p: 'one' })
    await expect(first).resolves.toBe('one')
    await expect(second).resolves.toBe('two')
  })

  it('turns an err frame into an AqutterPluginError carrying the code', async () => {
    const transport = make()
    const call = transport.call('a.one', {})
    await vi.advanceTimersByTimeAsync(0)
    lastSocket().open()
    lastSocket().receive({ t: 'err', id: lastSocket().sent[0]!.id!, e: { code: 'UNSUPPORTED_PLATFORM', message: 'not here' } })
    const error = await call.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AqutterPluginError)
    expect((error as AqutterPluginError).code).toBe('UNSUPPORTED_PLATFORM')
    expect((error as Error).message).toBe('UNSUPPORTED_PLATFORM: not here')
  })

  it('sends binary in the payload and receives it as Uint8Array', async () => {
    const transport = make()
    const call = transport.call('a.bin', { data: new Uint8Array([1, 2, 3]) })
    await vi.advanceTimersByTimeAsync(0)
    lastSocket().open()
    expect([...(lastSocket().sent[0]!.p as { data: Uint8Array }).data]).toEqual([1, 2, 3])
    lastSocket().receive({ t: 'res', id: lastSocket().sent[0]!.id!, p: { out: new Uint8Array([9]) } })
    const result = await call as { out: Uint8Array }
    expect(result.out).toBeInstanceOf(Uint8Array)
    expect([...result.out]).toEqual([9])
  })

  it('delivers events to the subscribed channel only, until unsubscribed', async () => {
    const transport = make()
    const got: unknown[] = []
    const off = transport.onEvent('p.changed', payload => got.push(payload))
    transport.onEvent('p.other', () => got.push('wrong'))
    await vi.advanceTimersByTimeAsync(0)
    lastSocket().open()
    lastSocket().receive({ t: 'evt', ch: 'p.changed', p: { level: 1 } })
    lastSocket().receive({ t: 'evt', ch: 'p.nobody', p: 1 })
    off()
    lastSocket().receive({ t: 'evt', ch: 'p.changed', p: { level: 2 } })
    expect(got).toEqual([{ level: 1 }])
  })

  it('rejects queued calls with TRANSPORT_UNAVAILABLE after the queue timeout and mentions the CSP', async () => {
    const transport = make({ queueTimeoutMs: 100 })
    const call = transport.call('a.one', {})
    const assertion = expect(call).rejects.toMatchObject({ code: 'TRANSPORT_UNAVAILABLE', message: expect.stringContaining('ws://127.0.0.1:*') })
    await vi.advanceTimersByTimeAsync(150)
    await assertion
  })

  it('rejects in-flight calls with TRANSPORT_CLOSED when the connection drops, without resending', async () => {
    const transport = make()
    const call = transport.call('a.one', {})
    await vi.advanceTimersByTimeAsync(0)
    lastSocket().open()
    const assertion = expect(call).rejects.toMatchObject({ code: 'TRANSPORT_CLOSED' })
    lastSocket().serverClose(1001)
    await assertion
    await vi.advanceTimersByTimeAsync(250)
    lastSocket().open()
    expect(lastSocket().sent).toHaveLength(0)
  })

  it('reconnects with a fresh endpoint and an exponential backoff, then keeps working', async () => {
    const transport = make()
    transport.start()
    await vi.advanceTimersByTimeAsync(0)
    lastSocket().open()
    lastSocket().serverClose(1001)
    expect(transport.state).toBe('closed')
    await vi.advanceTimersByTimeAsync(199)
    expect(FakeSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2)
    expect(FakeSocket.instances).toHaveLength(2)
    expect(lastSocket().url).toContain(':4001/')
    lastSocket().serverClose()
    await vi.advanceTimersByTimeAsync(399)
    expect(FakeSocket.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2)
    expect(FakeSocket.instances).toHaveLength(3)
    lastSocket().open()
    expect(transport.state).toBe('open')
    const call = transport.call('a.after', {})
    lastSocket().receive({ t: 'res', id: lastSocket().sent[0]!.id!, p: 'ok' })
    await expect(call).resolves.toBe('ok')
  })

  it('caps the backoff and resets it after a successful connection', async () => {
    const transport = make({ backoff: { initialMs: 100, maxMs: 300 } })
    transport.start()
    await vi.advanceTimersByTimeAsync(0)
    for (const wait of [100, 200, 300, 300]) {
      lastSocket().serverClose()
      const before = FakeSocket.instances.length
      await vi.advanceTimersByTimeAsync(wait - 1)
      expect(FakeSocket.instances).toHaveLength(before)
      await vi.advanceTimersByTimeAsync(2)
      expect(FakeSocket.instances).toHaveLength(before + 1)
    }
    lastSocket().open()
    lastSocket().serverClose()
    await vi.advanceTimersByTimeAsync(101)
    expect(FakeSocket.instances.length).toBeGreaterThan(5)
  })

  it('retries when the endpoint cannot be resolved', async () => {
    let attempts = 0
    const transport = make({
      resolveEndpoint: async () => {
        attempts++
        if (attempts < 2) {
          throw new Error('not ready')
        }
        return { port: 5000, token: 't' }
      },
    })
    transport.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(FakeSocket.instances).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(250)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('closes the connection with 1002 on a malformed frame', async () => {
    const transport = make()
    transport.start()
    await vi.advanceTimersByTimeAsync(0)
    lastSocket().open()
    lastSocket().onmessage?.({ data: new Uint8Array([0, 0, 0, 9, 1]).buffer })
    expect(lastSocket().closeArgs?.[0]).toBe(1002)
  })

  it('rejects an oversized payload immediately with PAYLOAD_TOO_LARGE', async () => {
    const transport = make()
    await expect(transport.call('a.big', { data: new Uint8Array(64 * 1024 * 1024) })).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' })
  })
})
