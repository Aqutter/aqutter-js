import { LogLevel } from './contract/bridge'
import type { CrashReportPayload, CrashReportsPayload, ErrorReportRequest, LogTarget } from './contract/bridge'

/**
 * `console.*` 攔截與 `console.to.*` 擴充。
 *
 * 本檔只含與傳輸無關的核心（依賴由 {@link ConsoleLogDeps} 注入），`installConsoleLog` 的接線在 `index.ts`，
 * 避免與 `index.ts` 互相引用。
 */

/** 被攔截、也提供 `console.to.*` 版本的 console 方法。 */
export type ConsoleMethod = 'debug' | 'log' | 'info' | 'warn' | 'error'

/** 傳給 {@link TargetSource} 函式的呼叫資訊。 */
export interface ConsoleLogCall {
  level: LogLevel
  method: ConsoleMethod
  /** 這筆 log 被呼叫的當下時間。 */
  time: Date
}

/**
 * 寫入目標的來源：固定物件，或在**每一筆 log 呼叫當下**同步求值的函式。
 * 函式可依當下時間／狀態決定 provider、dir、name（例如換日換檔名）；回傳 `undefined` 表示走殼的預設位置。
 * 函式必須同步，且不得呼叫 `console.*`（會遞迴）。
 */
export type TargetSource = LogTarget | ((call: ConsoleLogCall) => LogTarget | undefined)

/** `console.to.<method>(target, ...args)`：target 為字串時等同 `{ name: 字串 }`。 */
export type ConsoleTo = Record<ConsoleMethod, (target: TargetSource | string, ...args: unknown[]) => void>

declare global {
  interface Console {
    /** 把輸出寫到指定檔案目標（見 {@link LogTarget}）；是否同時輸出到 devtools 取決於 `installConsoleLog` 的 `devtools`。 */
    to: ConsoleTo
  }
}

export interface ConsoleLogOptions {
  /**
   * 是否呼叫原生 console（輸出到 devtools）。預設 `true`。
   * `false` 時**完全不呼叫**原生 console，release 版建議關閉以免額外負擔。SDK 不判斷 dev／release，由 App 傳入
   * （例如 Nuxt：`import.meta.dev`）。
   */
  devtools?: boolean
  /** 是否經 bridge 寫檔。預設 `true`；可用 `minLevel` 過濾（預設 `debug`）。非 Flutter 環境一律不寫。 */
  file?: boolean | { minLevel?: LogLevel }
  /** 一般 `console.*` 使用的目標（物件或函式，見 {@link TargetSource}）；省略則走殼的預設位置。可用 {@link setConsoleLogTarget} 在執行中更換。 */
  target?: TargetSource
  /**
   * 是否捕捉 `window` 的 `error` 與 `unhandledrejection`。預設 `true`。
   * 捕捉到的錯誤以 `console.error('[uncaught]', …)` 輸出（受 `devtools`／`file`／`target` 約束），並轉給殼的 reporter。
   */
  errors?: boolean
  /** 殼交來的 crash 紀錄寫到哪裡（物件或函式，函式於收到當下求值）；省略則與 `target` 相同。 */
  crashTarget?: TargetSource
}

export interface ConsoleLogDeps {
  /** 送出一筆 log；失敗請丟出（錯誤訊息前綴為殼回報的錯誤代碼）。 */
  send: (level: LogLevel, message: string, target?: LogTarget) => Promise<unknown>
  /** 目前能否寫檔（是否在 Flutter 殼內）。 */
  canWrite: () => boolean
  /** 被攔截的 console 物件。 */
  console: Console
  /** 訂閱殼送來的 crash 紀錄；回傳取消訂閱。 */
  onCrashReports?: (listener: (payload: CrashReportsPayload) => void) => () => void
  /** 確認已寫入的 crash 紀錄 id（殼據此刪除）；失敗請丟出。 */
  ackCrash?: (ids: string[]) => Promise<unknown>
  /** 把未捕捉錯誤轉給殼的 reporter；實作須自行吞掉失敗。 */
  reportError?: (report: ErrorReportRequest) => void
  /** 監聽 `error`／`unhandledrejection` 的對象（通常是 `window`）；省略則不捕捉。 */
  errorTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
}

