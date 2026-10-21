/**
 * Flutter 橋接契約：handler 名稱、event 頻道名稱與跨層資料模型。
 *
 * 對應 Flutter host（`shell/lib/src/bridge/*.dart`）以 `addJavaScriptHandler`
 * 註冊的 handler，以及原生→JS 的事件頻道。所有名稱集中於此，避免魔法字串散落。
 *
 * 本檔只定義**名稱與資料形狀**；「哪個 handler 對應哪組 req/res」由
 * `./table.ts` 的契約表綁定，並在該處以窮盡性守衛強制每個列舉成員都有契約。
 */

import type { ScreenOrientation } from './models/screenOrientation'
import type { AppKey } from './models/key'
import type { PermissionStatus, PermissionType } from './models/permission'
import type { FilePickerMode, FilePickerOptions } from './models/filePicker'

/** JS→原生：`window.aqutter.callHandler(name, payload)` 的 handler 名稱。 */
export enum BridgeHandler {
  /** 啟動時取得平台資訊（OS / 版本 / 是否行動端）。 */
  PlatformInfo = 'platform_info',
  /** 網頁層已掛載且首次繪製完成；原生層據此移除啟動過場。 */
  AppReady = 'app_ready',
  /** native view 鏡像的 WebSocket 連線資訊（埠與令牌）。 */
  NativeEndpoint = 'native_endpoint',

  /** 執行單句 SQL（含 bind 參數）。 */
  DbExec = 'db_exec',
  /** 開啟資料庫；以名稱（app 目錄）或絕對路徑（NC 模式）。 */
  DbOpen = 'db_open',

  /** 讀取 KV 值。 */
  StoreGet = 'store_get',
  /** 寫入 KV 值。 */
  StoreSet = 'store_set',

  /** 下載檔案至系統目錄，過程以 event 回拋進度。 */
  Download = 'download',

  /** 列出 log 目錄下的 .log 檔資訊。 */
  LogList = 'log_list',
  /** 讀取指定 log 檔文字內容。 */
  LogRead = 'log_read',
  /** 寫入位元組到 log 目錄下指定檔名（zip 備份用）。 */
  LogWrite = 'log_write',
  /** 刪除 log 目錄下指定檔案。 */
  LogRemove = 'log_remove',
  /** 取得 log 目錄絕對路徑。 */
  LogDir = 'log_dir',
  /** 追加一行文字到當前 log 檔（前端日誌落地）。 */
  LogAppend = 'log_append',
  /** 設定 log 檔名 key；檔名為 `{key}_{本地日期}.log`，可執行中變更。 */
  LogSetKey = 'log_set_key',

  /** 取得裝置唯一 ID。 */
  DeviceId = 'device_id',
  /** 取得裝置資訊（platform / osVersion / arch）。 */
  DeviceInfo = 'device_info',
  /** 取得電量資訊。 */
  DeviceBattery = 'device_battery',
  /** 取得目前網路狀態；供訂閱事件前先取得初始值（事件僅在狀態改變時推送）。 */
  DeviceNetwork = 'device_network',
  /** 取得系統語系標籤（BCP-47）。 */
  DeviceLocale = 'device_locale',

  /** 查詢權限狀態。 */
  PermCheck = 'perm_check',
  /** 請求權限。 */
  PermRequest = 'perm_request',
  /** 開啟系統 App 設定頁。 */
  PermOpenSettings = 'perm_open_settings',

  /** 以系統瀏覽器外開 URL。 */
  OpenerOpen = 'opener_open',

  /** 開啟 In-App Browser（Custom Tabs / SFSafariViewController）。 */
  IabOpen = 'iab_open',
  /** 關閉 In-App Browser。 */
  IabClose = 'iab_close',

  /** 檔案 / 資料夾選擇。 */
  PickerPick = 'picker_pick',

  /** 原生 HTTP 發送（繞開 WebView CORS）。 */
  HttpFetch = 'http_fetch',
  /** 取消進行中的原生 HTTP 請求。 */
  HttpAbort = 'http_abort',

