/**
 * 橋接型別契約：把「handler / event 名稱」綁到「請求與回應的型別」。
 *
 * `./bridge.ts` 只有名稱與資料形狀，兩者之間沒有關聯，因此過去 `callFlutter<T>` 的 `T`
 * 完全由呼叫端自行宣告、無人驗證。本檔補上那條關聯，並以窮盡性守衛讓「新增了名稱卻
 * 忘記宣告型別」成為編譯錯誤而非執行期驚喜。
 *
 * ## 新增一個能力時要動的地方
 *
 * 1. `shell/lib/src/bridge/bridge_names.dart` — 加常數
 * 2. `shell/lib/src/bridge/bridge_registry.dart` — `_handle(...)` 實作
 * 3. `./bridge.ts` — 加列舉成員 + req/res 型別
 * 4. **本檔 — 加一行契約**（漏了會編譯失敗）
 * 5. composable — 呼叫端**不需要**再標註任何型別
 *
 * ## 契約管得到什麼、管不到什麼
 *
 * 契約是**編譯期**保證，且只涵蓋 TypeScript 這一側。payload 實際由 Dart 以 JSON 送來，
 * 型別系統對它一無所知——需要執行期保證的呼叫端必須自行驗證（範例見
 * 使用端對 `AppKey` 逐一檢查值的作法）。跨語言的名稱漂移則由
 * client 的 `setBridgeCapabilities` 在提供 `onMismatch` 時雙向比對。
 */

import type { PlatformInfo } from './models/platform'
import type { BatteryInfo, DeviceId, DeviceInfo } from './models/device'
import type { BroadcastAction, NetworkStatus } from './models/broadcast'
import type {
  BridgeEvent,
  BridgeHandler,
  BundleApplyUpdateResult,
  BundleCheckResult,
  BundleDownloadRequest,
  BundleInfo,
  DownloadProgressPayload,
  DownloadRequest,
  DownloadResponse,
  HardwareKeyPayload,
  HostDownloadRequest,
  HttpAbortRequest,
  HttpFetchRequest,
  HttpFetchResponse,
  NativeEndpoint,
  LocaleResponse,
  LogAppendRequest,
  LogDirResponse,
  LogListResponse,
  LogNameRequest,
  LogReadResponse,
  LogSetKeyRequest,
  LogWriteRequest,
  OkResponse,
  OpenUrlRequest,
  OrientationLockRequest,
  PermissionRequest,
  PermissionResponse,
  PickerRequest,
  PickerResponse,
  StatusBarImmersiveRequest,
  StoreGetRequest,
  StoreGetResponse,
  StoreSetRequest,
  TcpClientRequest,
  TcpConnectRequest,
  TcpDiagnoseRequest,
  TcpDiagnoseResponse,
  TcpReadRequest,
  TcpSendRequest,
  ThemeSetRequest,
  UpdateAcceptance,
  UpdateConfigInfo,
  UpdateConfigRequest,
  UpdateConfigResult,
  UpdateStatePayload,
} from './bridge'

/**
 * 標記「此 handler 不吃 payload」或「此事件沒有酬載」。
 *
 * 刻意不用 `void`：`@typescript-eslint/no-invalid-void-type` 禁止 `void` 出現在
 * 回傳型別以外的位置，而這裡是屬性型別。具名之後語意也比 `void` 明確。
 */
export type NoPayload = undefined

/**
 * 單一 handler 的請求與回應型別。
 *
 * `res` 刻意不限制為物件：Dart 端的 `tcp_connect` 直接回 `int`、`tcp_read` 直接回
 * `List<int>`（`bridge_registry.dart:551,563`），並非每個 handler 都包成 map。
 */
interface BridgeSpec {
  /** 呼叫時要帶的 payload；{@link NoPayload} 表示不吃，此時多傳參數會編譯失敗。 */
  req: unknown
  /** `callFlutter` 解析後的回傳值。 */
  res: unknown
}

/**
 * JS→Dart 的完整契約（互動模式 1 / 2 / 3）。
 *
 * 對應 `shell/lib/src/bridge/bridge_registry.dart` 的 `register` 系列。
 */
