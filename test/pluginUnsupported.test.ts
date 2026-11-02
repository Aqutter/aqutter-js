import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { encodeFrame } from '../src/frame'
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
    // 只需要 id 與 name；用 frame 的解碼會與其他測試重複，這裡直接讀 transport 的編碼
    this.raw.push(data)
  }

  raw: Uint8Array[] = []

  close(): void {
    this.readyState = 3
  }
}

const load = async () => await import('../src/index')

describe('plugin calls that cannot run here resolve to undefined', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    FakeSocket.instances = []
    vi.resetModules()
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.stubGlobal('window', { aqutterEndpoint: { port: 4242, token: 'tok' } })
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
    vi.unstubAllGlobals()
  })

  /** 連線、等 transport 送出呼叫，再用 `code` 回一個 err frame。 */
  const callAndFail = async (name: string, code: string, dev?: boolean, times = 1) => {
    const mod = await load()
    if (dev !== undefined) {
      mod.setBridgeCapabilities(undefined, { dev })
    }
    const results: unknown[] = []
    for (let i = 0; i < times; i++) {
      const call = mod.callPluginRaw(name.split('.')[0]!, name.split('.')[1]!, {})
      await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
      const socket = FakeSocket.instances[0]!
      if (socket.readyState !== 1) {
        socket.readyState = 1
        socket.onopen?.()
      }
      await vi.waitFor(() => expect(socket.raw.length).toBe(i + 1))
      const id = decodeId(socket.raw[i]!)
      const bytes = encodeFrame({ t: 'err', id, e: { code, message: `${name} failed` } })
      socket.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
      results.push(await call.catch((e: unknown) => e))
    }
    return { mod, results }
  }

  // 傳輸層編碼的呼叫 frame 裡有數字 id；測試只需要把它原樣帶回去
  const decodeId = (data: Uint8Array): number => {
    const { decodeFrame } = requireFrame()
    return decodeFrame(data).id!
  }

  const requireFrame = () => frameModule!
  let frameModule: typeof import('../src/frame') | undefined
  beforeEach(async () => {
    frameModule = await import('../src/frame')
  })

  it('UNSUPPORTED_PLATFORM resolves to undefined instead of throwing', async () => {
    const { results } = await callAndFail('maps.moveTo', 'UNSUPPORTED_PLATFORM')

    expect(results).toEqual([undefined])
  })

  it('HANDLER_NOT_FOUND on a plugin method (plugin not installed) resolves to undefined', async () => {
    const { results } = await callAndFail('maps.moveTo', 'HANDLER_NOT_FOUND')

    expect(results).toEqual([undefined])
  })

  it('every other error code still throws', async () => {
    for (const code of ['invalid_path', 'auth_cancelled', 'HANDLER_FAILED', 'PAYLOAD_TOO_LARGE']) {
      vi.resetModules()
      FakeSocket.instances = []
      const { results } = await callAndFail('maps.moveTo', code)
      const error = results[0] as { code?: string }

      expect(error, code).toBeInstanceOf(Error)
      expect(error.code, code).toBe(code)
    }
  })

  it('outside Flutter it resolves to undefined too', async () => {
    vi.stubGlobal('window', {})
    const { callPluginRaw } = await load()

    await expect(callPluginRaw('maps', 'moveTo')).resolves.toBeUndefined()
  })

  describe('warnings', () => {
    it('are silent in production (dev missing or false)', async () => {
      await callAndFail('maps.moveTo', 'UNSUPPORTED_PLATFORM')
      expect(warn).not.toHaveBeenCalled()

      vi.resetModules()
      FakeSocket.instances = []
      await callAndFail('maps.moveTo', 'UNSUPPORTED_PLATFORM', false)
      expect(warn).not.toHaveBeenCalled()
    })

    it('are printed in development, once per call and reason', async () => {
      const { results } = await callAndFail('maps.moveTo', 'UNSUPPORTED_PLATFORM', true, 3)

      expect(results).toEqual([undefined, undefined, undefined])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]![0]).toBe('[aqutter] plugin call skipped: maps.moveTo (unsupported on this platform)')
    })

    it('say why: not installed, and not inside Flutter', async () => {
      await callAndFail('maps.moveTo', 'HANDLER_NOT_FOUND', true)
      expect(warn.mock.calls[0]![0]).toBe('[aqutter] plugin call skipped: maps.moveTo (plugin not installed)')

      vi.resetModules()
      vi.stubGlobal('window', {})
      const mod = await load()
      mod.setBridgeCapabilities(undefined, { dev: true })
      await mod.callPluginRaw('maps', 'ping')
      expect(warn.mock.calls[1]![0]).toBe('[aqutter] plugin call skipped: maps.ping (not running inside Flutter)')
    })
  })

  it('isPluginSupported is unchanged and still says false for a method outside the capability table', async () => {
    const { isPluginSupported, setBridgeCapabilities } = await load()
    setBridgeCapabilities(['maps.moveTo'])

    expect(isPluginSupported('maps', 'moveTo')).toBe(true)
    expect(isPluginSupported('maps', 'other')).toBe(false)
  })
})
