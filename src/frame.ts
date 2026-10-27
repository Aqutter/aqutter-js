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

export type FrameType = 'call' | 'res' | 'err' | 'evt' | 'part'

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
  /** `part`：片序（0 起算）、總片數與這一片的位元組；`id` 是分段訊息編號。 */
  seq?: number
  total?: number
  data?: Uint8Array
}

/** 單一 WebSocket 訊息的大小上限（位元組）。 */
export const MAX_FRAME_BYTES = 64 * 1024 * 1024

/** 邏輯訊框的大小上限：超過 {@link MAX_FRAME_BYTES} 的由傳輸層自動分段。 */
export const MAX_MESSAGE_BYTES = 512 * 1024 * 1024

/** 分段時每一片的大小（最後一片較短）。 */
export const PART_BYTES = 16 * 1024 * 1024

/** 一個分段訊息最多幾片。 */
export const MAX_PARTS = MAX_MESSAGE_BYTES / PART_BYTES

/** 同一方向同時進行（尚未收齊）的分段訊息上限。 */
export const MAX_PARTIAL_MESSAGES = 4

/** 酬載中二進位佔位的保留鍵。 */
const BINARY_KEY = '$bin'

/** 訊框格式錯誤或超過上限。 */
export class FrameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrameError'
  }
}

const FRAME_TYPES: readonly string[] = ['call', 'res', 'err', 'evt', 'part']

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

const encodeRaw = (frame: Frame): Uint8Array => {
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
  if (frame.t === 'part') {
    header.seq = frame.seq
    header.total = frame.total
    blobs.push(frame.data!)
  }
  header.blobs = blobs.map(blob => blob.length)

  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  let total = 4 + headerBytes.length
  for (const blob of blobs) {
    total += blob.length
  }
  if (total > MAX_MESSAGE_BYTES) {
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

/** 把 [frame] 編成**單一** WebSocket 訊息。超過 {@link MAX_FRAME_BYTES} 時拋出 {@link FrameError}；可能超過的請用 {@link encodeMessages}。 */
export const encodeFrame = (frame: Frame): Uint8Array => {
  const bytes = encodeRaw(frame)
  if (bytes.length > MAX_FRAME_BYTES) {
    throw new FrameError('Frame exceeds the size limit')
  }
  return bytes
}

/**
 * 把 [frame] 編成要依序送出的 WebSocket 訊息：≤ {@link MAX_FRAME_BYTES} 時只有一個（與 {@link encodeFrame} 相同）；
 * 超過時切成每片 {@link PART_BYTES} 的 `part` 訊框，[partId] 是這個分段訊息在送出方向上的編號（不可重複）。
 * 超過 {@link MAX_MESSAGE_BYTES} 拋出 {@link FrameError}。
 */
export const encodeMessages = (frame: Frame, partId: number): Uint8Array[] => {
  const bytes = encodeRaw(frame)
  if (bytes.length <= MAX_FRAME_BYTES) {
    return [bytes]
  }
  const total = Math.ceil(bytes.length / PART_BYTES)
  const messages: Uint8Array[] = []
  for (let seq = 0; seq < total; seq++) {
    messages.push(encodeRaw({ t: 'part', id: partId, seq, total, data: bytes.subarray(seq * PART_BYTES, Math.min((seq + 1) * PART_BYTES, bytes.length)) }))
  }
  return messages
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
export const decodeFrame = (data: ArrayBuffer | Uint8Array, maxBytes: number = MAX_FRAME_BYTES): Frame => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.length > maxBytes) {
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
  if (type === 'part') {
    const seq = fields.seq
    const total = fields.total
    if (id === undefined || typeof seq !== 'number' || typeof total !== 'number' || !Number.isInteger(seq) || !Number.isInteger(total) || total < 2 || total > MAX_PARTS || seq < 0 || seq >= total) {
      throw new FrameError(`"part" needs "id", "seq" and "total" (2..${MAX_PARTS})`)
    }
    if (blobs.length !== 1 || blobs[0]!.length > PART_BYTES || 'p' in fields) {
      throw new FrameError('"part" carries exactly one blob of at most one part size')
    }
    return { t: 'part', id, seq, total, data: blobs[0]! }
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

/**
 * 重組分段訊息：把收到的每個 WebSocket 訊息交給 {@link Reassembler.add}，完整的邏輯訊框會在收齊最後一片時回傳。
 * 一個連線（一個方向）一個實例；分段違規一律拋出 {@link FrameError}，呼叫端應關閉連線。
 */
export class Reassembler {
  private readonly partials = new Map<number, { total: number, parts: Uint8Array[], bytes: number }>()

  /** 目前尚未收齊的分段訊息數。 */
  get pending(): number {
    return this.partials.size
  }

  add(message: ArrayBuffer | Uint8Array): Frame | null {
    const frame = decodeFrame(message)
    if (frame.t !== 'part') {
      return frame
    }
    const id = frame.id!
    const seq = frame.seq!
    const total = frame.total!
    let partial = this.partials.get(id)
    if (!partial) {
      if (seq !== 0) {
        throw new FrameError('A part sequence must start at 0')
      }
      if (this.partials.size >= MAX_PARTIAL_MESSAGES) {
        throw new FrameError('Too many partial messages in flight')
      }
      partial = { total, parts: [], bytes: 0 }
      this.partials.set(id, partial)
    }
    if (partial.total !== total || partial.parts.length !== seq) {
      throw new FrameError('Parts must arrive in order with a constant total')
    }
    const data = frame.data!
    if (seq < total - 1 && data.length !== PART_BYTES) {
      throw new FrameError('Every part but the last must be one full part')
    }
    partial.parts.push(data)
    partial.bytes += data.length
    if (partial.parts.length < total) {
      return null
    }
    this.partials.delete(id)
    if (partial.bytes > MAX_MESSAGE_BYTES) {
      throw new FrameError('Reassembled message exceeds the size limit')
    }
    const whole = new Uint8Array(partial.bytes)
    let offset = 0
    for (const part of partial.parts) {
      whole.set(part, offset)
      offset += part.length
    }
    const inner = decodeFrame(whole, MAX_MESSAGE_BYTES)
    if (inner.t === 'part') {
      throw new FrameError('A part cannot carry another part')
    }
    return inner
  }
}
