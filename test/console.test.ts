import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatConsoleArgs, installConsoleLogWith, isConsoleLogInstalled, setConsoleLogTarget } from '../src/console'
import type { ConsoleLogDeps } from '../src/console'
import { LogLevel, LogProvider } from '../src/contract/bridge'
import type { LogTarget } from '../src/contract/bridge'

interface Sent {
  level: LogLevel
  message: string
  target?: LogTarget
}

const flush = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0))
}

const setup = (overrides: Partial<ConsoleLogDeps> = {}) => {
  const sent: Sent[] = []
  const fake = {
    debug: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  const deps: ConsoleLogDeps = {
    console: fake as unknown as Console,
    canWrite: () => true,
    send: async (level, message, target) => {
      sent.push({ level, message, target })
    },
    ...overrides,
  }
  return { sent, fake, deps }
}

let uninstall: (() => void) | undefined

afterEach(() => {
  uninstall?.()
  uninstall = undefined
})

describe('installConsoleLogWith', () => {
  it('預設同時輸出到 devtools 與檔案，log 對應 info', async () => {
    const { sent, fake, deps } = setup()
    const original = fake.log
    uninstall = installConsoleLogWith(deps)

    deps.console.log('hello', { a: 1 })
    await flush()

    expect(original).toHaveBeenCalledWith('hello', { a: 1 })
    expect(sent).toEqual([{ level: LogLevel.Info, message: 'hello {"a":1}', target: undefined }])
    expect(isConsoleLogInstalled()).toBe(true)
  })

  it('devtools: false 時完全不呼叫原生 console，但仍寫檔', async () => {
    const { sent, fake, deps } = setup()
    const original = fake.warn
    uninstall = installConsoleLogWith(deps, { devtools: false })

    deps.console.warn('x')
    await flush()

    expect(original).not.toHaveBeenCalled()
    expect(sent.map(s => s.level)).toEqual([LogLevel.Warn])
  })

  it('file: false 時只輸出到 devtools，to.* 也不寫檔', async () => {
    const { sent, fake, deps } = setup()
    const original = fake.error
    uninstall = installConsoleLogWith(deps, { file: false })

    deps.console.error('e')
    deps.console.to.error('order', 'e2')
    await flush()

    expect(original).toHaveBeenCalledTimes(2)
    expect(sent).toEqual([])
  })

  it('minLevel 過濾低於門檻的層級', async () => {
    const { sent, deps } = setup()
    uninstall = installConsoleLogWith(deps, { file: { minLevel: LogLevel.Warn } })

    deps.console.debug('d')
    deps.console.info('i')
    deps.console.warn('w')
    deps.console.error('e')
    await flush()

    expect(sent.map(s => s.level)).toEqual([LogLevel.Warn, LogLevel.Error])
  })

  it('options.target 套用在一般 console.*', async () => {
    const { sent, deps } = setup()
    const target = { provider: LogProvider.Documents, dir: 'app', name: 'main' }
    uninstall = installConsoleLogWith(deps, { target })

    deps.console.info('x')
    await flush()

    expect(sent[0]?.target).toEqual(target)
  })

  it('非 Flutter（canWrite 為 false）不寫檔但 devtools 照常', async () => {
    const { sent, fake, deps } = setup({ canWrite: () => false })
    const original = fake.log
    uninstall = installConsoleLogWith(deps)

    deps.console.log('x')
    await flush()

    expect(original).toHaveBeenCalledWith('x')
    expect(sent).toEqual([])
  })

  it('uninstall 還原原生方法並移除 console.to', () => {
    const { fake, deps } = setup()
    const original = fake.log
    const off = installConsoleLogWith(deps)
    off()

    expect(deps.console.log).toBe(original)
    expect('to' in deps.console).toBe(false)
    expect(isConsoleLogInstalled()).toBe(false)
  })

  it('重複安裝先還原上一次，不會疊加攔截', async () => {
    const { sent, deps } = setup()
    installConsoleLogWith(deps)
    uninstall = installConsoleLogWith(deps)

    deps.console.log('once')
    await flush()

    expect(sent).toHaveLength(1)
  })

  it('寫入依呼叫順序串行送出', async () => {
    const order: string[] = []
    const { deps } = setup({
      send: async (_level, message) => {
        await Promise.resolve()
        order.push(message)
      },
    })
    uninstall = installConsoleLogWith(deps)

    deps.console.log('1')
    deps.console.log('2')
    deps.console.log('3')
    await flush()

    expect(order).toEqual(['1', '2', '3'])
  })

  it('寫檔失敗不丟出，且同一錯誤代碼只提示一次', async () => {
    const { fake, deps } = setup({
      send: async () => {
        throw new Error('log_provider_unavailable: external 僅 Android')
      },
    })
    const warn = fake.warn
    uninstall = installConsoleLogWith(deps, { devtools: false })

    deps.console.log('a')
    deps.console.log('b')
    await flush()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('log_provider_unavailable')
  })
})

describe('函式目標（TargetSource）', () => {
  it('每筆 log 呼叫當下求值，可據以換日換檔名', async () => {
    vi.useFakeTimers()
    try {
      const { sent, deps } = setup()
      const day = (d: Date): string => d.toISOString().slice(0, 10)
      uninstall = installConsoleLogWith(deps, {
        target: ({ time }) => ({ dir: 'daily', name: day(time) }),
      })

      vi.setSystemTime(new Date('2026-10-29T23:59:59Z'))
      deps.console.log('a')
      vi.setSystemTime(new Date('2026-10-30T00:00:01Z'))
      deps.console.log('b')
      await vi.advanceTimersByTimeAsync(0)

      expect(sent.map(s => s.target)).toEqual([
        { dir: 'daily', name: '2026-10-29' },
        { dir: 'daily', name: '2026-10-30' },
      ])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('函式收到層級與方法；回傳 undefined 表示走預設位置', async () => {
    const { sent, deps } = setup()
    const seen: string[] = []
    uninstall = installConsoleLogWith(deps, {
      target: ({ level, method }) => {
        seen.push(`${method}:${level}`)
        return undefined
      },
    })

    deps.console.log('x')
    deps.console.warn('y')
    await flush()

    expect(seen).toEqual(['log:info', 'warn:warn'])
    expect(sent.map(s => s.target)).toEqual([undefined, undefined])
  })

  it('函式丟例外：該筆改走預設位置，且 log_target_error 只提示一次', async () => {
    const { sent, fake, deps } = setup()
    const warn = fake.warn
    uninstall = installConsoleLogWith(deps, {
      devtools: false,
      target: () => {
        throw new Error('boom')
      },
    })

    deps.console.log('a')
    deps.console.log('b')
    await flush()

    expect(sent.map(s => s.message)).toEqual(['a', 'b'])
    expect(sent.every(s => s.target === undefined)).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('（log_target_error）')
  })

  it('被過濾或無法寫檔的呼叫不會求值函式', async () => {
    const fn = vi.fn(() => ({ name: 'x' }))
    const { deps } = setup({ canWrite: () => false })
    uninstall = installConsoleLogWith(deps, { target: fn })

    deps.console.log('x')
    await flush()

    expect(fn).not.toHaveBeenCalled()
  })

  it('console.to 的目標也可以是函式', async () => {
    const { sent, deps } = setup()
    uninstall = installConsoleLogWith(deps)

    deps.console.to.info(({ method }) => ({ dir: 'by-method', name: method }), 'x')
    await flush()

    expect(sent[0]?.target).toEqual({ dir: 'by-method', name: 'info' })
  })
})

describe('setConsoleLogTarget', () => {
  it('執行中更換一般 console.* 的目標，傳 undefined 回預設', async () => {
    const { sent, deps } = setup()
    uninstall = installConsoleLogWith(deps, { target: { name: 'first' } })

    deps.console.log('1')
    setConsoleLogTarget({ dir: 'next', name: 'second' })
    deps.console.log('2')
    setConsoleLogTarget(undefined)
    deps.console.log('3')
    await flush()

    expect(sent.map(s => s.target)).toEqual([{ name: 'first' }, { dir: 'next', name: 'second' }, undefined])
  })

  it('未安裝或已 uninstall 時為 no-op', () => {
    expect(() => setConsoleLogTarget({ name: 'x' })).not.toThrow()
    const { deps } = setup()
    const off = installConsoleLogWith(deps)
    off()
    expect(() => setConsoleLogTarget({ name: 'x' })).not.toThrow()
  })
})

describe('錯誤代碼辨識', () => {
  it('殼的訊息即使被前綴包裝（如 "Exception: "）仍辨識出代碼', async () => {
    const { fake, deps } = setup({
      send: async () => {
        throw new Error('Exception: log_invalid_target: dir 含不合法的段')
      },
    })
    const warn = fake.warn
    uninstall = installConsoleLogWith(deps, { devtools: false })

    deps.console.to.log({ dir: '..' }, 'x')
    deps.console.to.log({ dir: '..' }, 'y')
    await flush()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('（log_invalid_target）')
  })
})

describe('console.to', () => {
  it('物件目標原樣傳給 send，並對應各層級', async () => {
    const { sent, deps } = setup()
    uninstall = installConsoleLogWith(deps)
    const target = { provider: LogProvider.External, dir: 'sync/order', name: 'order' }

    deps.console.to.log(target, 'a')
    deps.console.to.debug(target, 'b')
    deps.console.to.warn(target, 'c')
    deps.console.to.error(target, 'd')
    await flush()

    expect(sent.map(s => s.level)).toEqual([LogLevel.Info, LogLevel.Debug, LogLevel.Warn, LogLevel.Error])
    expect(sent.every(s => s.target === target)).toBe(true)
  })

  it('字串目標等同 { name }', async () => {
    const { sent, deps } = setup()
    uninstall = installConsoleLogWith(deps)

    deps.console.to.info('order', 'x')
    await flush()

    expect(sent[0]?.target).toEqual({ name: 'order' })
  })

  it('devtools 開啟時回顯到原生 console，不含 target 參數', async () => {
    const { fake, deps } = setup()
    const original = fake.info
    uninstall = installConsoleLogWith(deps)

    deps.console.to.info('order', 'msg', 1)
    await flush()

    expect(original).toHaveBeenCalledWith('msg', 1)
  })
})

describe('formatConsoleArgs', () => {
  it('字串原樣、Error 取 stack、物件 JSON、以空格連接', () => {
    const error = new Error('boom')
    expect(formatConsoleArgs(['a', 1, true, null, { k: 'v' }])).toBe('a 1 true null {"k":"v"}')
    expect(formatConsoleArgs([error])).toBe((error.stack ?? '').replace(/\r?\n/g, '\\n'))
  })

  it('循環參照與 bigint 不丟出', () => {
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(formatConsoleArgs([loop])).toBe('{"self":"[Circular]"}')
    expect(formatConsoleArgs([{ n: 1n }])).toBe('{"n":"1"}')
  })

  it('換行轉義為單行', () => {
    expect(formatConsoleArgs(['a\nb\r\nc'])).toBe('a\\nb\\nc')
  })

  it('超過 64 KiB 截斷並加註記', () => {
    const text = formatConsoleArgs(['x'.repeat(70 * 1024)])
    expect(text.length).toBe(64 * 1024)
    expect(text.endsWith('…[truncated]')).toBe(true)
  })

  it('undefined 與 symbol 退回 String()', () => {
    expect(formatConsoleArgs([undefined, Symbol('s')])).toBe('undefined Symbol(s)')
  })
})
