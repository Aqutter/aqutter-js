/** 網路傳輸型別 */
export type NetworkType = 'wifi' | 'cellular' | 'ethernet' | 'other' | 'none'

/** 網路狀態（broadcast network 事件） */
export interface NetworkStatus {
  online: boolean
  type: NetworkType
}

/** 自訂 Action 廣播（broadcast action 事件） */
export interface BroadcastAction {
  action: string
  extras: Record<string, string>
}