/** 單筆訊息上限（字元），超過則截斷。 */
const MAX_MESSAGE_LENGTH = 64 * 1024
const TRUNCATED_SUFFIX = '…[truncated]'

const METHODS: readonly ConsoleMethod[] = ['debug', 'log', 'info', 'warn', 'error']

const LEVEL_BY_METHOD: Record<ConsoleMethod, LogLevel> = {
  debug: LogLevel.Debug,
  log: LogLevel.Info,
  info: LogLevel.Info,
  warn: LogLevel.Warn,
  error: LogLevel.Error,
}

const LEVEL_RANK: Record<LogLevel, number> = {
  [LogLevel.Debug]: 0,
  [LogLevel.Info]: 1,
  [LogLevel.Warn]: 2,
  [LogLevel.Error]: 3,
}

const KNOWN_ERROR_CODES = ['log_invalid_target', 'log_provider_unavailable'] as const

const formatArg = (arg: unknown): string => {
  if (typeof arg === 'string') {
    return arg
  }
  if (arg instanceof Error) {
    return arg.stack ?? arg.message
  }
  const seen = new WeakSet<object>()
  try {
    const json = JSON.stringify(arg, (_key, value: unknown) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]'
        }
        seen.add(value)
      }
      return typeof value === 'bigint' ? value.toString() : value
    })
    return json ?? String(arg)
  }
  catch {
    return String(arg)
  }
}

/** 把 console 參數轉成單行文字：以空格連接、換行轉義、超長截斷。 */
export const formatConsoleArgs = (args: readonly unknown[]): string => {
  const text = args.map(formatArg).join(' ').replace(/\r?\n/g, '\\n')
  return text.length > MAX_MESSAGE_LENGTH
    ? text.slice(0, MAX_MESSAGE_LENGTH - TRUNCATED_SUFFIX.length) + TRUNCATED_SUFFIX
    : text
}

const errorCodeOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  return KNOWN_ERROR_CODES.find(code => message.includes(code)) ?? 'log_error'
}

/** 把一筆 crash 紀錄轉成單行 log 文字。 */
export const formatCrashLine = (report: CrashReportPayload): string => {
  const head = `[crash:${report.source}${report.fatal ? ':fatal' : ''}] ${report.id} ${report.time} ${report.message}`
  return formatConsoleArgs([report.stack ? `${head} | ${report.stack}` : head])
}

let uninstallActive: (() => void) | undefined
let setTargetActive: ((target: TargetSource | undefined) => void) | undefined

/** 在執行中更換一般 `console.*` 的目標；尚未安裝時為 no-op。傳 `undefined` 回到殼的預設位置。 */
export const setConsoleLogTarget = (target: TargetSource | undefined): void => {
  setTargetActive?.(target)
}

/** 是否已安裝 console 攔截（供 App 層避免重複寫檔）。 */
export const isConsoleLogInstalled = (): boolean => uninstallActive !== undefined

/**
 * 安裝攔截；重複呼叫會先還原上一次再套用新設定。回傳 `uninstall()`。
 */