  /** 查詢網頁包版本。 */
  BundleInfo = 'bundle_info',
  /** 查詢是否有新網頁包（含殼是否過舊）；純查詢，不下載、不動畫面。 */
  BundleCheckUpdate = 'bundle_check_update',
  /** 讀取目前生效的版更端點（不含 API KEY 值）與編譯期預設。 */
  UpdateConfigGet = 'update_config_get',
  /** 設定版更端點覆寫（切換版更伺服器）；持久化、冷啟沿用，設定後立即影響之後的查詢與下載。 */
  UpdateConfigSet = 'update_config_set',
  /** 清除版更端點覆寫，回到編譯期預設。 */
  UpdateConfigReset = 'update_config_reset',
  /** 背景下載並解包網頁包；`apply`（預設 true）為 true 時下載完直接套用。進度以 {@link BridgeEvent.UpdateState} 回報。 */
  BundleDownloadUpdate = 'bundle_download_update',
  /** 套用已下載的網頁包（原生層會接管畫面）；沒有待套用的網頁包時退回「查版本→下載→套用」一條龍。 */
  BundleApplyUpdate = 'bundle_apply_update',
  /** 背景下載殼的 APK（Android、`updateType: apk` 限定）；`install`（預設 true）為 true 時下載完直接喚起安裝器。 */
  HostDownloadUpdate = 'host_download_update',
  /** 安裝已下載的 APK。 */
  HostInstallUpdate = 'host_install_update',

  /** 建立 TCP 連線。 */
  TcpConnect = 'tcp_connect',
  /** 關閉 TCP 連線。 */
  TcpDisconnect = 'tcp_disconnect',
  /** TCP 送出位元組。 */
  TcpSend = 'tcp_send',
  /** TCP 讀取位元組。 */
  TcpRead = 'tcp_read',
  /** TCP 連線診斷。 */
  TcpDiagnose = 'tcp_diagnose',

  /** 鎖定螢幕方向。 */
  OrientationLock = 'orientation_lock',
  /** 解除螢幕方向鎖定。 */
  OrientationUnlock = 'orientation_unlock',

  /** 顯示狀態列。 */
  StatusBarShow = 'statusbar_show',
  /** 隱藏狀態列。 */
  StatusBarHide = 'statusbar_hide',
  /** 狀態列沉浸模式。 */
  StatusBarImmersive = 'statusbar_immersive',

  /** 回報 App 主題亮度，讓原生的系統列圖示與底色跟著 App 主題而非系統。 */
  ThemeSet = 'theme_set',

  /** 將 App 最小化（返回桌面）。 */
  MinimizeApp = 'minimize_app',
}

/** 日誌層級。 */
export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

/** 原生→JS：透過 `window.__flutterBridgeEmit(channel, payload)` 派送的事件頻道名稱。 */
export enum BridgeEvent {
  /** 電量狀態更新。 */
  Battery = 'broadcast_battery',
  /** 網路狀態更新。 */
  Network = 'broadcast_network',
  /** 自訂 action 廣播。 */
  Action = 'broadcast_action',
  /** Android 實體返回鍵按下。 */
  AndroidBack = 'flutter-android-back',
  /**
   * 原生攔截到的功能鍵，payload 為 `{ key: AppKey }`（已於原生層正規化為平台無關值）。
   * Android 攔在 MainActivity.dispatchKeyEvent，先於 view 階層，故與輸入框焦點無關。
   */
  HardwareKey = 'flutter-hardware-key',
  /** 下載進度更新。 */
  DownloadProgress = 'download_progress',
  /** 更新流程（網頁包／殼）的每個狀態，payload 為 {@link UpdateStatePayload}。 */
  UpdateState = 'update_state',
}

/**
 * 副作用型 handler 的回應。
 *
 * Dart 端多數 handler 一律 `return {'ok': true}`，即使該平台實際上什麼都沒做
 * （見 `bridge_registry.dart` 的 `_handle` 註解）。因此**不要**把它當成「成功」的證據：
 * 「這個平台做不做得到」請改查 {@link isBridgeSupported}。
 */
