import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatConsoleArgs, formatCrashLine, installConsoleLogWith, isConsoleLogInstalled, setConsoleLogTarget } from '../src/console'
import type { ConsoleLogDeps } from '../src/console'
import { LogLevel, LogProvider } from '../src/contract/bridge'
import type { CrashReportPayload, CrashReportsPayload, ErrorReportRequest, LogTarget } from '../src/contract/bridge'

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

const crash = (overrides: Partial<CrashReportPayload> = {}): CrashReportPayload => ({
  id: '1730000000000-abc123',
  time: '2026-10-29T07:00:00.000Z',
  source: 'platform',
  fatal: true,
  message: 'boom',
  ...overrides,
})

const setupErrors = (overrides: Partial<ConsoleLogDeps> = {}) => {
  const listeners = new Map<string, (event: Event) => void>()
  const errorTarget = {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.set(type, listener as (event: Event) => void)
    },
    removeEventListener: (type: string) => {
      listeners.delete(type)
    },
  }
  let crashListener: ((payload: CrashReportsPayload) => void) | undefined
  const acked: string[][] = []
  const reported: ErrorReportRequest[] = []
  const base = setup({
    errorTarget,
    onCrashReports: (listener) => {
      crashListener = listener
      return () => {
        crashListener = undefined
      }
    },
    ackCrash: async (ids) => {
      acked.push(ids)
    },
    reportError: (report) => {
      reported.push(report)
    },
    ...overrides,
  })
  return {
    ...base,
    listeners,
    acked,
    reported,
    deliver: (...reports: CrashReportPayload[]) => crashListener?.({ reports }),
    hasCrashListener: () => crashListener !== undefined,
  }
}

describe('formatCrashLine', () => {
  it('含來源、fatal、id、時間與訊息；有 stack 時以 | 接上並轉義換行', () => {
    expect(formatCrashLine(crash())).toBe('[crash:platform:fatal] 1730000000000-abc123 2026-10-29T07:00:00.000Z boom')
    expect(formatCrashLine(crash({ source: 'flutter', fatal: false, stack: 'a\nb' })))
      .toBe('[crash:flutter] 1730000000000-abc123 2026-10-29T07:00:00.000Z boom | a\\nb')
  })
})

describe('未捕捉錯誤', () => {
  it('error 事件轉成 console.error 並轉給殼 reporter', async () => {
    const { sent, listeners, reported, deps } = setupErrors()
    uninstall = installConsoleLogWith(deps)
    const error = new Error('oops')

    listeners.get('error')?.({ error, message: 'oops' } as unknown as Event)
    await flush()

    expect(sent).toHaveLength(1)
    expect(sent[0]?.level).toBe(LogLevel.Error)
    expect(sent[0]?.message).toContain('[uncaught]')
    expect(reported).toEqual([{ message: 'oops', stack: error.stack, fatal: false }])
  })

  it('unhandledrejection 以 reason 處理，非 Error 也不丟出', async () => {
    const { sent, listeners, reported, deps } = setupErrors()
    uninstall = installConsoleLogWith(deps)

    listeners.get('unhandledrejection')?.({ reason: { code: 7 } } as unknown as Event)
    await flush()

    expect(sent[0]?.message).toBe('[uncaught] {"code":7}')
    expect(reported).toEqual([{ message: '{"code":7}', stack: undefined, fatal: false }])
  })

  it('errors: false 不監聽；uninstall 會移除監聽', () => {
    const off = setupErrors()
    uninstall = installConsoleLogWith(off.deps, { errors: false })
    expect(off.listeners.size).toBe(0)
    uninstall()

    const on = setupErrors()
    uninstall = installConsoleLogWith(on.deps)
    expect(on.listeners.size).toBe(2)
    uninstall()
    expect(on.listeners.size).toBe(0)
  })

  it('devtools: false 時不呼叫原生 console，但仍寫檔並轉給 reporter', async () => {
    const { sent, fake, listeners, reported, deps } = setupErrors()
    const original = fake.error
    uninstall = installConsoleLogWith(deps, { devtools: false })

    listeners.get('error')?.({ message: 'x' } as unknown as Event)
    await flush()

    expect(original).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
    expect(reported).toHaveLength(1)
  })
})

