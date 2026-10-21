import { describe, expect, it } from 'vitest'

import { AQUTTER_NATIVE_HEADER_LENGTH, AqutterNativeFormat, decodeAqutterNativeFrame, DEFAULT_GESTURE_OPTIONS, DOUBLE_TAP_GRACE_MS, GestureRecognizer, IOS_GESTURE_OPTIONS, isIosTouch, peekAqutterNativeSeq, toPointerMessage } from '../src/nativeview'
import type { AqutterNativeGesture, GestureOptions, Scheduler } from '../src/nativeview'

const makeFrame = (width: number, height: number, format: number, payload: number[], sentAt = 1700000000000, seq = 1): { header: ArrayBuffer, payload: ArrayBuffer } => {
  const header = new ArrayBuffer(AQUTTER_NATIVE_HEADER_LENGTH)
  const view = new DataView(header)
  view.setUint32(0, width, true)
  view.setUint32(4, height, true)
  view.setUint32(8, format, true)
  view.setUint32(12, seq, true)
  view.setFloat64(16, sentAt, true)
  const body = new ArrayBuffer(payload.length)
  new Uint8Array(body).set(payload)
  return { header, payload: body }
}

describe('decodeAqutterNativeFrame', () => {
  it('decodes the header and exposes the payload without copying', () => {
    const { header, payload } = makeFrame(1, 1, AqutterNativeFormat.Rgba, [9, 8, 7, 255])
    const frame = decodeAqutterNativeFrame(header, payload)
    expect(frame).toMatchObject({ width: 1, height: 1, format: AqutterNativeFormat.Rgba, seq: 1, sentAt: 1700000000000 })
    expect([...frame.payload]).toEqual([9, 8, 7, 255])
    expect(frame.payload.buffer).toBe(payload)
  })

  it('accepts jpeg payloads of any length', () => {
    const { header, payload } = makeFrame(10, 10, AqutterNativeFormat.Jpeg, [1, 2, 3])
    expect(decodeAqutterNativeFrame(header, payload).format).toBe(AqutterNativeFormat.Jpeg)
  })

  it('rejects the retired format codes (png 0, webp 3, h264 4 and 5)', () => {
    for (const format of [0, 3, 4, 5]) {
      const { header, payload } = makeFrame(10, 10, format as AqutterNativeFormat, [1, 2, 3])
      expect(() => decodeAqutterNativeFrame(header, payload)).toThrow(/unknown frame format/)
    }
  })

  it('rejects short headers, unknown formats and mismatched RGBA length', () => {
    expect(() => decodeAqutterNativeFrame(new ArrayBuffer(4), new ArrayBuffer(0))).toThrow(/too short/)
    const unknown = makeFrame(1, 1, 7, [0])
    expect(() => decodeAqutterNativeFrame(unknown.header, unknown.payload)).toThrow(/unknown frame format/)
    const mismatch = makeFrame(2, 2, AqutterNativeFormat.Rgba, [0, 0, 0, 0])
    expect(() => decodeAqutterNativeFrame(mismatch.header, mismatch.payload)).toThrow(/does not match/)
  })

  it('peeks the sequence number', () => {
    expect(peekAqutterNativeSeq(makeFrame(1, 1, AqutterNativeFormat.Rgba, [0, 0, 0, 0], 0, 42).header)).toBe(42)
    expect(peekAqutterNativeSeq(new ArrayBuffer(3))).toBe(0)
  })
})

const fakeScheduler = (): Scheduler & { advance: (ms: number) => void } => {
  let time = 0
  let nextId = 1
  const timers = new Map<number, { at: number, callback: () => void }>()
  return {
    now: () => time,
    setTimeout: (callback, ms) => {
      const id = nextId++
      timers.set(id, { at: time + ms, callback })
      return id
    },
    clearTimeout: handle => void timers.delete(handle as number),
    advance: (ms) => {
      time += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= time) {
          timers.delete(id)
          timer.callback()
        }
      }
    },
  }
}