/** native view 鏡像連線資訊。 */
export interface NativeEndpoint {
  port: number
  /** 本次啟動的隨機令牌；連線時以 query `token` 帶上。 */
  token: string
}

export interface OkResponse {
  ok: true
}

/** KV 讀取請求。 */
export interface StoreGetRequest {
  key: string
}

/** KV 讀取結果；鍵不存在時為 null。 */
export interface StoreGetResponse {
  value: string | null
}

/** KV 寫入請求。 */
export interface StoreSetRequest {
  key: string
  value: string
}

/** log 目錄下單一檔案的資訊。 */
export interface LogFileInfo {
  /** 檔名。 */
  name: string
  /** 相對路徑（目前與 name 相同）。 */
  path: string
  /** 位元組大小。 */
  size: number
  /** 最後修改時間（epoch 毫秒）。 */
  mtime: number
}

/** log 檔列表。 */
export interface LogListResponse {
  files: LogFileInfo[]
}

/** 指定 log 檔名的請求；LogRead / LogRemove 共用。 */
export interface LogNameRequest {
  name: string
}

/** log 檔文字內容。 */
export interface LogReadResponse {
  content: string
}

/** 寫入 log 目錄的請求（zip 備份用）。 */
export interface LogWriteRequest {
  name: string
  /** 檔案內容（base64）。 */
  bytesBase64: string
}

/** log 目錄絕對路徑。 */
export interface LogDirResponse {
  dir: string
}

/** 追加一行前端日誌。 */
export interface LogAppendRequest {
  level: LogLevel
  message: string
}

/** 設定 log 檔名 key。 */
export interface LogSetKeyRequest {
  key: string
}

/** 系統語系（BCP-47）。 */
export interface LocaleResponse {
  tag: string
}

/** 開啟 URL 的請求；OpenerOpen / IabOpen 共用。 */
export interface OpenUrlRequest {
  url: string
}

/** 權限查詢 / 請求；PermCheck 與 PermRequest 共用。 */
export interface PermissionRequest {
  permission: PermissionType
}

/** 權限狀態回應。 */
export interface PermissionResponse {
  status: PermissionStatus
}

/** 檔案 / 資料夾選擇請求。 */
export interface PickerRequest {
  mode: FilePickerMode
  options?: FilePickerOptions
}

/** 檔案選擇結果；取消為空陣列。 */
export interface PickerResponse {
  paths: string[]
}

/** 建立 TCP 連線。 */
export interface TcpConnectRequest {
  host: string
  port: number
}

/** 指定既有 TCP 連線的請求；TcpDisconnect 使用。 */
export interface TcpClientRequest {
  /** 連線識別碼，由 TcpConnect 回傳。 */
  client: number
}

/** TCP 送出位元組。 */
export interface TcpSendRequest {
  client: number
  data: number[]
}

/** TCP 讀取位元組。 */
export interface TcpReadRequest {
  client: number
  /** 期望讀取的位元組數。 */
  expectLen: number
  /** 逾時毫秒；到期即回傳目前已讀到的內容。 */
  timeoutMs: number
}

/** TCP 連線診斷請求。 */
export interface TcpDiagnoseRequest {
  host: string
  port: number
}

/** TCP 連線診斷結果。 */
export interface TcpDiagnoseResponse {
  status: string
}

/** 鎖定螢幕方向。 */
export interface OrientationLockRequest {
  orientation: ScreenOrientation
}

/** 狀態列沉浸模式；darkContent 指圖示是否為深色（用於淺色底）。 */
export interface StatusBarImmersiveRequest {
  darkContent: boolean
}

/** 回報 App 主題亮度給原生層。 */
export interface ThemeSetRequest {
  dark: boolean
}

