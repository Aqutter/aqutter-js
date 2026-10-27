import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeSocket {
  static instances: FakeSocket[] = []
  static readonly OPEN = 1
  readyState = 0
  binaryType = ''
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }

  send(): void {}

  close(): void {
    this.readyState = 3
  }
}

const load = async () => await import('../src/index')
const loadEndpoint = async () => await import('../src/endpoint')

describe('window.aqutterEndpoint', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.resetModules()
    vi.stubGlobal('WebSocket', FakeSocket)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('isFlutter follows whether the shell injected the endpoint, not window.aqutter', async () => {
    vi.stubGlobal('window', { aqutter: { callHandler: async () => ({}) } })
    expect((await load()).isFlutter()).toBe(false)
    vi.stubGlobal('window', { aqutterEndpoint: { port: 1, token: 't' } })
    expect((await load()).isFlutter()).toBe(true)
  })

  it('is not Flutter on the server (no window) and in a plain browser', async () => {
    vi.stubGlobal('window', undefined)
    expect((await load()).isFlutter()).toBe(false)
    vi.stubGlobal('window', {})
    expect((await load()).isFlutter()).toBe(false)
  })

  it('getEndpoint reads the global every time, so a restart that replaced it is picked up', async () => {
    const { getEndpoint } = await loadEndpoint()
    vi.stubGlobal('window', { aqutterEndpoint: { port: 1, token: 'a' } })
    await expect(getEndpoint()).resolves.toEqual({ port: 1, token: 'a' })
    ;(window as unknown as { aqutterEndpoint: unknown }).aqutterEndpoint = { port: 2, token: 'b' }
    await expect(getEndpoint()).resolves.toEqual({ port: 2, token: 'b' })
  })

  it('getEndpoint rejects when the shell has not injected it, or the value is malformed', async () => {
    const { getEndpoint } = await loadEndpoint()
    vi.stubGlobal('window', {})
    await expect(getEndpoint()).rejects.toThrow(/not available/)
    vi.stubGlobal('window', { aqutterEndpoint: { port: '1', token: 5 } })
    await expect(getEndpoint()).rejects.toThrow(/malformed/)
  })

  it('the transport reconnects with the endpoint that is current at that moment', async () => {
    vi.stubGlobal('window', { aqutterEndpoint: { port: 1111, token: 'old' } })
    const { getTransportState } = await load()
    getTransportState()
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    expect(FakeSocket.instances[0]!.url).toBe('ws://127.0.0.1:1111/channel/aqutter.rpc?token=old')

    // 殼重啟：伺服器關掉連線、全域被換成新的埠與令牌
    ;(window as unknown as { aqutterEndpoint: unknown }).aqutterEndpoint = { port: 2222, token: 'new' }
    FakeSocket.instances[0]!.readyState = 3
    FakeSocket.instances[0]!.onclose?.()
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(2), { timeout: 3000 })
    expect(FakeSocket.instances[1]!.url).toBe('ws://127.0.0.1:2222/channel/aqutter.rpc?token=new')
  })

  it('AqutterNative reads the injected endpoint when resolveEndpoint is omitted', async () => {
    vi.stubGlobal('window', { aqutterEndpoint: { port: 3333, token: 'mirror' } })
    vi.stubGlobal('requestAnimationFrame', undefined)
    const { AqutterNative } = await import('../src/nativeview/native')
    const canvas = { getContext: () => ({}) } as unknown as HTMLCanvasElement
    const mirror = new AqutterNative({ session: 'map', canvas })
    mirror.start()
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    expect(FakeSocket.instances[0]!.url).toBe('ws://127.0.0.1:3333/native/map?token=mirror')
    mirror.stop()
  })
})