describe('crash 紀錄寫入與確認', () => {
  it('寫成單行 error 並在全部成功後 ack', async () => {
    const { sent, acked, deliver, deps } = setupErrors()
    uninstall = installConsoleLogWith(deps)

    deliver(crash({ id: 'a' }), crash({ id: 'b', source: 'flutter', fatal: false }))
    await flush()

    expect(sent.map(s => s.level)).toEqual([LogLevel.Error, LogLevel.Error])
    expect(sent[0]?.message).toContain('[crash:platform:fatal] a ')
    expect(sent[1]?.message).toContain('[crash:flutter] b ')
    expect(acked).toEqual([['a', 'b']])
  })

  it('crashTarget（含函式）優先，否則沿用 target', async () => {
    const { sent, deliver, deps } = setupErrors()
    uninstall = installConsoleLogWith(deps, {
      target: { name: 'app' },
      crashTarget: ({ level }) => ({ dir: 'crash', name: level }),
    })
    deliver(crash())
    await flush()
    expect(sent[0]?.target).toEqual({ dir: 'crash', name: 'error' })

    uninstall()
    const second = setupErrors()
    uninstall = installConsoleLogWith(second.deps, { target: { name: 'app' } })
    second.deliver(crash())
    await flush()
    expect(second.sent[0]?.target).toEqual({ name: 'app' })
  })

  it('寫入失敗的不 ack，成功的照常 ack', async () => {
    let calls = 0
    const { acked, deliver, deps } = setupErrors({
      send: async () => {
        calls += 1
        if (calls === 1) {
          throw new Error('log_provider_unavailable: x')
        }
      },
    })
    uninstall = installConsoleLogWith(deps, { devtools: false })

    deliver(crash({ id: 'bad' }), crash({ id: 'good' }))
    await flush()

    expect(acked).toEqual([['good']])
  })

  it('file: false 或不在殼內時不寫也不 ack（紀錄留在殼端）', async () => {
    const off = setupErrors()
    uninstall = installConsoleLogWith(off.deps, { file: false })
    off.deliver(crash())
    await flush()
    expect(off.sent).toEqual([])
    expect(off.acked).toEqual([])
    uninstall()

    const outside = setupErrors({ canWrite: () => false })
    uninstall = installConsoleLogWith(outside.deps)
    outside.deliver(crash())
    await flush()
    expect(outside.acked).toEqual([])
  })

  it('ack 失敗不丟出；uninstall 後取消訂閱', async () => {
    const { deliver, hasCrashListener, deps } = setupErrors({
      ackCrash: async () => {
        throw new Error('no handler')
      },
    })
    const off = installConsoleLogWith(deps)
    expect(() => deliver(crash())).not.toThrow()
    await flush()
    off()
    expect(hasCrashListener()).toBe(false)
  })
})

