import { afterEach, describe, expect, it, vi } from 'vitest'

import { AqutterPluginError, callPluginRaw } from '../src/index'

const stubBridge = (result: unknown): void => {
  vi.stubGlobal('window', { aqutter: { callHandler: async () => result } })
}

describe('callPluginRaw error envelope', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns ordinary results unchanged', async () => {
    stubBridge({ ok: true, count: 3 })
    await expect(callPluginRaw('maps', 'moveTo', {})).resolves.toEqual({ ok: true, count: 3 })
  })

  it('returns non-object results unchanged', async () => {
    stubBridge(null)
    await expect(callPluginRaw('maps', 'moveTo')).resolves.toBeNull()
    stubBridge('text')
    await expect(callPluginRaw('maps', 'moveTo')).resolves.toBe('text')
  })

  it('throws an AqutterPluginError carrying the code for an aqutterError result', async () => {
    stubBridge({ aqutterError: { code: 'UNSUPPORTED_PLATFORM', message: 'maps.moveTo is not supported on linux' } })
    const error = await callPluginRaw('maps', 'moveTo').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AqutterPluginError)
    expect((error as AqutterPluginError).code).toBe('UNSUPPORTED_PLATFORM')
    expect((error as Error).message).toBe('UNSUPPORTED_PLATFORM: maps.moveTo is not supported on linux')
  })

  it('does not mistake a malformed aqutterError for an error', async () => {
    for (const result of [
      { aqutterError: 'boom' },
      { aqutterError: { code: 1, message: 'x' } },
      { aqutterError: { code: 'X' } },
      { aqutterError: null },
    ]) {
      stubBridge(result)
      await expect(callPluginRaw('maps', 'moveTo')).resolves.toEqual(result)
    }
  })
})
