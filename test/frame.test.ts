import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { decodeFrame, encodeFrame, encodeMessages, FrameError, MAX_FRAME_BYTES, MAX_MESSAGE_BYTES, MAX_PARTIAL_MESSAGES, PART_BYTES, Reassembler } from '../src/frame'

// 與 aqutter_core 的 test/rpc_frame_vectors.json 逐字相同：兩端的編解碼以同一份向量保持一致
const vectors = JSON.parse(readFileSync(new URL('./rpc_frame_vectors.json', import.meta.url), 'utf-8')) as {
  valid: Array<{ name: string, hex: string, t: string, id: number | null, nameField: string | null, ch: string | null }>
  invalid: Array<{ name: string, hex: string }>
}

const fromHex = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g) ?? [], byte => Number.parseInt(byte, 16))
const toHex = (bytes: Uint8Array): string => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

describe('shared vectors (also used by aqutter_core)', () => {
  for (const vector of vectors.valid) {
    it(`decodes: ${vector.name}`, () => {
      const frame = decodeFrame(fromHex(vector.hex))
      expect(frame.t).toBe(vector.t)
      expect(frame.id ?? null).toBe(vector.id)
      expect(frame.name ?? null).toBe(vector.nameField)
      expect(frame.ch ?? null).toBe(vector.ch)
    })
    it(`re-encodes to the same bytes: ${vector.name}`, () => {
      expect(toHex(encodeFrame(decodeFrame(fromHex(vector.hex))))).toBe(vector.hex)
    })
  }
  for (const vector of vectors.invalid) {
    it(`rejects: ${vector.name}`, () => {
      expect(() => decodeFrame(fromHex(vector.hex))).toThrow(FrameError)
    })
  }
})

describe('binary payloads', () => {
  it('round-trips ArrayBuffer and views at any depth, restoring Uint8Array', () => {
    const frame = decodeFrame(encodeFrame({
      t: 'res',
      id: 1,
      p: {
        top: new Uint8Array([1, 2, 3]),
        list: [new ArrayBuffer(2), 'x', { deep: new Uint16Array([1, 258]) }],
        n: 1.5,
        nothing: null,
      },
    }))
    const payload = frame.p as { top: Uint8Array, list: unknown[], n: number, nothing: null }
    expect(payload.top).toBeInstanceOf(Uint8Array)
    expect([...payload.top]).toEqual([1, 2, 3])
    expect((payload.list[0] as Uint8Array).length).toBe(2)
    expect((payload.list[2] as { deep: Uint8Array }).deep.length).toBe(4)
    expect(payload.n).toBe(1.5)
    expect(payload.nothing).toBeNull()
  })

  it('a view only sends its own range', () => {
    const big = new Uint8Array([9, 1, 2, 3, 9])
    const frame = decodeFrame(encodeFrame({ t: 'res', id: 1, p: big.subarray(1, 4) }))
    expect([...(frame.p as Uint8Array)]).toEqual([1, 2, 3])
  })

  it('the reserved key cannot appear in user data', () => {
    expect(() => encodeFrame({ t: 'res', id: 1, p: { $bin: 0 } })).toThrow(TypeError)
  })

  it('undefined values are dropped like JSON', () => {
    const frame = decodeFrame(encodeFrame({ t: 'res', id: 1, p: { a: undefined, b: 1 } }))
    expect(frame.p).toEqual({ b: 1 })
  })
})

describe('limits', () => {
  it('refuses a frame over the size limit when encoding', () => {
    expect(() => encodeFrame({ t: 'res', id: 1, p: new Uint8Array(MAX_FRAME_BYTES) })).toThrow(FrameError)
  })

  it('accepts ids up to 2^53 - 1 and rejects beyond', () => {
    expect(decodeFrame(encodeFrame({ t: 'res', id: Number.MAX_SAFE_INTEGER })).id).toBe(Number.MAX_SAFE_INTEGER)
    const header = new TextEncoder().encode('{"t":"res","id":9007199254740992,"blobs":[]}')
    const bytes = new Uint8Array(4 + header.length)
    new DataView(bytes.buffer).setUint32(0, header.length)
    bytes.set(header, 4)
    expect(() => decodeFrame(bytes)).toThrow(FrameError)
  })
})