export type BridgeContract = {
  [BridgeHandler.PlatformInfo]: { req: NoPayload, res: PlatformInfo }
  [BridgeHandler.AppReady]: { req: NoPayload, res: OkResponse }
  [BridgeHandler.NativeEndpoint]: { req: NoPayload, res: NativeEndpoint }


  [BridgeHandler.StoreGet]: { req: StoreGetRequest, res: StoreGetResponse }
  [BridgeHandler.StoreSet]: { req: StoreSetRequest, res: OkResponse }

  [BridgeHandler.Download]: { req: DownloadRequest, res: DownloadResponse }

  [BridgeHandler.LogList]: { req: NoPayload, res: LogListResponse }
  [BridgeHandler.LogRead]: { req: LogNameRequest, res: LogReadResponse }
  [BridgeHandler.LogWrite]: { req: LogWriteRequest, res: OkResponse }
  [BridgeHandler.LogRemove]: { req: LogNameRequest, res: OkResponse }
  [BridgeHandler.LogDir]: { req: NoPayload, res: LogDirResponse }
  [BridgeHandler.LogAppend]: { req: LogAppendRequest, res: OkResponse }
  [BridgeHandler.LogSetKey]: { req: LogSetKeyRequest, res: OkResponse }

  [BridgeHandler.DeviceId]: { req: NoPayload, res: DeviceId }
  [BridgeHandler.DeviceInfo]: { req: NoPayload, res: DeviceInfo }
  [BridgeHandler.DeviceBattery]: { req: NoPayload, res: BatteryInfo }
  [BridgeHandler.DeviceNetwork]: { req: NoPayload, res: NetworkStatus }
  [BridgeHandler.DeviceLocale]: { req: NoPayload, res: LocaleResponse }

  [BridgeHandler.PermCheck]: { req: PermissionRequest, res: PermissionResponse }
  [BridgeHandler.PermRequest]: { req: PermissionRequest, res: PermissionResponse }
  [BridgeHandler.PermOpenSettings]: { req: NoPayload, res: OkResponse }

  [BridgeHandler.OpenerOpen]: { req: OpenUrlRequest, res: OkResponse }
  [BridgeHandler.IabOpen]: { req: OpenUrlRequest, res: OkResponse }
  [BridgeHandler.IabClose]: { req: NoPayload, res: OkResponse }

  [BridgeHandler.PickerPick]: { req: PickerRequest, res: PickerResponse }

  [BridgeHandler.HttpFetch]: { req: HttpFetchRequest, res: HttpFetchResponse }
  [BridgeHandler.HttpAbort]: { req: HttpAbortRequest, res: OkResponse }

  [BridgeHandler.BundleInfo]: { req: NoPayload, res: BundleInfo }
  [BridgeHandler.BundleCheckUpdate]: { req: NoPayload, res: BundleCheckResult }
  [BridgeHandler.UpdateConfigGet]: { req: NoPayload, res: UpdateConfigInfo }
  [BridgeHandler.UpdateConfigSet]: { req: UpdateConfigRequest, res: UpdateConfigResult }
  [BridgeHandler.UpdateConfigReset]: { req: NoPayload, res: UpdateConfigResult }
  [BridgeHandler.BundleDownloadUpdate]: { req: BundleDownloadRequest, res: UpdateAcceptance }
  [BridgeHandler.BundleApplyUpdate]: { req: NoPayload, res: BundleApplyUpdateResult }
  [BridgeHandler.HostDownloadUpdate]: { req: HostDownloadRequest, res: UpdateAcceptance }
  [BridgeHandler.HostInstallUpdate]: { req: NoPayload, res: UpdateAcceptance }

  // tcp_connect / tcp_read 回傳裸值而非物件，見 BridgeSpec.res 的說明
  [BridgeHandler.TcpConnect]: { req: TcpConnectRequest, res: number }
  [BridgeHandler.TcpDisconnect]: { req: TcpClientRequest, res: OkResponse }
  [BridgeHandler.TcpSend]: { req: TcpSendRequest, res: OkResponse }
  [BridgeHandler.TcpRead]: { req: TcpReadRequest, res: number[] }
  [BridgeHandler.TcpDiagnose]: { req: TcpDiagnoseRequest, res: TcpDiagnoseResponse }

  [BridgeHandler.OrientationLock]: { req: OrientationLockRequest, res: OkResponse }
  [BridgeHandler.OrientationUnlock]: { req: NoPayload, res: OkResponse }

  [BridgeHandler.StatusBarShow]: { req: NoPayload, res: OkResponse }
  [BridgeHandler.StatusBarHide]: { req: NoPayload, res: OkResponse }
  [BridgeHandler.StatusBarImmersive]: { req: StatusBarImmersiveRequest, res: OkResponse }

  [BridgeHandler.ThemeSet]: { req: ThemeSetRequest, res: OkResponse }
  [BridgeHandler.MinimizeApp]: { req: NoPayload, res: OkResponse }
}

