import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { connectBinaryChannel } from '../src/channel'

class FakeSocket {
  static readonly OPEN = 1
  static instances: FakeSocket[] = []
  readyState = 0
  binaryType = ''
  bufferedAmount = 0
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onclose: ((event: { code: number, reason: string }) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }

  send(data: unknown): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
  }

  open(): void {
    this.readyState = 1
    this.onopen?.()
  }

  serverClose(code: number, reason = ''): void {
    this.readyState = 3
    this.onclose?.({ code, reason })
  }
}

const endpoint = async () => ({ port: 4321, token: 'a b' })

const openedChannel = async () => {
  const pending = connectBinaryChannel('bench.echo', endpoint)
  await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
  const socket = FakeSocket.instances[0]!
  socket.open()
  return { socket, channel: await pending }
}

describe('connectBinaryChannel', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('rejects a malformed name without touching the network', async () => {
    for (const name of ['echo', 'Bench.echo', 'bench.echo.x', 'bench.', '.echo', '']) {
      await expect(connectBinaryChannel(name, endpoint)).rejects.toThrow(/invalid channel name/)
    }
    expect(FakeSocket.instances).toHaveLength(0)
  })

  it('connects to /channel/<name> with the encoded token and resolves once open', async () => {
    const { socket, channel } = await openedChannel()
    expect(socket.url).toBe('ws://127.0.0.1:4321/channel/bench.echo?token=a%20b')
    expect(socket.binaryType).toBe('arraybuffer')
    channel.send(new Uint8Array([1, 2]))
    expect(socket.sent).toHaveLength(1)
  })

  it('delivers binary messages to listeners until unsubscribed, ignoring text', async () => {
    const { socket, channel } = await openedChannel()
    const received: number[] = []
    const off = channel.onMessage(data => received.push(data.byteLength))
    socket.onmessage?.({ data: new ArrayBuffer(3) })
    socket.onmessage?.({ data: 'text' })
    off()
    socket.onmessage?.({ data: new ArrayBuffer(5) })
    expect(received).toEqual([3])
  })

  it('reports the close code and reason, and stops sending afterwards', async () => {
    const { socket, channel } = await openedChannel()
    const closed: Array<{ code: number, reason: string }> = []
    channel.onClose(info => closed.push(info))
    socket.serverClose(1001, 'going away')
    expect(closed).toEqual([{ code: 1001, reason: 'going away' }])
    channel.send(new Uint8Array([1]))
    expect(socket.sent).toHaveLength(0)
  })

  it('rejects with the likely causes when the connection is refused', async () => {
    const pending = connectBinaryChannel('bench.echo', endpoint)
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    FakeSocket.instances[0]!.serverClose(1006)
    await expect(pending).rejects.toThrow(/refused.*CSP.*ws:\/\/127\.0\.0\.1:\*/)
  })

  it('rejects instead of hanging when the connection never opens', async () => {
    vi.useFakeTimers()
    const pending = connectBinaryChannel('bench.echo', endpoint, { timeoutMs: 50 })
    const assertion = expect(pending).rejects.toThrow(/no connection after 50 ms/)
    await vi.advanceTimersByTimeAsync(60)
    await assertion
  })

  it('rejects when the endpoint cannot be resolved (outside Flutter)', async () => {
    await expect(connectBinaryChannel('bench.echo', async () => {
      throw new Error('only available inside Flutter')
    })).rejects.toThrow(/inside Flutter/)
  })
})
