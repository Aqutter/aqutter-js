import { BridgeHandler } from './contract/bridge'
import type { BridgeEvent } from './contract/bridge'
import type { BridgeContract, BridgeEventContract, PayloadArgs } from './contract/table'

/**
 * Flutter 橋接底層：runtime 偵測、JS→原生 handler 呼叫、原生→JS 事件頻道。
 *
 * 取代 Tauri 版的 `@tauri-apps/api` invoke/event。原生端為 aqutter_core
 * 的 `AqutterWebViewController`，以 `addJavaScriptHandler` 對接 `callFlutter`，
 * 並以 `evaluateJavascript` 呼叫 `window.__flutterBridgeEmit` 派送事件。
 *
 * 兩個入口的型別皆由 `./contract/table` 的契約表決定，呼叫端與監聽端
 * **不需要**也**不應該**再標註泛型或斷言 payload。
 */

/** aqutter_core 注入於 `window.aqutter` 的橋接介面（僅在 Flutter WebView 內存在）。 */
interface AqutterBridge {
  /** 呼叫原生註冊的 handler，回傳其結果的 Promise。 */
  callHandler: (handlerName: string, ...args: unknown[]) => Promise<unknown>
}

/**
 * 內部用的監聽器型別。
 *
 * 對外的 {@link onFlutterEvent} 以契約決定 payload 型別；此處存進 Map 時已無法保留
 * 個別頻道的型別關聯，故以 `never` 收斂（逆變位置上可接受任何具體 payload 型別）。
 */
type StoredListener = (payload: never) => void

/** 取消事件監聽。 */
type Unsubscribe = () => void

/** channel → 監聽器集合。 */
const listeners = new Map<string, Set<StoredListener>>()

/** 全域事件派送函式的掛載旗標，避免重複註冊。 */
let emitterAttached = false

/**
 * 是否為沒有 `window` 的伺服端環境（SSR / 預渲染）。
 * 以 `typeof window` 判斷而非建置工具的 `import.meta.server`，套件才不綁定特定框架或打包器。
 */
const isServer = (): boolean => typeof window === 'undefined'

const getFlutter = (): AqutterBridge | undefined => {
  if (isServer()) {
    return undefined
  }
  return (window as unknown as { aqutter?: AqutterBridge }).aqutter
}

/**
 * 是否運行於 Flutter（aqutter_core）殼內。
 * 為純瀏覽器 / SSR 以外唯一的原生判斷依據。
 */
export const isFlutter = (): boolean => getFlutter() !== undefined

/**
 * 呼叫原生 handler。非 Flutter 環境直接拋錯，避免 silent failure。
 *
 * payload 與回傳型別皆由 {@link BridgeContract} 決定——**不要**再標註泛型，
 * 泛型參數是 handler 本身而非回應型別。
 *
 * @param handler handler 名稱
 * @param payload 單一酬載物件（JSON 可序列化）；契約中 `req: void` 者不接受此參數
 */
export const callFlutter = async <H extends BridgeHandler>(
  handler: H,
  ...[payload]: PayloadArgs<H>
): Promise<BridgeContract[H]['res']> => {
  const flutter = getFlutter()
  if (!flutter) {
    throw new Error(`[flutterBridge] callFlutter(${handler}) is only available inside Flutter`)
  }
  const result = await flutter.callHandler(handler, payload ?? {})
  // 跨語言邊界：型別系統對 Dart 送回什麼一無所知，這是刻意保留的唯一一處斷言。
  // 需要執行期保證的呼叫端請自行驗證（作法是使用端對 `AppKey` 逐一檢查值）。
  return result as BridgeContract[H]['res']
}

/**
 * host 回報的本平台可用 handler 名稱；null 表示尚未取得（啟動早期或非原生環境）。
 * 由 {@link setBridgeCapabilities} 在 `platform_info` 回來後填入。
 */
let capabilities: ReadonlySet<string> | null = null

/** 兩端 handler 名單的差異；兩個陣列皆為空代表名單一致。 */
export interface BridgeNameMismatch {
  /**
   * 網頁端宣告、host 沒提供的 handler。
   * 平台不支援（如桌面的 statusbar_*）也會落在此，故需人工判讀，不屬於錯誤。
   */
  missingOnHost: readonly string[]
  /** host 提供、網頁端沒宣告的核心 handler（不含 plugin 的 `<id>.<method>`）。這一類**沒有**正常情況：就是漏加或拼錯。 */
  missingOnWeb: readonly string[]
}

