/**
 * 跨平台統一權限類型（對齊 Flutter permission_handler，與 Rust `PermissionType` camelCase 對應）。
 * 以 const 物件提供「值」用法（PermissionType.Camera）與型別。
 */
export const PermissionType = {
  Camera: 'camera',
  Microphone: 'microphone',
  Location: 'location',
  LocationAlways: 'locationAlways',
  LocationWhenInUse: 'locationWhenInUse',
  Notifications: 'notifications',
  CriticalAlerts: 'criticalAlerts',
  AccessNotificationPolicy: 'accessNotificationPolicy',
  Photos: 'photos',
  PhotosAddOnly: 'photosAddOnly',
  MediaLibrary: 'mediaLibrary',
  Videos: 'videos',
  Audio: 'audio',
  AccessMediaLocation: 'accessMediaLocation',
  Contacts: 'contacts',
  Calendar: 'calendar',
  CalendarWriteOnly: 'calendarWriteOnly',
  CalendarFullAccess: 'calendarFullAccess',
  Reminders: 'reminders',
  Sensors: 'sensors',
  SensorsAlways: 'sensorsAlways',
  ActivityRecognition: 'activityRecognition',
  Speech: 'speech',
  Bluetooth: 'bluetooth',
  BluetoothScan: 'bluetoothScan',
  BluetoothConnect: 'bluetoothConnect',
  BluetoothAdvertise: 'bluetoothAdvertise',
  NearbyWifiDevices: 'nearbyWifiDevices',
  Phone: 'phone',
  Sms: 'sms',
  Storage: 'storage',
  ManageExternalStorage: 'manageExternalStorage',
  SystemAlertWindow: 'systemAlertWindow',
  RequestInstallPackages: 'requestInstallPackages',
  ScheduleExactAlarm: 'scheduleExactAlarm',
  IgnoreBatteryOptimizations: 'ignoreBatteryOptimizations',
  AppTrackingTransparency: 'appTrackingTransparency',
  Assistant: 'assistant',
  Unknown: 'unknown',
} as const

export type PermissionType = typeof PermissionType[keyof typeof PermissionType]

/** 權限狀態（對齊 permission_handler PermissionStatus）。 */
export type PermissionStatus
  = | 'granted'
    | 'denied'
    | 'prompt'
    | 'restricted'
    | 'limited'
    | 'permanentlyDenied'

/** request 命令傳給原生的 payload */
export interface PermissionRequestPayload {
  permission: PermissionType
}
