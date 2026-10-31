/**
 * 殼內建的四個 plugin 的型別契約（契約 rev 1，正本 repo 是 `Aqutter/aqutter`，見其 `docs/native-features.md`）。
 *
 * 這四個功能和第三方 plugin 走同一套機制：handler `<id>.<method>`、事件頻道 `<id>.<event>`，
 * 網頁以 `callPlugin`／`onPluginEvent`／`isPluginSupported` 使用，型別由 `AqutterPluginRegistry` 決定。
 * 請求與回應的資料形狀定義在 `./bridge`，這裡只把名稱綁上去。
 *
 * | plugin | 方法 | 事件 | 平台 |
 * |---|---|---|---|
 * | `clipboard` | `read`、`write` | — | 全部 |
 * |  | `readImage`、`writeImage` | — | Android、iOS、macOS、Windows |
 * | `share` | `open` | — | 全部 |
 * | `notification` | `show`、`schedule`、`cancel`、`initial` | `tapped` | Android、iOS、macOS |
 * | `deeplink` | `initial` | `received` | Android、iOS、macOS |
 *
 * 殼名稱的另一半在 `shell/lib/src/plugins/<功能>/`；改名要兩邊一起改。
 */

import type { PluginDefinition } from '../index'
import type {
  ClipboardReadImageResponse,
  ClipboardReadResponse,
  ClipboardWriteImageRequest,
  ClipboardWriteRequest,
  DeepLinkPayload,
  DeeplinkInitialResponse,
  NotifyCancelRequest,
  NotifyIdResponse,
  NotifyInitialResponse,
  NotifyScheduleRequest,
  NotifyShowRequest,
  NotifyTappedPayload,
  OkResponse,
  ShareOpenRequest,
  ShareOpenResponse,
} from './bridge'

/** 剪貼簿：文字全平台；圖片只有 Android、iOS、macOS、Windows（其他平台 `isPluginSupported('clipboard', 'readImage')` 為 false）。 */
export type ClipboardPluginContract = PluginDefinition<
  {
    /** 讀取純文字；沒有文字時 `text` 為 null。 */
    read: { req: void, res: ClipboardReadResponse }
    /** 寫入純文字。 */
    write: { req: ClipboardWriteRequest, res: OkResponse }
    /** 讀取圖片（一律以 PNG 回傳）；超過 5,242,880 位元組以錯誤碼 `too_large` 失敗。 */
    readImage: { req: void, res: ClipboardReadImageResponse }
    /** 寫入圖片（PNG 或 JPEG）。 */
    writeImage: { req: ClipboardWriteImageRequest, res: OkResponse }
  },
  {}
>

/** 系統分享面板（文字、網址、檔案）。全平台。 */
export type SharePluginContract = PluginDefinition<
  {
    open: { req: ShareOpenRequest, res: ShareOpenResponse }
  },
  {}
>

/** 本機通知（Android、iOS、macOS）；不會自動請求通知權限，未授權時 `show`／`schedule` 回 `permission_denied`。 */
export type NotificationPluginContract = PluginDefinition<
  {
    show: { req: NotifyShowRequest, res: NotifyIdResponse }
    /** 以絕對時間點排程（非精確排程）。 */
    schedule: { req: NotifyScheduleRequest, res: NotifyIdResponse }
    /** 取消通知；省略 id 取消全部。 */
    cancel: { req: NotifyCancelRequest, res: OkResponse }
    /** 取得「點通知而冷啟 App」的資訊；否則兩者皆 null。 */
    initial: { req: void, res: NotifyInitialResponse }
  },
  {
    /** App 執行中使用者點了通知。 */
    tapped: NotifyTappedPayload
  }
>

/** 深層連結（Android、iOS、macOS）。 */
export type DeeplinkPluginContract = PluginDefinition<
  {
    /** 取得啟動 App 的連結；同一程序內重複呼叫回傳相同值，沒有時 `url` 為 null。 */
    initial: { req: void, res: DeeplinkInitialResponse }
  },
  {
    /** App 執行中收到新的連結；啟動 App 的那一個連結只由 `initial` 取得。網頁必須自行驗證連結再導航。 */
    received: DeepLinkPayload
  }
>

/** 殼內建 plugin 的契約表；併入 `AqutterPluginRegistry`。 */
export interface BuiltinPluginRegistry {
  clipboard: ClipboardPluginContract
  share: SharePluginContract
  notification: NotificationPluginContract
  deeplink: DeeplinkPluginContract
}
