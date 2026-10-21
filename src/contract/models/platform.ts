/** 應用運行平台。native 由 Flutter host 回報，純瀏覽器為 web。 */
export type AppPlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web'

/** 啟動時由原生回報的平台資訊（PlatformInfo handler）。 */
export interface PlatformInfo {
  /** 作業系統平台。 */
  platform: AppPlatform
  /** 作業系統版本字串。 */
  osVersion: string
  /** CPU 架構（如 arm64 / x86_64）。 */
  arch: string
  /**
   * 本平台實際可用的 bridge handler 名稱（對應 {@link BridgeHandler} 的值）。
   *
   * 由 host 在註冊 handler 時自報，**不等同於「有沒有註冊」**——部分 handler 在
   * 所有平台都註冊但實作為 no-op（如 iOS 的 `minimize_app`）。網頁層據此判斷
   * 「這個平台做不做得到」，取代硬寫 `platform === 'android'`。
   *
   * 舊版 host 不回傳此欄位，故為 optional；缺少時視為「全部支援」（見 isBridgeSupported）。
   */
  capabilities?: string[]
}