/**
 * 依契約決定「這個 handler 到底吃不吃 payload」。
 *
 * `req: NoPayload` 的 handler 展開為空參數列，因此多傳一個參數會編譯失敗，漏傳也會。
 * 除了 `callFlutter` 本身，任何轉呼叫它的包裝函式（如 `flutterUiBridge` 的 `fire`）
 * 也應以本型別宣告參數，否則泛型會在包裝處被抹平、契約在該層失效。
 */
export type PayloadArgs<H extends BridgeHandler>
  = BridgeContract[H]['req'] extends NoPayload ? [] : [payload: BridgeContract[H]['req']]

/**
 * Dart→JS 的完整契約（互動模式 6：單向通知，無回傳值）。
 *
 * payload 由 `shell/lib/src/bridge/bridge_emitter.dart` 以 JSON 送出。
 * `AndroidBack` 無酬載，故為 {@link NoPayload}——監聽器不會拿到有意義的參數。
 *
 * **Dart 無法向網頁層要資料**（互動模式 4 / 5）：`dispatch` 回傳 `void` 且丟棄 listener
 * 的回傳值，`emit` 也 discard 掉 `evaluateJavascript` 的結果。這條通道是單向的。
 */
export type BridgeEventContract = {
  [BridgeEvent.Battery]: BatteryInfo
  [BridgeEvent.Network]: NetworkStatus
  [BridgeEvent.Action]: BroadcastAction
  [BridgeEvent.AndroidBack]: NoPayload
  [BridgeEvent.HardwareKey]: HardwareKeyPayload
  [BridgeEvent.DownloadProgress]: DownloadProgressPayload
  [BridgeEvent.UpdateState]: UpdateStatePayload
}

/**
 * 窮盡性守衛：任一列舉成員缺契約時，下方的宣告編譯失敗，訊息直接指名缺少的成員：
 *
 * ```
 * error TS2322: Type 'true' is not assignable to type 'BridgeHandler.DeviceStorage'.
 * ```
 *
 * 刻意**不用** `interface X extends Record<BridgeHandler, BridgeSpec>`：實測證實 interface
 * 會從 `Record` **繼承**缺少的鍵並把型別放寬為 `BridgeSpec`，「缺項」根本不成立，
 * 完全不會報錯。必須用純型別別名搭配 `Exclude<>` 才有真正的強制力。
 */
type MissingHandlerContract = Exclude<BridgeHandler, keyof BridgeContract>
const _handlersExhaustive: MissingHandlerContract extends never ? true : MissingHandlerContract = true

type MissingEventContract = Exclude<BridgeEvent, keyof BridgeEventContract>
const _eventsExhaustive: MissingEventContract extends never ? true : MissingEventContract = true

/** 形狀守衛：每一項都必須是 `{ req, res }`，避免手滑寫成別的形狀而繞過型別推導。 */
const _contractShape: BridgeContract extends Record<keyof BridgeContract, BridgeSpec> ? true : never = true

export {
  _contractShape,
  _eventsExhaustive,
  _handlersExhaustive,
}
