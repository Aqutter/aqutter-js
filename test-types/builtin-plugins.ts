// 型別測試：殼內建四個 plugin 的契約 rev 1；由 `pnpm typecheck` 編譯，@ts-expect-error 行必須真的報錯。
import { callPlugin, onPluginEvent } from '../src/index'

export const check = async (): Promise<void> => {
  // clipboard
  const text: string | null = (await callPlugin('clipboard', 'read')).text
  await callPlugin('clipboard', 'write', { text: 'x' })
  const image = (await callPlugin('clipboard', 'readImage')).image
  const bytes: Uint8Array | undefined = image?.data
  await callPlugin('clipboard', 'writeImage', { data: new Uint8Array(1), mimeType: 'image/png' })

  // share
  const status: 'shared' | 'dismissed' | 'unavailable' = (await callPlugin('share', 'open', { text: 'x' })).status

  // notification
  const id: number = (await callPlugin('notification', 'show', { title: 't' })).id
  await callPlugin('notification', 'schedule', { title: 't', atMs: Date.now() + 1000 })
  await callPlugin('notification', 'cancel', { id })
  await callPlugin('notification', 'cancel', {})
  const initial = await callPlugin('notification', 'initial')
  const initialId: number | null = initial.id
  onPluginEvent('notification', 'tapped', (payload) => {
    const tappedId: number = payload.id
    const tappedPayload: string | null = payload.payload
    void tappedId
    void tappedPayload
  })

  // deeplink
  const url: string | null = (await callPlugin('deeplink', 'initial')).url
  onPluginEvent('deeplink', 'received', (payload) => {
    const link: string = payload.url
    void link
  })

  void [text, bytes, status, initialId, url]

  // @ts-expect-error 舊的 handler 名稱已移除，方法在新名稱下
  await callPlugin('clipboard', 'clipboard_read')
  // @ts-expect-error 請求型別錯誤：title 必填
  await callPlugin('notification', 'show', {})
  // @ts-expect-error 沒有 payload 的方法不能多傳參數
  await callPlugin('deeplink', 'initial', { url: 'x' })
  // @ts-expect-error 事件名稱是 received，不是舊的 deep_link
  onPluginEvent('deeplink', 'deep_link', () => {})
}