/** 原生攔截到的功能鍵事件酬載。 */
export interface HardwareKeyPayload {
  /** 已於原生層正規化為平台無關值。 */
  key: AppKey
  /** 原始的平台鍵碼，僅供除錯。 */
  nativeKeyCode?: number
}

/** DB handler 執行單句 SQL 的請求。 */
export interface DbExecRequest {
  /** 目標資料庫識別名（對應已開啟連線）。 */
  name: string
  /** 已由 Kysely 編譯的 SQL 字串。 */
  sql: string
  /** 綁定參數；BLOB 以 base64 字串傳遞。 */
  bind: unknown[]
}

/** DB handler 執行結果；查詢回 rows，異動回影響數與 insertId。 */
export interface DbExecResponse {
  /** 查詢結果列；非查詢語句為空陣列。 */
  rows?: Record<string, unknown>[]
  /** 受影響列數（異動語句）。 */
  changes?: number
  /** 最後插入的 rowid（INSERT 語句）。 */
  insertId?: number
}

/** 開啟資料庫請求；name 與 path 至少提供其一（path 優先，對應 NC 模式）。 */
export interface DbOpenRequest {
  /** 資料庫名稱，實際檔案為 app 目錄下的 `${name}.db`。 */
  name?: string
  /** 資料庫絕對路徑；提供時優先於 name。 */
  path?: string
}

/** 下載請求。 */
export interface DownloadRequest {
  /** 來源 URL。 */
  url: string
  /** 目標檔名（已淨化）。 */
  fileName: string
  /** 是否回傳 base64 data URL（否則回可顯示的檔案 URL）。 */
  toBase64?: boolean
  /** 進度事件關聯用的唯一 ID。 */
  requestId: string
}

/** 下載結果。 */
export interface DownloadResponse {
  /** 前端可用的顯示 URL（http/localhost 代理或 data URL）。 */
  uri: string
  /** 原生檔案系統路徑。 */
  nativeUri: string
}

/** 下載進度事件酬載。 */
export interface DownloadProgressPayload {
  /** 對應 DownloadRequest.requestId。 */
  requestId: string
  /** 進度百分比（0–100）。 */
  progress: number
}

/** 原生 HTTP 發送請求。 */
export interface HttpFetchRequest {
  /** 目標 URL。 */
  url: string
  /** HTTP 方法。 */
  method: string
  /** 請求標頭。 */
  headers: Record<string, string>
  /** 請求主體（base64；無主體為 null）。 */
  bodyBase64: string | null
  /** 取消用識別碼；供 HttpAbort 對應到原生的 CancelToken。 */
  requestId: string
}

/** 取消進行中的原生 HTTP 請求。 */
export interface HttpAbortRequest {
  /** 對應 HttpFetchRequest.requestId。 */
  requestId: string
}

/** 原生 HTTP 回應。 */
export interface HttpFetchResponse {
  /** HTTP 狀態碼。 */
  status: number
  /** 狀態訊息。 */
  statusText: string
  /** 回應標頭。 */
  headers: Record<string, string>
  /** 回應主體（base64）。 */
  bodyBase64: string
}

/** 網頁包版本資訊。 */
export interface BundleInfo {
  /** 目前服務中的網頁包版本（YYMMDDHHmmss，UTC）；無版本標記時為 null。 */
  currentVersion: string | null
  /** App 內建種子的版本；無版本標記時為 null。 */
  seedVersion: string | null
  /** 殼（原生二進位）的 versionName，如 `1.0.0`。 */
  hostVersion: string
  /** 殼的 build number 原始字串（Android versionCode / iOS CFBundleVersion），供顯示；比對在原生層。 */
  hostBuildNumber: string
}

