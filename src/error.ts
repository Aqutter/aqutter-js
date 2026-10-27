/**
 * 殼或傳輸層回報的錯誤。`code` 是契約的錯誤碼：殼回傳的 `HANDLER_NOT_FOUND`、`HANDLER_FAILED`、
 * `UNSUPPORTED_PLATFORM`（plugin 不支援本平台）、`PAYLOAD_TOO_LARGE`，以及網頁端自己產生的
 * `TRANSPORT_UNAVAILABLE`（連不上）、`TRANSPORT_CLOSED`（已送出的呼叫在回應前連線關閉），
 * plugin 自訂的錯誤碼（`aqutterErrorPayload`／`AqutterRpcException`）也用同一個類別。
 */
export class AqutterPluginError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'AqutterPluginError'
    this.code = code
  }
}
