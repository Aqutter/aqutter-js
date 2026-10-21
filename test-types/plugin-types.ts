// 型別測試：由 `pnpm typecheck` 編譯；@ts-expect-error 行必須真的報錯。
import { callPlugin, onPluginEvent } from '../src/index'
import type { PluginDefinition } from '../src/index'

declare module '../src/index' {
  interface AqutterPluginRegistry {
    demo: PluginDefinition<
      {
        ping: { req: { n: number }, res: { pong: number } }
        reset: { req: void, res: { ok: true } }
      },
      { changed: { level: number } }
    >
  }
}

export const check = async (): Promise<void> => {
  const r = await callPlugin('demo', 'ping', { n: 1 })
  const pong: number = r.pong
  await callPlugin('demo', 'reset')
  onPluginEvent('demo', 'changed', (payload) => {
    const level: number = payload.level
    void level
  })
  void pong
  // @ts-expect-error 方法不存在
  await callPlugin('demo', 'nope')
  // @ts-expect-error payload 型別錯誤
  await callPlugin('demo', 'ping', { n: 'x' })
  // @ts-expect-error plugin 不存在
  await callPlugin('missing', 'ping', {})
}