/** 更新指令被原生層拒絕的原因。 */
export enum UpdateRejectReason {
  /** dev 模式：載的是 dev server，沒有網頁包可換。 */
  Dev = 'dev',
  /** 殼未配置 `AQUTTER_UPDATE_BASE_URL`。 */
  Disabled = 'disabled',
  /** 已有一條更新流程在跑。 */
  Busy = 'busy',
  /** 沒有已下載、待套用的網頁包。 */
  NoPending = 'no_pending',
  /** 尚未查詢過版本，不知道殼要更新到哪裡。 */
  NotChecked = 'not_checked',
  /** 伺服器未宣告殼更新，或管道不是 App 內 APK。 */
  NoHostUpdate = 'no_host_update',
  /** 尚未下載 APK。 */
  NoApk = 'no_apk',
  /** {@link BridgeHandler.UpdateConfigSet} 的參數驗證失敗；原因在回應的 `error`。 */
  InvalidConfig = 'invalid_config',
}

/** 更新指令的受理結果：受理即代表流程已在背景開跑，之後只以 {@link BridgeEvent.UpdateState} 回報。 */
export interface UpdateAcceptance {
  /** 原生層已受理。 */
  accepted: boolean
  /** 未受理的原因；受理時為 null。 */
  reason: UpdateRejectReason | null
}

/**
 * 套用網頁包更新的受理結果。
 *
 * 受理後若原生層直接進入套用，WebView 隨即被卸下、本頁面不再收到任何回應；
 * 若是退回一條龍（先查版本、下載），中途仍會收到 {@link BridgeEvent.UpdateState}。
 */
export type BundleApplyUpdateResult = UpdateAcceptance

/** 版更查詢的 HTTP method。 */
export type UpdateHttpMethod = 'GET' | 'POST'

/** 一組版更端點設定（不含 API KEY 值）。 */
export interface UpdateEndpointInfo {
  /** 更新來源的 base URL；空字串代表未配置（停用線上更新）。 */
  baseUrl: string
  /** 版本查詢端點路徑，相對於 `baseUrl`。 */
  versionPath: string
  /** 版本查詢的 HTTP method。 */
  method: UpdateHttpMethod
  /** 承載 API KEY 的 header 名。 */
  apiKeyHeader: string
}

/** `update_config_get` 的結果：目前生效的端點，與編譯期預設。 */
export interface UpdateConfigInfo extends UpdateEndpointInfo {
  /** 目前是否有網頁端覆寫；false 代表正在用編譯期預設。 */
  overridden: boolean
  /** 目前生效的設定是否帶 API KEY；刻意不回傳值本身。 */
  hasApiKey: boolean
  /** 線上更新是否啟用（`baseUrl` 非空）。 */
  enabled: boolean
  /** 編譯期預設；{@link BridgeHandler.UpdateConfigReset} 之後會回到它。 */
  defaults: UpdateEndpointInfo
}

/**
 * `update_config_set` 的參數。
 *
 * 缺席的欄位沿用編譯期預設，**API KEY 例外**：缺席即不帶 KEY，不會把原伺服器的 KEY 送給新網域。
 */
export interface UpdateConfigRequest {
  /** 新的更新來源；必為含 host 的 http / https 絕對 URL，不得為空（要回預設請用 reset）。 */
  baseUrl: string
  /** 版本查詢端點路徑。 */
  versionPath?: string
  /** 版本查詢的 HTTP method。 */
  method?: UpdateHttpMethod
  /** API KEY 的值；缺席即不帶任何鑑權 header。 */
  apiKey?: string
  /** 承載 API KEY 的 header 名。 */
  apiKeyHeader?: string
}

/** `update_config_set` / `update_config_reset` 的結果；未受理時原因在 `reason`，驗證失敗另附 `error` 說明。 */
export interface UpdateConfigResult extends UpdateAcceptance {
  /** 驗證失敗的說明（`reason` 為 `invalid_config` 時）；其餘為 null。 */
  error: string | null
}

/** `bundle_download_update` 的參數。 */
export interface BundleDownloadRequest {
  /** 下載完是否直接套用；預設 true。false 時停在 `ready`，由網頁端另呼叫 {@link BridgeHandler.BundleApplyUpdate}。 */
  apply?: boolean
}