describe('crash_take：安裝時拉取', () => {
  const take = (batches: CrashReportPayload[][]) => {
    const calls = { count: 0 }
    return {
      calls,
      takeCrash: async (): Promise<CrashReportsPayload> => {
        const reports = batches[calls.count] ?? []
        calls.count += 1
        return { reports }
      },
    }
  }

  it('安裝時取回未確認的紀錄、寫入並 ack', async () => {
    const { calls, takeCrash } = take([[crash({ id: 'a' }), crash({ id: 'b' })]])
    const { sent, acked, deps } = setupErrors({ takeCrash })
    uninstall = installConsoleLogWith(deps)
    await flush()

    expect(calls.count).toBe(1)
    expect(sent.map(s => s.message.split(' ')[1])).toEqual(['a', 'b'])
    expect(acked).toEqual([['a', 'b']])
  })

  it('回滿 50 筆就再取一次，直到不滿', async () => {
    const full = Array.from({ length: 50 }, (_, i) => crash({ id: `f${i}` }))
    const { calls, takeCrash } = take([full, [crash({ id: 'last' })]])
    const { acked, deps } = setupErrors({ takeCrash })
    uninstall = installConsoleLogWith(deps)
    await flush()

    expect(calls.count).toBe(2)
    expect(acked.flat()).toHaveLength(51)
  })

  it('一筆都寫不進去就不再重取（避免無窮迴圈）', async () => {
    const full = Array.from({ length: 50 }, (_, i) => crash({ id: `f${i}` }))
    const { calls, takeCrash } = take([full, full, full, full, full, full])
    const { acked, deps } = setupErrors({
      takeCrash,
      send: async () => {
        throw new Error('log_provider_unavailable: x')
      },
    })
    uninstall = installConsoleLogWith(deps, { devtools: false })
    await flush()

    expect(calls.count).toBe(1)
    expect(acked).toEqual([])
  })

  it('舊殼沒有 crash_take（丟出）時靜默略過，其他功能照常', async () => {
    const { sent, deps } = setupErrors({
      takeCrash: async () => {
        throw new Error('no handler')
      },
    })
    uninstall = installConsoleLogWith(deps)
    deps.console.log('still works')
    await flush()

    expect(sent.map(s => s.message)).toEqual(['still works'])
  })

  it('file: false 或不在殼內時不呼叫 crash_take（殼不會開始推送，紀錄留在殼端）', async () => {
    const off = take([[crash()]])
    const a = setupErrors({ takeCrash: off.takeCrash })
    uninstall = installConsoleLogWith(a.deps, { file: false })
    await flush()
    expect(off.calls.count).toBe(0)
    uninstall()

    const outside = take([[crash()]])
    const b = setupErrors({ takeCrash: outside.takeCrash, canWrite: () => false })
    uninstall = installConsoleLogWith(b.deps)
    await flush()
    expect(outside.calls.count).toBe(0)
  })

  it('拉取與事件同時送來同一 id 時，寫入進行中不重複寫', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const written: Sent[] = []
    const { deliver, deps } = setupErrors({
      takeCrash: async () => ({ reports: [crash({ id: 'dup' })] }),
      send: async (level, message, target) => {
        await gate
        written.push({ level, message, target })
      },
    })
    uninstall = installConsoleLogWith(deps)
    await flush()
    deliver(crash({ id: 'dup' }))
    release?.()
    await flush()

    expect(written).toHaveLength(1)
  })
})

describe('換日', () => {
  const day = (d: Date): string => d.toISOString().slice(0, 10)

  it('省略 name 時 JS 不凍結檔名：跨午夜前後都不帶 name（日期由殼在寫入當下決定）', async () => {
    vi.useFakeTimers()
    try {
      const { sent, deps } = setup()
      uninstall = installConsoleLogWith(deps, { target: { dir: 'daily' } })

      vi.setSystemTime(new Date('2026-10-29T23:59:59Z'))
      deps.console.log('before')
      vi.setSystemTime(new Date('2026-10-30T00:00:01Z'))
      deps.console.log('after')
      await vi.advanceTimersByTimeAsync(0)

      expect(sent.map(s => s.target)).toEqual([{ dir: 'daily' }, { dir: 'daily' }])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('crash 紀錄用函式 crashTarget 時，以「交付當下」的時間求值', async () => {
    vi.useFakeTimers()
    try {
      const { sent, deliver, deps } = setupErrors()
      uninstall = installConsoleLogWith(deps, {
        crashTarget: ({ time }) => ({ dir: 'crash', name: day(time) }),
      })

      vi.setSystemTime(new Date('2026-10-30T00:10:00Z'))
      deliver(crash({ time: '2026-10-29T23:50:00.000Z' }))
      await vi.advanceTimersByTimeAsync(0)

      expect(sent[0]?.target).toEqual({ dir: 'crash', name: '2026-10-30' })
      expect(sent[0]?.message).toContain('2026-10-29T23:50:00.000Z')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('函式 target 在跨午夜時逐筆換檔，且 console.to 同樣適用', async () => {
    vi.useFakeTimers()
    try {
      const { sent, deps } = setup()
      uninstall = installConsoleLogWith(deps)
      const target = ({ time }: { time: Date }) => ({ name: day(time) })

      vi.setSystemTime(new Date('2026-10-29T23:59:59Z'))
      deps.console.to.info(target, 'a')
      vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
      deps.console.to.info(target, 'b')
      await vi.advanceTimersByTimeAsync(0)

      expect(sent.map(s => s.target)).toEqual([{ name: '2026-10-29' }, { name: '2026-10-30' }])
    }
    finally {
      vi.useRealTimers()
    }
  })
})
