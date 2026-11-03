// 型別測試：由 `pnpm typecheck` 編譯；@ts-expect-error 行必須真的報錯。
import { callPlugin, onPluginEvent } from '../src/index'
import type { PluginDefinition } from '../src/index'

declare module '../src/index' {
  interface AqutterPluginRegistry {
    demo: PluginDefinition<
      {
        ping: { req: { n: number }, res: { pong: number } }
        reset: { req: undefined, res: { ok: true } }
        // 舊寫法 `req: void` 的 plugin 仍要能不帶參數呼叫
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- 刻意保留舊寫法的相容測試
        legacy: { req: void, res: { ok: true } }
      },
      { changed: { level: number } }
    >
  }
}

export const check = async (): Promise<void> => {
  const r = await callPlugin('demo', 'ping', { n: 1 })
  const pong: number | undefined = r?.pong
  await callPlugin('demo', 'reset')
  await callPlugin('demo', 'legacy')
  onPluginEvent('demo', 'changed', (payload) => {
    const level: number = payload.level
    void level
  })
  void pong
  // @ts-expect-error 方法不存在，應該編譯失敗
  await callPlugin('demo', 'nope')
  // @ts-expect-error payload 型別錯誤，應該編譯失敗
  await callPlugin('demo', 'ping', { n: 'x' })
  // @ts-expect-error plugin 不存在，應該編譯失敗
  await callPlugin('missing', 'ping', {})
}