/** `host_download_update` 的參數。 */
export interface HostDownloadRequest {
  /** 下載完是否直接喚起安裝器；預設 true。false 時停在 `ready`，由網頁端另呼叫 {@link BridgeHandler.HostInstallUpdate}。 */
  install?: boolean
}

/** 版本回應 `host` 區塊的摘要（已合併本機平台的覆寫）。 */
export interface BundleCheckHostInfo {
  /** 殼低於伺服器要求；為 true 時要下載／套用網頁包會被原生阻擋畫面攔下。 */
  blocked: boolean
  /** 所需最低殼 build number；null＝不限制。 */
  minBuildNumber: number | null
  /** 更新管道：`external`（開外部連結）或 `apk`（App 內下載）。 */
  updateType: string
  /** 更新管道的 URL；null＝伺服器只給訊息、無連結。 */
  updateUrl: string | null
  /** 安裝檔大小（bytes）；null＝未宣告。 */
  updateSize: number | null
  /** 本平台可走 {@link BridgeHandler.HostDownloadUpdate}（Android + `apk` + 有 URL）；否則網頁端應改開 `updateUrl`。 */
  canDownload: boolean
}

/** `bundle_check_update` 的結果。查詢失敗不拋出，放在 `error`。 */
export interface BundleCheckResult {
  /** 遠端網頁包比本機新。 */
  hasUpdate: boolean
  /** 本機目前版本；首開或無版本標記時為 null。 */
  currentVersion: string | null
  /** 遠端版本；查詢失敗時為 null。 */
  remoteVersion: string | null
  /** 遠端網頁包大小（bytes）；伺服器未宣告時為 null。 */
  size: number | null
  /** 殼版本要求；伺服器未宣告時為 null。 */
  host: BundleCheckHostInfo | null
  /** 查詢失敗的原因（含 dev / disabled）；成功時為 null。 */
  error: string | null
}

/** 更新的對象。 */
export enum UpdateTarget {
  /** 網頁包。 */
  Bundle = 'bundle',
  /** 殼（原生二進位）。 */
  Host = 'host',
}

/** 更新流程的階段。 */
export enum UpdateStage {
  /** 查詢版本中。 */
  Checking = 'checking',
  /** 已是最新。 */
  UpToDate = 'up_to_date',
  /** 有新版可下載（查詢後尚未開始下載）。 */
  Available = 'available',
  /** 殼過舊；原生阻擋畫面即將接管（純查詢時只是事實，不接管）。 */
  HostTooOld = 'host_too_old',
  /** 下載中；看 `received` / `total` / `percent`。 */
  Downloading = 'downloading',
  /** 驗證雜湊中。 */
  Verifying = 'verifying',
  /** 解包中；看 `done` / `extractTotal` / `percent`。 */
  Extracting = 'extracting',
  /** 已下載並就緒，等待套用／安裝。 */
  Ready = 'ready',
  /** 套用中（網頁包：WebView 即將被卸下；殼：安裝器即將喚起）。 */
  Applying = 'applying',
  /** 失敗；看 `error`。 */
  Failed = 'failed',
}

/** {@link BridgeEvent.UpdateState} 的 payload：更新流程的一次狀態快照。 */
export interface UpdateStatePayload {
  /** 更新對象。 */
  target: UpdateTarget
  /** 目前階段。 */
  stage: UpdateStage
  /** 已下載位元組；僅下載階段。 */
  received: number | null
  /** 總位元組；未知時為 null。 */
  total: number | null
  /** 0–100；下載與解包皆用，總量未知時為 null。 */
  percent: number | null
  /** 已解包項目數；僅解包階段。 */
  done: number | null
  /** 解包總項目數；僅解包階段。 */
  extractTotal: number | null
  /** 本機目前版本（網頁包時戳，或殼 build number）。 */
  currentVersion: string | null
  /** 遠端版本（網頁包時戳，或殼要求的 build number）。 */
  remoteVersion: string | null
  /** 失敗原因；僅失敗階段。 */
  error: string | null
}
