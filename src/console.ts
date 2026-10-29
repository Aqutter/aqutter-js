import { LogLevel } from './contract/bridge'
import type { LogTarget } from './contract/bridge'

/**
 * `console.*` 攔截與 `console.to.*` 擴充。
 *
 * 本檔只含與傳輸無關的核心（依賴由 {@link ConsoleLogDeps} 注入），`installConsoleLog` 的接線在 `index.ts`，
 * 避免與 `index.ts` 互相引用。
 */

/** 被攔截、也提供 `console.to.*` 版本的 console 方法。 */
export type ConsoleMethod = 'debug' | 'log' | 'info' | 'warn' | 'error'

/** `console.to.<method>(target, ...args)`：target 為字串時等同 `{ name: 字串 }`。 */
export type ConsoleTo = Record<ConsoleMethod, (target: LogTarget | string, ...args: unknown[]) => void>

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
  /** 一般 `console.*` 使用的目標；省略則走殼的預設位置。 */
  target?: LogTarget
}

export interface ConsoleLogDeps {
  /** 送出一筆 log；失敗請丟出（錯誤訊息前綴為殼回報的錯誤代碼）。 */
  send: (level: LogLevel, message: string, target?: LogTarget) => Promise<unknown>
  /** 目前能否寫檔（是否在 Flutter 殼內）。 */
  canWrite: () => boolean
  /** 被攔截的 console 物件。 */
  console: Console
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
  return KNOWN_ERROR_CODES.find(code => message.startsWith(code)) ?? 'log_error'
}

let uninstallActive: (() => void) | undefined

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
  const report = (error: unknown): void => {
    const code = errorCodeOf(error)
    if (warned.has(code)) {
      return
    }
    warned.add(code)
    originals.warn(`[aqutter console] 寫檔失敗（${code}）：${error instanceof Error ? error.message : String(error)}`)
  }

  // 同一頁面內串行送出以保證順序。
  const enqueue = (method: ConsoleMethod, args: readonly unknown[], logTarget: LogTarget | undefined): void => {
    const level = LEVEL_BY_METHOD[method]
    if (!fileEnabled || LEVEL_RANK[level] < minRank || !deps.canWrite()) {
      return
    }
    const message = formatConsoleArgs(args)
    chain = chain.then(() => deps.send(level, message, logTarget)).catch(report)
  }

  const original = {} as Record<ConsoleMethod, Console[ConsoleMethod]>
  const to = {} as ConsoleTo
  for (const method of METHODS) {
    original[method] = target[method]
    target[method] = (...args: unknown[]) => {
      if (devtools) {
        originals[method](...args)
      }
      enqueue(method, args, options.target)
    }
    to[method] = (logTarget, ...args) => {
      if (devtools) {
        originals[method](...args)
      }
      enqueue(method, args, typeof logTarget === 'string' ? { name: logTarget } : logTarget)
    }
  }
  target.to = to

  const uninstall = (): void => {
    if (uninstallActive !== uninstall) {
      return
    }
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
  }
  uninstallActive = uninstall
  return uninstall
}
