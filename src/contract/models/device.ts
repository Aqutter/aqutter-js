/** 裝置作業系統資訊（tauri-plugin-os） */
export interface DeviceInfo {
  platform: string
  osVersion: string
  arch: string
  family: string
}

/** 裝置唯一識別碼來源 */
export type DeviceIdSource = 'vendor' | 'androidId' | 'machineUid' | 'webUuid'

/** 裝置唯一識別碼（tauri-plugin-device / web 持久化 UUID） */
export interface DeviceId {
  id: string
  source: DeviceIdSource
}

/** 電量資訊；level 為 0..1，未知時為 null */
export interface BatteryInfo {
  level: number | null
  isCharging: boolean | null
}
