import type { NativeEndpoint } from './contract/bridge'
import { AqutterPluginError } from './error'
import type { Frame } from './frame'
import { encodeMessages, FrameError, Reassembler } from './frame'

/** 與殼之間那一條多工連線的狀態。 */
export type TransportState = 'connecting' | 'open' | 'closed'

export interface TransportOptions {
  /** 取得連線資訊（埠與令牌）；殼重啟後會變，所以每次連線都重新取得。 */
  resolveEndpoint: () => Promise<NativeEndpoint>
  /** WebSocket 建構函式；預設全域的 `WebSocket`。測試用。 */
  webSocket?: typeof WebSocket
  /** 連線建立前排隊的上限（毫秒）；預設 10 秒。 */
  queueTimeoutMs?: number
  /** 重連的退避：起始與上限（毫秒）；預設 200 ms 起、每次加倍、上限 5 秒。 */
  backoff?: { initialMs: number, maxMs: number }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

interface Queued extends Pending {
  id: number
  messages: Uint8Array[]
  timer: ReturnType<typeof setTimeout>
}

const CHANNEL = 'aqutter.rpc'
const CSP_HINT = 'check that the page CSP allows connect-src ws://127.0.0.1:*'

/**
 * 網頁與殼之間唯一的資料傳輸：一條多工的本機 WebSocket，承載呼叫、回應、事件與二進位。
 *
 * - 連線尚未建立（或重連中）發出的呼叫會排隊，建立後依序送出；排隊超過逾時以 `TRANSPORT_UNAVAILABLE` reject。
 * - 連線意外關閉時，已送出未回應的呼叫以 `TRANSPORT_CLOSED` reject（不重送：可能已有副作用），並自動重連。
 * - 事件不排隊、不補發；用 {@link Transport.onState} 在重連後自行重新取得狀態。
 */
export class Transport {
  private readonly options: TransportOptions
  private readonly sockets: typeof WebSocket
  private readonly queueTimeoutMs: number
  private readonly backoff: { initialMs: number, maxMs: number }

  private socket: WebSocket | null = null
  private current: TransportState = 'closed'
  private started = false
  private nextId = 0
  private nextPartId = 0
  private retryDelay: number
  private lastFailure = ''

  private readonly pending = new Map<number, Pending>()
  private queue: Queued[] = []
  private readonly eventListeners = new Map<string, Set<(payload: unknown) => void>>()
  private readonly stateListeners = new Set<(state: TransportState) => void>()

  constructor(options: TransportOptions) {
    this.options = options
    this.sockets = options.webSocket ?? WebSocket
    this.queueTimeoutMs = options.queueTimeoutMs ?? 10_000
    this.backoff = options.backoff ?? { initialMs: 200, maxMs: 5000 }
    this.retryDelay = this.backoff.initialMs
  }

  get state(): TransportState {
    return this.current
  }

  /** 開始連線（冪等）。第一次呼叫或訂閱時自動執行。 */
  start(): void {
    if (this.started) {
      return
    }
    this.started = true
    void this.connect()
  }

  onState(listener: (state: TransportState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onEvent(channel: string, listener: (payload: unknown) => void): () => void {
    this.start()
    const set = this.eventListeners.get(channel) ?? new Set()
    set.add(listener)
    this.eventListeners.set(channel, set)
    return () => set.delete(listener)
  }

  call(name: string, payload: unknown): Promise<unknown> {
    this.start()
    const id = this.nextId++
    let messages: Uint8Array[]
    try {
      messages = encodeMessages({ t: 'call', id, name, p: payload }, this.nextPartId++)
    }
    catch (error) {
      if (error instanceof FrameError) {
        return Promise.reject(new AqutterPluginError('PAYLOAD_TOO_LARGE', `The payload of "${name}" exceeds the frame size limit`))
      }
      return Promise.reject(error)
    }
    return new Promise<unknown>((resolve, reject) => {
      if (this.current === 'open' && this.socket) {
        this.pending.set(id, { resolve, reject })
        for (const message of messages) {
          this.socket.send(message)
        }
        return
      }
      const timer = setTimeout(() => {
        this.queue = this.queue.filter(item => item.id !== id)
        const reason = this.lastFailure ? `${this.lastFailure}; ` : ''
        reject(new AqutterPluginError('TRANSPORT_UNAVAILABLE', `Could not reach the host within ${this.queueTimeoutMs} ms (${reason}${CSP_HINT})`))
      }, this.queueTimeoutMs)
      this.queue.push({ id, messages, resolve, reject, timer })
    })
  }

  private setState(state: TransportState): void {
    if (this.current === state) {
      return
    }
    this.current = state
    for (const listener of [...this.stateListeners]) {
      listener(state)
    }
  }

  private async connect(): Promise<void> {
    this.setState('connecting')
    let url: string
    try {
      const endpoint = await this.options.resolveEndpoint()
      url = `ws://127.0.0.1:${endpoint.port}/channel/${CHANNEL}?token=${encodeURIComponent(endpoint.token)}`
    }
    catch (error) {
      this.lastFailure = `native_endpoint failed: ${error instanceof Error ? error.message : String(error)}`
      this.scheduleReconnect()
      return
    }

    let socket: WebSocket
    try {
      socket = new this.sockets(url)
    }
    catch (error) {
      this.lastFailure = `could not open the connection: ${error instanceof Error ? error.message : String(error)}`
      this.scheduleReconnect()
      return
    }
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    let opened = false
    const reassembler = new Reassembler()

    socket.onopen = () => {
      opened = true
      this.retryDelay = this.backoff.initialMs
      this.lastFailure = ''
      this.setState('open')
      const queued = this.queue
      this.queue = []
      for (const item of queued) {
        clearTimeout(item.timer)
        this.pending.set(item.id, { resolve: item.resolve, reject: item.reject })
        for (const message of item.messages) {
          socket.send(message)
        }
      }
    }
    socket.onmessage = (event: MessageEvent) => {
      if (!(event.data instanceof ArrayBuffer)) {
        return
      }
      try {
        const frame = reassembler.add(event.data)
        if (frame) {
          this.handle(frame)
        }
      }
      catch (error) {
        if (error instanceof FrameError) {
          socket.close(1002, 'BAD_FRAME')
          return
        }
        throw error
      }
    }
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null
      }
      if (!opened) {
        this.lastFailure = 'the connection was refused'
      }
      this.failPending()
      this.setState('closed')
      this.scheduleReconnect()
    }
  }

  private handle(frame: Frame): void {
    if (frame.t === 'evt') {
      const set = this.eventListeners.get(frame.ch ?? '')
      for (const listener of set ? [...set] : []) {
        listener(frame.p)
      }
      return
    }
    const entry = frame.id === undefined ? undefined : this.pending.get(frame.id)
    if (!entry || frame.id === undefined) {
      return
    }
    this.pending.delete(frame.id)
    if (frame.t === 'err') {
      entry.reject(new AqutterPluginError(frame.e?.code ?? 'HANDLER_FAILED', frame.e?.message ?? ''))
    }
    else if (frame.t === 'res') {
      entry.resolve(frame.p ?? null)
    }
  }

  private failPending(): void {
    const pending = [...this.pending.values()]
    this.pending.clear()
    for (const entry of pending) {
      entry.reject(new AqutterPluginError('TRANSPORT_CLOSED', 'The connection closed before the call was answered'))
    }
  }

  private scheduleReconnect(): void {
    this.setState('closed')
    const delay = this.retryDelay
    this.retryDelay = Math.min(this.retryDelay * 2, this.backoff.maxMs)
    setTimeout(() => {
      void this.connect()
    }, delay)
  }
}