/** {@link setBridgeCapabilities} 的選項。 */
export interface BridgeCapabilitiesOptions {
  /**
   * 兩端名單有任何差異時呼叫；未提供則完全不比對。
   * 套件本身不判斷是否為開發環境，由呼叫端決定要不要傳（例如只在 dev 模式傳入）。
   */
  onMismatch?: (mismatch: BridgeNameMismatch) => void
}

/**
 * 寫入 host 回報的能力表。應僅由平台資訊載入流程呼叫一次。
 *
 * 提供 `onMismatch` 時**雙向**比對兩端名單：`BridgeHandler` 與 Dart 的 `BridgeHandler` 是同一份
 * 名稱存在兩種語言、編譯器管不到（TS 這一側的完整性由 `contract/table.ts` 的窮盡性守衛負責，
 * 但它同樣管不到 Dart）。唯一的失敗模式就是「只改了一邊」或拼錯，在啟動當下把差異交給
 * 呼叫端，把 runtime 才炸的錯提前到開發時可見。
 */
export const setBridgeCapabilities = (
  names: readonly string[] | undefined,
  options: BridgeCapabilitiesOptions = {},
): void => {
  if (!names) {
    capabilities = null
    return
  }
  capabilities = new Set(names)

  const { onMismatch } = options
  if (!onMismatch) {
    return
  }

  const hostNames = new Set<string>(names)
  const webNames = new Set<string>(Object.values(BridgeHandler))

  const missingOnHost = [...webNames].filter(name => !hostNames.has(name))
  // plugin 的 handler 名稱是 `<plugin id>.<method>`（見 pluginHandlerName），宣告在各 plugin 自己的契約，
  // 不在核心的 BridgeHandler 表裡；plugin id 不含 `.`、核心名稱也沒有 `.`，所以含 `.` 的一律不算「漏宣告」。
  const missingOnWeb = [...hostNames].filter(name => !webNames.has(name) && !name.includes('.'))
  if (missingOnHost.length === 0 && missingOnWeb.length === 0) {
    return
  }
  onMismatch({
    missingOnHost,
    missingOnWeb,
  })
}

/**
 * 本平台是否真的做得到這件事。取代散落各處的 `platform === 'android'` 硬判斷。
 *
 * 能力表尚未取得時一律視為支援：寧可呼叫下去讓 host 決定，也不要在啟動早期
 * （`platform_info` 尚未回來）誤判成不支援而靜默略過使用者要的操作。
 */
export const isBridgeSupported = (handler: BridgeHandler): boolean => {
  if (!isFlutter()) {
    return false
  }
  return capabilities === null || capabilities.has(handler)
}

/**
 * 派送事件給該 channel 的所有監聽器；供全域派送函式與內部使用。
 *
 * 刻意回傳 `void` 並丟棄監聽器的回傳值——這條通道是**單向**的，Dart 端的
 * `bridge_emitter.dart` 同樣不讀取 `evaluateJavascript` 的結果。原生層無法向網頁層
 * 索取資料；需要那種互動時得另建請求通道，不要試圖從這裡回傳。
 */
const dispatch = (channel: string, payload: unknown): void => {
  const set = listeners.get(channel)
  if (!set) {
    return
  }
  for (const listener of set) {
    (listener as (value: unknown) => void)(payload)
  }
}

/**
 * 掛載全域派送函式 `window.__flutterBridgeEmit`，供原生端以 evaluateJavascript 呼叫。
 * 冪等：僅在客戶端且尚未掛載時執行一次。
 */
const ensureEmitter = (): void => {
  if (emitterAttached || isServer()) {
    return
  }
  ;(window as unknown as { __flutterBridgeEmit?: (channel: string, payload: unknown) => void })
    .__flutterBridgeEmit = dispatch
  emitterAttached = true
}

/**
 * 訂閱原生→JS 事件。回傳取消訂閱函式。
 *
 * payload 型別由 {@link BridgeEventContract} 決定——**不要**再 `payload as X`。
 * 若確實需要執行期保證（payload 來自原生層的 JSON，型別是編譯期概念），
 * 請在 listener 內明確驗證並註明理由。
 *
 * @param channel 事件頻道
 * @param listener 事件處理器
 */
export const onFlutterEvent = <C extends BridgeEvent>(
  channel: C,
  listener: (payload: BridgeEventContract[C]) => void,
): Unsubscribe => {
  ensureEmitter()
  const set = listeners.get(channel) ?? new Set<StoredListener>()
  const stored = listener as StoredListener
  set.add(stored)
  listeners.set(channel, set)
  return () => {
    set.delete(stored)
  }
}

