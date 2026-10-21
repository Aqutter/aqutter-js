/**
 * 鏡像幀的二進位格式（Dart → 網頁）。與 `aqutter_core` 的 `encodeAqutterNativeFrame` 成對。
 *
 * 一幀是**兩則**連續的二進位訊息：先標頭、再像素（原生端為了省一次複製而分開送）。WebSocket 保證順序，
 * 接收端嚴格依「標頭、像素、標頭、像素…」交替解讀。標頭為 little-endian：
 * `[w u32 | h u32 | fmt u32 | seq u32 | sentAt f64 (epoch ms)]`。
 */

/** 標頭長度（bytes）。 */
export const AQUTTER_NATIVE_HEADER_LENGTH = 24

/**
 * 幀的像素格式。線上格式代碼 0（PNG）、3（WebP）、4／5（H.264）曾經實驗過、已移除：PNG 與 WebP 的編碼太慢，
 * H.264 的幀率沒有提升（瓶頸在擷取）。細節與實測數字見 aqutter_core 的 doc/nativeview.md。
 */
export enum AqutterNativeFormat {
  /** 未壓縮 straight（非預乘）RGBA，每像素 4 bytes。預設。 */
  Rgba = 1,
  /** JPEG 壓縮（有損），只用於原生擷取（`nativeJpegQuality`）。 */
  Jpeg = 2,
}

/** 解碼後的標頭。 */
export interface AqutterNativeFrameHeader {
  width: number
  height: number
  format: AqutterNativeFormat
  /** 每個工作階段遞增的序號；用來丟棄亂序的舊幀、回覆確認。 */
  seq: number
  /** 原生端送出時的 epoch 毫秒；用於估算延遲。 */
  sentAt: number
}

/** 一幀的標頭與 payload 視圖（不複製資料）。 */
export interface AqutterNativeFrame extends AqutterNativeFrameHeader {
  payload: Uint8Array
}

/** 讀出標頭中的序號（不驗證其餘欄位）；緩衝區太短回 0。 */
export const peekAqutterNativeSeq = (header: ArrayBuffer): number => {
  return header.byteLength >= AQUTTER_NATIVE_HEADER_LENGTH ? new DataView(header).getUint32(12, true) : 0
}

/**
 * 以標頭與像素兩則訊息組出一幀；標頭太短、格式不明或 RGBA 長度與寬高不符時拋錯。
 * `payload` 是像素緩衝區的視圖，不複製資料。
 */
export const decodeAqutterNativeFrame = (header: ArrayBuffer, payloadBuffer: ArrayBuffer): AqutterNativeFrame => {
  if (header.byteLength < AQUTTER_NATIVE_HEADER_LENGTH) {
    throw new Error(`[aqutterNative] frame header too short: ${header.byteLength} bytes`)
  }
  const view = new DataView(header)
  const width = view.getUint32(0, true)
  const height = view.getUint32(4, true)
  const format = view.getUint32(8, true)
  const seq = view.getUint32(12, true)
  const sentAt = view.getFloat64(16, true)
  if (format !== AqutterNativeFormat.Rgba && format !== AqutterNativeFormat.Jpeg) {
    throw new Error(`[aqutterNative] unknown frame format: ${format}`)
  }
  const payload = new Uint8Array(payloadBuffer)
  if (format === AqutterNativeFormat.Rgba && payload.length !== width * height * 4) {
    throw new Error(`[aqutterNative] RGBA payload ${payload.length} bytes does not match ${width}x${height}`)
  }
  return { width, height, format, seq, sentAt, payload }
}