const setup = (options: Partial<GestureOptions> = {}) => {
  const scheduler = fakeScheduler()
  const events: AqutterNativeGesture[] = []
  const recognizer = new GestureRecognizer(g => events.push(g), () => ({ width: 200, height: 100 }), { ...DEFAULT_GESTURE_OPTIONS, ...options }, scheduler)
  return { scheduler, events, recognizer }
}

describe('GestureRecognizer', () => {
  const press = (r: GestureRecognizer, scheduler: ReturnType<typeof fakeScheduler>, at: { x: number, y: number } = { x: 20, y: 20 }, holdMs = 50): void => {
    r.pointerDown(1, at)
    scheduler.advance(holdMs)
    r.pointerUp(1, at)
  }
  const types = (events: AqutterNativeGesture[]): string[] => events.map(e => e.type)

  describe('tap and doubleTap are exclusive by default', () => {
    it('sends a normalized tap, after the double-tap window has passed', () => {
      const { events, scheduler, recognizer } = setup()
      recognizer.pointerDown(1, { x: 100, y: 50 })
      recognizer.pointerUp(1, { x: 100, y: 50 })
      expect(events).toEqual([]) // 還在等雙擊視窗
      scheduler.advance(DEFAULT_GESTURE_OPTIONS.doubleTapMs + DOUBLE_TAP_GRACE_MS)
      expect(events).toEqual([{ type: 'tap', x: 0.5, y: 0.5 }])
    })

    it('with no grace period the pending tap is sent as soon as the window ends', () => {
      const { events, scheduler, recognizer } = setup()
      recognizer.pointerDown(1, { x: 100, y: 50 }, 0)
      recognizer.pointerUp(1, { x: 100, y: 50 }, 50)
      scheduler.advance(DEFAULT_GESTURE_OPTIONS.doubleTapMs + DOUBLE_TAP_GRACE_MS)
      expect(types(events)).toEqual(['tap'])
    })

    it('a double tap sends only doubleTap, never tap', () => {
      const { events, scheduler, recognizer } = setup()
      press(recognizer, scheduler)
      scheduler.advance(80)
      press(recognizer, scheduler, { x: 22, y: 21 })
      scheduler.advance(500)
      expect(types(events)).toEqual(['doubleTap'])
    })

    it('measures the gap from the first release to the second press, not release to release', () => {
      const { events, scheduler, recognizer } = setup()
      press(recognizer, scheduler)
      scheduler.advance(100) // 放開到再按下 100ms，在門檻內
      recognizer.pointerDown(1, { x: 20, y: 20 })
      scheduler.advance(150) // 手指按住 150ms：放開到放開共 250ms，舊算法會漏判
      recognizer.pointerUp(1, { x: 20, y: 20 })
      scheduler.advance(500)
      expect(types(events)).toEqual(['doubleTap'])
    })

    it('uses the event timestamps, so a delayed handler does not change the decision', () => {
      const { events, scheduler, recognizer } = setup()
      // 兩下實際相隔 100ms（事件時間戳），但主執行緒忙，第二下的 handler 晚了很久才執行
      recognizer.pointerDown(1, { x: 20, y: 20 }, 1000)
      recognizer.pointerUp(1, { x: 20, y: 20 }, 1050)
      // 處理第二下前，視窗計時器可能已先到期：這種情況寧可當兩次單擊，不能漏掉
      recognizer.pointerDown(1, { x: 20, y: 20 }, 1150)
      recognizer.pointerUp(1, { x: 20, y: 20 }, 1200)
      scheduler.advance(500)
      expect(types(events)).toEqual(['doubleTap'])
    })

    it('counting taps about 220 ms apart are four separate taps', () => {
      const { events, scheduler, recognizer } = setup()
      for (let i = 0; i < 4; i++) {
        press(recognizer, scheduler, undefined, 60)
        scheduler.advance(220)
      }
      expect(types(events)).toEqual(['tap', 'tap', 'tap', 'tap'])
    })

    it('a second tap that is too late, too early (a bounce) or too far away is a separate tap', () => {
      const late = setup()
      press(late.recognizer, late.scheduler)
      late.scheduler.advance(150)
      press(late.recognizer, late.scheduler)
      late.scheduler.advance(500)
      expect(types(late.events)).toEqual(['tap', 'tap'])

      const bounce = setup()
      press(bounce.recognizer, bounce.scheduler)
      bounce.scheduler.advance(20)
      press(bounce.recognizer, bounce.scheduler)
      bounce.scheduler.advance(500)
      expect(types(bounce.events)).toEqual(['tap', 'tap'])

      const far = setup()
      press(far.recognizer, far.scheduler, { x: 20, y: 20 })
      far.scheduler.advance(80)
      press(far.recognizer, far.scheduler, { x: 150, y: 80 })
      far.scheduler.advance(500)
      expect(types(far.events)).toEqual(['tap', 'tap'])
    })

    it('a quick double tap measured on a real iPad (about 230 ms between release and press, 20 px apart) is a double tap with the iOS defaults, but not with the others', () => {
      const other = setup()
      press(other.recognizer, other.scheduler, { x: 100, y: 50 }, 70)
      other.scheduler.advance(230)
      press(other.recognizer, other.scheduler, { x: 120, y: 50 }, 70)
      other.scheduler.advance(500)
      expect(types(other.events)).toEqual(['tap', 'tap'])

      const { events, scheduler, recognizer } = setup(IOS_GESTURE_OPTIONS)
      press(recognizer, scheduler, { x: 100, y: 50 }, 70)
      scheduler.advance(230)
      press(recognizer, scheduler, { x: 120, y: 50 }, 70)
      scheduler.advance(500)
      expect(types(events)).toEqual(['doubleTap'])
    })

    it('a triple tap is a doubleTap followed by a tap', () => {
      const { events, scheduler, recognizer } = setup()
      press(recognizer, scheduler)
      scheduler.advance(80)
      press(recognizer, scheduler)
      scheduler.advance(80)
      press(recognizer, scheduler)
      scheduler.advance(500)
      expect(types(events)).toEqual(['doubleTap', 'tap'])
    })

    it('if the second press turns into a drag, the waiting tap is sent first and the drag proceeds', () => {
      const { events, scheduler, recognizer } = setup()
      press(recognizer, scheduler)
      scheduler.advance(80)
      recognizer.pointerDown(1, { x: 20, y: 20 })
      recognizer.pointerMove(1, { x: 60, y: 20 })
      recognizer.pointerUp(1, { x: 60, y: 20 })
      expect(types(events)).toEqual(['tap', 'pan', 'pan'])
    })

    it('if the second press becomes a long press, the waiting tap is sent first', () => {
      const { events, scheduler, recognizer } = setup()
      press(recognizer, scheduler)
      scheduler.advance(80)
      recognizer.pointerDown(1, { x: 20, y: 20 })
      scheduler.advance(DEFAULT_GESTURE_OPTIONS.longPressMs)
      recognizer.pointerUp(1, { x: 20, y: 20 })
      expect(types(events)).toEqual(['tap', 'longPress'])
    })
  })

  describe('double-tap modes', () => {
    it('both: every tap is immediate and the second also sends doubleTap', () => {
      const { events, scheduler, recognizer } = setup({ doubleTap: 'both' })
      press(recognizer, scheduler)
      expect(types(events)).toEqual(['tap']) // 不延遲
      scheduler.advance(80)
      press(recognizer, scheduler)
      expect(types(events)).toEqual(['tap', 'tap', 'doubleTap'])
    })

    it('off: taps are immediate and doubleTap is never sent', () => {
      const { events, scheduler, recognizer } = setup({ doubleTap: 'off' })
      press(recognizer, scheduler)
      scheduler.advance(80)
      press(recognizer, scheduler)
      expect(types(events)).toEqual(['tap', 'tap'])
    })
  })

  it('emits pan start / update / end with normalized deltas', () => {
    const { events, recognizer } = setup()
    recognizer.pointerDown(1, { x: 0, y: 0 })
    recognizer.pointerMove(1, { x: 4, y: 0 }) // within slop
    expect(events).toEqual([])
    recognizer.pointerMove(1, { x: 20, y: 0 })
    recognizer.pointerMove(1, { x: 60, y: 50 })
    recognizer.pointerUp(1, { x: 60, y: 50 })
    expect(events.map(e => e.type === 'pan' ? e.phase : e.type)).toEqual(['start', 'update', 'end'])
    expect(events[1]).toMatchObject({ dx: 40 / 200, dy: 50 / 100 })
  })

  it('emits longPress once and suppresses the tap', () => {
    const { events, scheduler, recognizer } = setup()
    recognizer.pointerDown(1, { x: 100, y: 50 })
    scheduler.advance(600)
    recognizer.pointerUp(1, { x: 100, y: 50 })
    expect(events.map(e => e.type)).toEqual(['longPress'])
  })

  it('moving cancels the long press', () => {
    const { events, scheduler, recognizer } = setup()
    recognizer.pointerDown(1, { x: 0, y: 0 })
    recognizer.pointerMove(1, { x: 50, y: 0 })
    scheduler.advance(600)
    expect(events.map(e => e.type)).not.toContain('longPress')
  })

  it('emits pinch with cumulative scale and ends without a trailing tap', () => {
    const { events, recognizer } = setup()
    recognizer.pointerDown(1, { x: 80, y: 50 })
    recognizer.pointerDown(2, { x: 120, y: 50 }) // distance 40
    recognizer.pointerMove(2, { x: 160, y: 50 }) // distance 80
    recognizer.pointerUp(2, { x: 160, y: 50 })
    recognizer.pointerUp(1, { x: 80, y: 50 })
    expect(events.map(e => e.type === 'pinch' ? `pinch:${e.phase}` : e.type)).toEqual(['pinch:start', 'pinch:update', 'pinch:end'])
    expect(events[1]).toMatchObject({ scale: 2, x: 0.6 })
  })

  it('cancel closes an in-progress pan', () => {
    const { events, recognizer } = setup()
    recognizer.pointerDown(1, { x: 0, y: 0 })
    recognizer.pointerMove(1, { x: 50, y: 0 })
    recognizer.cancel()
    expect(events.at(-1)).toMatchObject({ type: 'pan', phase: 'end' })
  })
})