/* ------------------------------------------------------------------ *
 * Plugin API：第三方 plugin 的網頁端入口。
 *
 * plugin 在 Dart 端以 `AqutterPlugin` 暴露 handler（名稱 `<id>.<method>`）與事件（頻道
 * `<id>.<event>`）。plugin 的 npm 套件以 TypeScript module augmentation 把自己的契約併入
 * {@link AqutterPluginRegistry}，使用端即可得到與內建 handler 同等的型別：
 *
 *   declare module '@aqutter/aqutter' {
 *     interface AqutterPluginRegistry {
 *       haptics: PluginDefinition<{ impact: { req: { style: 'light' | 'heavy' }, res: { ok: true } } }, {}>
 *     }
 * ------------------------------------------------------------------ */

/** 單一方法的請求 / 回應型別。 */
export interface PluginMethod {
  req: unknown
  res: unknown
}

/** plugin 契約：方法表與事件表（事件名 → payload 型別）。 */
export interface PluginDefinition<
  M extends Record<string, PluginMethod> = Record<string, PluginMethod>,
  E extends Record<string, unknown> = Record<string, unknown>,
> {
  methods: M
  events: E
}

/** 已註冊契約的 plugin 表；由各 plugin 套件以 module augmentation 擴充。 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AqutterPluginRegistry {}

type RegistryId = keyof AqutterPluginRegistry & string
type MethodsOf<Id extends RegistryId> = AqutterPluginRegistry[Id] extends { methods: infer M } ? M : never
type EventsOf<Id extends RegistryId> = AqutterPluginRegistry[Id] extends { events: infer E } ? E : never

/** 與 Dart 端 `aqutterPluginHandlerName` 同一條命名規則。 */
export const pluginHandlerName = (pluginId: string, method: string): string => `${pluginId}.${method}`

/** 與 Dart 端 `aqutterPluginEventChannel` 同一條命名規則。 */
export const pluginEventChannel = (pluginId: string, event: string): string => `${pluginId}.${event}`

/**
 * 呼叫 plugin 方法（未型別化）。plugin 沒有發佈契約，或在 Flutter 之外時使用；
 * 非 Flutter 環境直接拋錯，與 {@link callFlutter} 一致。
 */
export const callPluginRaw = async (pluginId: string, method: string, payload?: unknown): Promise<unknown> => {
  const flutter = getFlutter()
  const name = pluginHandlerName(pluginId, method)
  if (!flutter) {
    throw new Error(`[flutterBridge] callPlugin(${name}) is only available inside Flutter`)
  }
  return flutter.callHandler(name, payload ?? {})
}

/** 呼叫 plugin 方法；型別由 {@link AqutterPluginRegistry} 決定。 */
export const callPlugin = async <Id extends RegistryId, M extends keyof MethodsOf<Id> & string>(
  pluginId: Id,
  method: M,
  ...[payload]: MethodsOf<Id>[M] extends { req: void } ? [] : [payload: MethodsOf<Id>[M] extends { req: infer R } ? R : never]
): Promise<MethodsOf<Id>[M] extends { res: infer R } ? R : never> => {
  return await callPluginRaw(pluginId, method, payload) as MethodsOf<Id>[M] extends { res: infer R } ? R : never
}

/** 訂閱 plugin 事件（未型別化）。回傳取消訂閱函式。 */
export const onPluginEventRaw = (pluginId: string, event: string, listener: (payload: unknown) => void): Unsubscribe => {
  ensureEmitter()
  const channel = pluginEventChannel(pluginId, event)
  const set = listeners.get(channel) ?? new Set<StoredListener>()
  const stored = listener as StoredListener
  set.add(stored)
  listeners.set(channel, set)
  return () => {
    set.delete(stored)
  }
}

/** 訂閱 plugin 事件；payload 型別由 {@link AqutterPluginRegistry} 決定。 */
export const onPluginEvent = <Id extends RegistryId, E extends keyof EventsOf<Id> & string>(
  pluginId: Id,
  event: E,
  listener: (payload: EventsOf<Id>[E]) => void,
): Unsubscribe => onPluginEventRaw(pluginId, event, listener as (payload: unknown) => void)

/**
 * plugin 方法在本平台是否可用。能力表尚未取得時視為支援（理由同 {@link isBridgeSupported}）。
 * plugin 的 handler 一律列入 host 的能力表，故沒裝該 plugin 的 App 會得到 false。
 */
export const isPluginSupported = (pluginId: string, method: string): boolean => {
  if (!isFlutter()) {
    return false
  }
  return capabilities === null || capabilities.has(pluginHandlerName(pluginId, method))
}

export * from './nativeview'