export const installConsoleLogWith = (deps: ConsoleLogDeps, options: ConsoleLogOptions = {}): (() => void) => {
  uninstallActive?.()

  const target = deps.console
  const devtools = options.devtools ?? true
  const fileOption = options.file ?? true
  const fileEnabled = fileOption !== false
  const minRank = LEVEL_RANK[(typeof fileOption === 'object' ? fileOption.minLevel : undefined) ?? LogLevel.Debug]

  const originals = {} as Record<ConsoleMethod, (...args: unknown[]) => void>
  for (const method of METHODS) {
    originals[method] = target[method].bind(target) as (...args: unknown[]) => void
  }
  const previousTo = (target as Partial<Console>).to

  let chain: Promise<unknown> = Promise.resolve()
  const warned = new Set<string>()

  // 寫檔失敗不得影響呼叫端；每種錯誤代碼只提示一次，且用保存的原始 console 避免遞迴。
  const report = (error: unknown, knownCode?: string): void => {
    const code = knownCode ?? errorCodeOf(error)
    if (warned.has(code)) {
      return
    }
    warned.add(code)
    originals.warn(`[aqutter console] 寫檔失敗（${code}）：${error instanceof Error ? error.message : String(error)}`)
  }

  // 同一頁面內串行送出以保證順序；回傳是否成功（失敗已由 report 提示，不會 reject）。
  const submit = (level: LogLevel, message: string, logTarget: LogTarget | undefined): Promise<boolean> => {
    const result = chain
      .then(() => deps.send(level, message, logTarget))
      .then(() => true, (error: unknown) => {
        report(error)
        return false
      })
    chain = result
    return result
  }

  // 函式目標在呼叫當下（排入佇列之前）同步求值，才能反映這筆 log 發生時的時間／狀態。
  const resolveTarget = (source: TargetSource | undefined, level: LogLevel, method: ConsoleMethod): LogTarget | undefined => {
    if (typeof source !== 'function') {
      return source
    }
    try {
      return source({ level, method, time: new Date() })
    }
    catch (error) {
      report(error, 'log_target_error')
      return undefined
    }
  }

  const enqueue = (method: ConsoleMethod, args: readonly unknown[], source: TargetSource | undefined): void => {
    const level = LEVEL_BY_METHOD[method]
    if (!fileEnabled || LEVEL_RANK[level] < minRank || !deps.canWrite()) {
      return
    }
    void submit(level, formatConsoleArgs(args), resolveTarget(source, level, method))
  }

  let defaultSource = options.target

  const original = {} as Record<ConsoleMethod, Console[ConsoleMethod]>
  const to = {} as ConsoleTo
  for (const method of METHODS) {
    original[method] = target[method]
    target[method] = (...args: unknown[]) => {
      if (devtools) {
        originals[method](...args)
      }
      enqueue(method, args, defaultSource)
    }
    to[method] = (logTarget, ...args) => {
      if (devtools) {
        originals[method](...args)
      }
      enqueue(method, args, typeof logTarget === 'string' ? { name: logTarget } : logTarget)
    }
  }
  target.to = to

  // 殼交來的 crash 紀錄：寫入成功的才 ack；檔案功能關閉或不在殼內時全數保留在殼端。
  const handleCrashReports = (payload: CrashReportsPayload): void => {
    if (!fileEnabled || !deps.canWrite() || !deps.ackCrash) {
      return
    }
    const ackCrash = deps.ackCrash
    const jobs = payload.reports.map(async (crash) => {
      const logTarget = resolveTarget(options.crashTarget ?? defaultSource, LogLevel.Error, 'error')
      return await submit(LogLevel.Error, formatCrashLine(crash), logTarget) ? crash.id : undefined
    })
    void Promise.all(jobs)
      .then(async (ids) => {
        const written = ids.filter((id): id is string => id !== undefined)
        if (written.length > 0) {
          await ackCrash(written)
        }
      })
      .catch(() => {})
  }
  const offCrashReports = deps.onCrashReports?.(handleCrashReports)

  // 未捕捉錯誤：走（已攔截的）console.error，讓 devtools／檔案設定一致，再轉給殼的 reporter。
  const surfaceUncaught = (reason: unknown): void => {
    const asError = reason instanceof Error ? reason : undefined
    target.error('[uncaught]', reason)
    deps.reportError?.({
      message: asError?.message ?? formatConsoleArgs([reason]),
      stack: asError?.stack,
      fatal: false,
    })
  }
  const onWindowError = (event: Event): void => {
    const { error, message } = event as ErrorEvent
    surfaceUncaught(error ?? message)
  }
  const onRejection = (event: Event): void => {
    surfaceUncaught((event as PromiseRejectionEvent).reason)
  }
  const errorTarget = options.errors === false ? undefined : deps.errorTarget
  errorTarget?.addEventListener('error', onWindowError)
  errorTarget?.addEventListener('unhandledrejection', onRejection)

  const uninstall = (): void => {
    if (uninstallActive !== uninstall) {
      return
    }
    offCrashReports?.()
    errorTarget?.removeEventListener('error', onWindowError)
    errorTarget?.removeEventListener('unhandledrejection', onRejection)
    for (const method of METHODS) {
      target[method] = original[method]
    }
    if (previousTo === undefined) {
      delete (target as Partial<Console>).to
    }
    else {
      target.to = previousTo
    }
    uninstallActive = undefined
    setTargetActive = undefined
  }
  uninstallActive = uninstall
  setTargetActive = (next) => {
    defaultSource = next
  }
  return uninstall
}