describe('toPointerMessage', () => {
  it('normalizes the position against the element and keeps the hardware timestamp', () => {
    const message = toPointerMessage(
      'move',
      { pointerId: 3, clientX: 150, clientY: 70, timeStamp: 1234.5, pointerType: 'touch' },
      { left: 50, top: 20 },
      { width: 200, height: 100 },
    )
    expect(message).toEqual({ type: 'pointer', phase: 'move', id: 3, x: 0.5, y: 0.5, t: 1234.5, pointerType: 'touch' })
  })

  it('does not divide by zero for a collapsed element', () => {
    const message = toPointerMessage('down', { pointerId: 1, clientX: 5, clientY: 5, timeStamp: 1, pointerType: 'mouse' }, { left: 0, top: 0 }, { width: 0, height: 0 })
    expect(message).toMatchObject({ x: 0, y: 0 })
  })
})

describe('isIosTouch', () => {
  it('detects iPhone and iPad, including iPadOS which reports itself as a Mac with touch', () => {
    expect(isIosTouch({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true)
    expect(isIosTouch({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })).toBe(true)
    expect(isIosTouch({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
  })

  it('does not treat a desktop Mac, Android or an unknown environment as iOS', () => {
    expect(isIosTouch({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
    expect(isIosTouch({ userAgent: 'Mozilla/5.0 (Linux; Android 16; 25097RP43G) AppleWebKit/537.36 Chrome/155' })).toBe(false)
    expect(isIosTouch(undefined)).toBe(false)
  })
})
