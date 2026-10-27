/**
 * 多工連線上的訊框編解碼。與 Dart 端 `aqutter_core` 的 `rpc_frame.dart` 成對，兩端以
 * `test/rpc_frame_vectors.json`（同一份測試向量）保持一致，改一邊必改另一邊。
 *
 * ```
 * frame  = headerLength(u32, big-endian) | header(UTF-8 JSON) | blob_0 | blob_1 | …
 * header = { t, id?, name?, ch?, p?, e?, blobs }
 * ```
 *
 * 酬載 `p` 內的 `ArrayBuffer`／`ArrayBufferView` 送出時抽成 blob，並換成 `{"$bin": i}`；解碼時還原成 `Uint8Array`。
 */

export type FrameType = 'call' | 'res' | 'err' | 'evt'

export interface Frame {
  t: FrameType
  /** 呼叫編號（`call`／`res`／`err`）。 */
  id?: number
  /** handler 名稱（`call`）。 */
  name?: string
  /** 事件頻道（`evt`）。 */
  ch?: string
  /** 酬載／結果／事件內容；解碼後二進位佔位已還原。 */
  p?: unknown
  /** 錯誤（`err`）。 */
  e?: { code: string, message: string }
}

/** 單一訊框的大小上限（位元組）。 */
export const MAX_FRAME_BYTES = 64 * 1024 * 1024

/** 酬載中二進位佔位的保留鍵。 */
const BINARY_KEY = '$bin'

/** 訊框格式錯誤或超過上限。 */
export class FrameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrameError'
  }
}

const FRAME_TYPES: readonly string[] = ['call', 'res', 'err', 'evt']

const isPlainContainer = (value: object): boolean => {
  if (Array.isArray(value)) {
    return true
  }
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

const extractBlobs = (value: unknown, blobs: Uint8Array[]): unknown => {
  if (value instanceof ArrayBuffer) {
    blobs.push(new Uint8Array(value))
    return { [BINARY_KEY]: blobs.length - 1 }
  }
  if (ArrayBuffer.isView(value)) {
    blobs.push(new Uint8Array(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength))
    return { [BINARY_KEY]: blobs.length - 1 }
  }
  if (typeof value === 'object' && value !== null && isPlainContainer(value)) {
    if (Array.isArray(value)) {
      return value.map(item => extractBlobs(item, blobs))
    }
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === BINARY_KEY) {
        throw new TypeError(`"${BINARY_KEY}" is a reserved key`)
      }
      out[key] = extractBlobs(item, blobs)
    }
    return out
  }
  return value
}

/** 把 [frame] 編成可直接送出的位元組。超過 {@link MAX_FRAME_BYTES} 時拋出 {@link FrameError}。 */
export const encodeFrame = (frame: Frame): Uint8Array => {
  const blobs: Uint8Array[] = []
  const header: Record<string, unknown> = { t: frame.t }
  if (frame.id !== undefined) {
    header.id = frame.id
  }
  if (frame.name !== undefined) {
    header.name = frame.name
  }
  if (frame.ch !== undefined) {
    header.ch = frame.ch
  }
  if (frame.p !== undefined && frame.p !== null) {
    header.p = extractBlobs(frame.p, blobs)
  }
  if (frame.e !== undefined) {
    header.e = { code: frame.e.code, message: frame.e.message }
  }
  header.blobs = blobs.map(blob => blob.length)

  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  let total = 4 + headerBytes.length
  for (const blob of blobs) {
    total += blob.length
  }
  if (total > MAX_FRAME_BYTES) {
    throw new FrameError('Frame exceeds the size limit')
  }
  const out = new Uint8Array(total)
  new DataView(out.buffer).setUint32(0, headerBytes.length, false)
  out.set(headerBytes, 4)
  let offset = 4 + headerBytes.length
  for (const blob of blobs) {
    out.set(blob, offset)
    offset += blob.length
  }
  return out
}

const restoreBlobs = (value: unknown, blobs: Uint8Array[], used: Set<number>): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => restoreBlobs(item, blobs, used))
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    if (BINARY_KEY in record) {
      const index = record[BINARY_KEY]
      if (Object.keys(record).length !== 1 || typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= blobs.length || used.has(index)) {
        throw new FrameError('Invalid binary placeholder')
      }
      used.add(index)
      return blobs[index]
    }
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(record)) {
      out[key] = restoreBlobs(item, blobs, used)
    }
    return out
  }
  return value
}

/** 解碼一個訊框。格式錯誤一律拋出 {@link FrameError}。 */
export const decodeFrame = (data: ArrayBuffer | Uint8Array): Frame => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.length > MAX_FRAME_BYTES) {
    throw new FrameError('Frame exceeds the size limit')
  }
  if (bytes.length < 4) {
    throw new FrameError('Frame is shorter than its length prefix')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerLength = view.getUint32(0, false)
  if (headerLength > bytes.length - 4) {
    throw new FrameError('Header length exceeds the frame')
  }

  let header: unknown
  try {
    header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + headerLength)))
  }
  catch {
    throw new FrameError('Header is not valid JSON')
  }
  if (typeof header !== 'object' || header === null || Array.isArray(header)) {
    throw new FrameError('Header must be an object')
  }
  const fields = header as Record<string, unknown>

  const lengths = fields.blobs
  if (!Array.isArray(lengths)) {
    throw new FrameError('"blobs" must be an array')
  }
  const blobs: Uint8Array[] = []
  let offset = 4 + headerLength
  for (const length of lengths) {
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 0 || length > bytes.length - offset) {
      throw new FrameError('Blob lengths do not fit the frame')
    }
    blobs.push(bytes.subarray(offset, offset + length))
    offset += length
  }
  if (offset !== bytes.length) {
    throw new FrameError('Blob lengths do not add up to the frame length')
  }

  const type = fields.t
  if (typeof type !== 'string' || !FRAME_TYPES.includes(type)) {
    throw new FrameError(`Unknown frame type: ${String(type)}`)
  }
  const id = fields.id
  if (id !== undefined && (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0)) {
    throw new FrameError('"id" must be an integer in 0..2^53-1')
  }
  const name = fields.name
  const channel = fields.ch
  if ((name !== undefined && typeof name !== 'string') || (channel !== undefined && typeof channel !== 'string')) {
    throw new FrameError('"name" and "ch" must be strings')
  }
  const error = fields.e
  const needs = (condition: boolean, message: string): void => {
    if (!condition) {
      throw new FrameError(message)
    }
  }
  switch (type) {
    case 'call':
      needs(id !== undefined && name !== undefined, '"call" needs "id" and "name"')
      break
    case 'res':
      needs(id !== undefined, '"res" needs "id"')
      break
    case 'err':
      needs(id !== undefined && typeof error === 'object' && error !== null, '"err" needs "id" and "e"')
      break
    default:
      needs(channel !== undefined, '"evt" needs "ch"')
  }

  const used = new Set<number>()
  const payload = restoreBlobs(fields.p, blobs, used)
  if (used.size !== blobs.length) {
    throw new FrameError('Every blob must be referenced exactly once')
  }

  const frame: Frame = { t: type as FrameType }
  if (id !== undefined) {
    frame.id = id
  }
  if (name !== undefined) {
    frame.name = name
  }
  if (channel !== undefined) {
    frame.ch = channel
  }
  if (payload !== undefined) {
    frame.p = payload
  }
  if (typeof error === 'object' && error !== null) {
    const { code, message } = error as { code?: unknown, message?: unknown }
    frame.e = { code: String(code), message: String(message) }
  }
  return frame
}
