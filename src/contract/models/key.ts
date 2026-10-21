/**
 * 平台無關的按鍵模型。
 *
 * 頁面只認得 {@link AppKey}，不需要知道自己跑在哪個平台、也不需要記 Android keyCode
 * 或 DOM `event.code` 這兩套互不相容的字彙——來源層負責各自映射進來。
 */

/**
 * 應用層按鍵。刻意不使用平台原生碼作為值：
 * Android 的 `KEYCODE_F1 = 131` 與 DOM 的 `event.code = 'F1'` 無法共用同一組值，
 * 若直接沿用其中一套，另一個平台的來源層就得反向查表，且頁面會被綁死在該平台。
 */
export enum AppKey {
  F1 = 'F1',
  F2 = 'F2',
  F3 = 'F3',
  F4 = 'F4',
  /**
   * 返回。Android 為實體返回鍵（含手勢返回，由 PopScope 派送）；
   * 其他平台無對應實體鍵，DOM 來源以 `Escape` 代之，便於桌機／瀏覽器測試返回流程。
   */
  Back = 'Back',
  Enter = 'Enter',
}

/** 按鍵事件的來源，僅供除錯與診斷用；頁面邏輯不應依賴此欄位。 */
export type AppKeySource = 'native' | 'dom'

/** 派送給 {@link AppKey} 監聽器的事件。 */
export interface AppKeyEvent {
  /** 正規化後的應用層按鍵；來源不明的按鍵為 null（僅 DOM 來源可能發生）。 */
  key: AppKey | null
  /** 事件來源，供除錯辨識走的是原生橋接還是 WebView 內的 keydown。 */
  source: AppKeySource
  /**
   * 原始 DOM 事件；來源為 native 時為 null。
   * 需要 `event.repeat`、修飾鍵或原始 `code` 時使用。
   */
  domEvent: KeyboardEvent | null

  /**
   * 原生平台的按鍵碼（Android `KeyEvent.keyCode`）；來源為 dom 時為 null。
   *
   * 一般情況用 {@link key} 即可——它已是平台無關值。此欄位供需要分辨
   * 「這顆究竟是實體 F1，還是被機型重映射過來的其他鍵」的場合，
   * 例如某些工業機的功能鍵送的是音量 scancode。
   */
  nativeKeyCode: number | null
}

/**
 * 監聽器回傳值：`true` 代表「已消耗」，事件不再往更早註冊的監聽器傳遞；
 * 回傳 `false` 或什麼都不回傳則繼續傳遞。
 *
 * 刻意允許不回傳（`void`）：多數監聽器只處理自己在意的鍵，強迫每條路徑都 return
 * 會讓呼叫端充滿無意義的 `return false`。此為事件處理器的慣用型別，非誤用。
 */
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- 見上方說明
export type AppHandlerResult = boolean | void

/** 按鍵監聽器。 */
export type AppKeyHandler = (event: AppKeyEvent) => AppHandlerResult

/** 掃碼監聽器；語意同 {@link AppKeyHandler}，參數為完整條碼字串。 */
export type AppScanHandler = (barcode: string) => AppHandlerResult

/** DOM `KeyboardEvent.code` → {@link AppKey}。找不到者視為一般字元，不派送按鍵事件。 */
export const DOM_CODE_TO_APP_KEY: Readonly<Record<string, AppKey>> = {
  F1: AppKey.F1,
  F2: AppKey.F2,
  F3: AppKey.F3,
  F4: AppKey.F4,
  Enter: AppKey.Enter,
  NumpadEnter: AppKey.Enter,
  // 桌機／瀏覽器無實體返回鍵，以 Escape 代之（僅為開發便利，實機走原生 PopScope）
  Escape: AppKey.Back,
}
