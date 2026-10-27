import { BridgeHandler } from './contract/bridge'
import type { NativeEndpoint } from './contract/bridge'
import { callFlutter } from './index'

/** 二進位通道的名稱：`<pluginId>.<channel>`，兩段各自符合 `^[a-z][a-z0-9-]*$`。 */
export const binaryChannelNamePattern = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/

/** 連線打開前的等待上限（毫秒）。 */
const CONNECT_TIMEOUT_MS = 10_000

export interface BinaryChannelCloseInfo {
  code: number
  reason: string
}

/** 與殼之間的一條二進位通道：訊息不經 JSON 與 base64。 */
export interface BinaryChannel {
  /** 送出二進位訊息。連線已關閉時會被忽略。 */
  send: (data: ArrayBuffer | ArrayBufferView) => void
  /** 尚未送出的位元組數；大量上行時用它做背壓（例如超過某個值就先等）。 */
  readonly bufferedAmount: number
  /** 收到二進位訊息。回傳取消訂閱的函式。 */
  onMessage: (listener: (data: ArrayBuffer) => void) => () => void
  /** 連線關閉（含殼重啟、plugin 取消註冊）；不會自動重連，需要的話自行重新開啟。 */
  onClose: (listener: (info: BinaryChannelCloseInfo) => void) => () => void
  /** 主動關閉。 */
  close: () => void
}

export interface ConnectBinaryChannelOptions {
  timeoutMs?: number
}

/** 以指定的連線資訊來源開啟通道；{@link openBinaryChannel} 的可測試核心。 */
export const connectBinaryChannel = async (
  name: string,
  resolveEndpoint: () => Promise<NativeEndpoint>,
  options: ConnectBinaryChannelOptions = {},
): Promise<BinaryChannel> => {
  if (!binaryChannelNamePattern.test(name)) {
    throw new Error(`[aqutter] invalid channel name "${name}": expected "<pluginId>.<channel>" (lowercase letters, digits and "-")`)
  }
  const endpoint = await resolveEndpoint()
  const url = `ws://127.0.0.1:${endpoint.port}/channel/${name}?token=${encodeURIComponent(endpoint.token)}`
  const timeoutMs = options.timeoutMs ?? CONNECT_TIMEOUT_MS

  return await new Promise<BinaryChannel>((resolve, reject) => {
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    const messageListeners = new Set<(data: ArrayBuffer) => void>()
    const closeListeners = new Set<(info: BinaryChannelCloseInfo) => void>()
    let opened = false

    const fail = (reason: string): void => {
      reject(new Error(`[aqutter] could not open channel "${name}": ${reason}`))
    }
    const timer = setTimeout(() => {
      fail(`no connection after ${timeoutMs} ms`)
      socket.close()
    }, timeoutMs)

    socket.onopen = () => {
      opened = true
      clearTimeout(timer)
      resolve({
        send: (data) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(data as ArrayBuffer)
          }
        },
        get bufferedAmount() {
          return socket.bufferedAmount
        },
        onMessage: (listener) => {
          messageListeners.add(listener)
          return () => messageListeners.delete(listener)
        },
        onClose: (listener) => {
          closeListeners.add(listener)
          return () => closeListeners.delete(listener)
        },
        close: () => socket.close(),
      })
    }
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        for (const listener of [...messageListeners]) {
          listener(event.data)
        }
      }
    }
    socket.onclose = (event) => {
      clearTimeout(timer)
      if (!opened) {
        fail('refused (channel not registered on this platform, wrong token, or blocked by the page CSP; connect-src must allow ws://127.0.0.1:*)')
        return
      }
      for (const listener of [...closeListeners]) {
        listener({ code: event.code, reason: event.reason })
      }
    }
  })
}

/**
 * 開啟 plugin 宣告的二進位通道 `<pluginId>.<channel>`（見 Dart 端 `AqutterPlugin.channels`）。
 *
 * 連線打開後才 resolve；名稱不合法、不在 Flutter 內、被拒絕或逾時（10 秒）都會 reject。
 */
export const openBinaryChannel = async (name: string): Promise<BinaryChannel> =>
  await connectBinaryChannel(name, () => callFlutter(BridgeHandler.NativeEndpoint))