describe('auto-split (messages over 64 MiB)', () => {
  const big = (bytes: number): Uint8Array => new Uint8Array(bytes).fill(7)

  it('a frame within the limit is a single message identical to encodeFrame', () => {
    const messages = encodeMessages({ t: 'res', id: 1, p: { a: 1 } }, 0)
    expect(messages).toHaveLength(1)
    expect(toHex(messages[0]!)).toBe(toHex(encodeFrame({ t: 'res', id: 1, p: { a: 1 } })))
  })

  it('a 70 MiB payload is split into 16 MiB parts and reassembled intact', () => {
    const data = big(70 * 1024 * 1024)
    data[5] = 1
    data[data.length - 1] = 9
    const messages = encodeMessages({ t: 'res', id: 3, p: { data } }, 11)
    expect(messages).toHaveLength(5)
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(MAX_FRAME_BYTES)
      expect(decodeFrame(message).t).toBe('part')
    }
    const reassembler = new Reassembler()
    let result = null
    for (const message of messages) {
      expect(result).toBeNull()
      result = reassembler.add(message)
    }
    expect(reassembler.pending).toBe(0)
    expect(result!.id).toBe(3)
    const out = (result!.p as { data: Uint8Array }).data
    expect(out.length).toBe(data.length)
    expect(out[5]).toBe(1)
    expect(out.at(-1)).toBe(9)
  })

  it('a frame over 512 MiB is refused', () => {
    expect(() => encodeMessages({ t: 'res', id: 1, p: new Uint8Array(MAX_MESSAGE_BYTES) }, 0)).toThrow(FrameError)
  })

  it('ordinary frames pass through the reassembler untouched', () => {
    expect(new Reassembler().add(encodeFrame({ t: 'call', id: 4, name: 'a.b' }))!.name).toBe('a.b')
  })

  const parts = (id: number, total: number, last = 3): Uint8Array[] =>
    Array.from({ length: total }, (_, seq) => encodeFrame({ t: 'part', id, seq, total, data: seq < total - 1 ? big(PART_BYTES) : new Uint8Array(last) }))

  it('rejects a sequence that does not start at 0 or arrives out of order', () => {
    const three = parts(1, 3)
    expect(() => new Reassembler().add(three[1]!)).toThrow(FrameError)
    const reassembler = new Reassembler()
    reassembler.add(three[0]!)
    expect(() => reassembler.add(three[2]!)).toThrow(FrameError)
  })

  it('rejects a short part that is not the last one', () => {
    expect(() => new Reassembler().add(encodeFrame({ t: 'part', id: 1, seq: 0, total: 2, data: new Uint8Array(10) }))).toThrow(FrameError)
  })

  it('rejects more than four partial messages in flight', () => {
    const reassembler = new Reassembler()
    for (let id = 0; id < MAX_PARTIAL_MESSAGES; id++) {
      reassembler.add(parts(id, 2)[0]!)
    }
    expect(reassembler.pending).toBe(MAX_PARTIAL_MESSAGES)
    expect(() => reassembler.add(parts(99, 2)[0]!)).toThrow(FrameError)
  })

  it('rejects a reassembled message that is itself a part', () => {
    const inner = encodeFrame({ t: 'part', id: 1, seq: 0, total: 2, data: new Uint8Array(PART_BYTES) })
    expect(inner.length).toBeGreaterThan(PART_BYTES)
    const piece = (seq: number, data: Uint8Array): Uint8Array => encodeFrame({ t: 'part', id: 8, seq, total: 2, data })
    const reassembler = new Reassembler()
    expect(reassembler.add(piece(0, inner.subarray(0, PART_BYTES)))).toBeNull()
    expect(() => reassembler.add(piece(1, inner.subarray(PART_BYTES)))).toThrow(FrameError)
  })
})
