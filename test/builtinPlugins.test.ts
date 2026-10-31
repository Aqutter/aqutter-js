import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BridgeEvent, BridgeHandler } from '../src/contract/bridge'

const removedHandlers = [
  'clipboard_read',
  'clipboard_write',
  'clipboard_read_image',
  'clipboard_write_image',
  'share_open',
  'notify_show',
  'notify_schedule',
  'notify_cancel',
  'notify_initial',
  'deeplink_initial',
]
const removedEvents = ['notify_tapped', 'deep_link']

// 契約 rev 1（正本：Aqutter/aqutter 的 docs/native-features.md）
const imageMethods = ['clipboard.readImage', 'clipboard.writeImage']
const everywhere = ['clipboard.read', 'clipboard.write', 'share.open']
const notifyAndLinks = [
  'notification.show',
  'notification.schedule',
  'notification.cancel',
  'notification.initial',
  'deeplink.initial',
]

describe('built-in plugin names (contract rev 1)', () => {
  it('no longer declares the old handler and event names', () => {
    const handlers: string[] = Object.values(BridgeHandler)
    const events: string[] = Object.values(BridgeEvent)
    for (const name of removedHandlers) {
      expect(handlers, name).not.toContain(name)
    }
    for (const name of removedEvents) {
      expect(events, name).not.toContain(name)
    }
  })

  describe('capabilities', () => {
    beforeEach(() => {
      vi.resetModules()
      vi.stubGlobal('window', { aqutterEndpoint: { port: 1, token: 't' } })
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('isPluginSupported follows the capability table the shell reports', async () => {
      const { isPluginSupported, setBridgeCapabilities, pluginHandlerName } = await import('../src/index')
      // Linux：文字與分享可用，圖片、通知、深層連結不在能力表
      setBridgeCapabilities([...Object.values(BridgeHandler), ...everywhere])
      for (const name of everywhere) {
        const [id, method] = name.split('.')
        expect(isPluginSupported(id, method), name).toBe(true)
      }
      for (const name of [...imageMethods, ...notifyAndLinks]) {
        const [id, method] = name.split('.')
        expect(isPluginSupported(id, method), name).toBe(false)
      }
      expect(pluginHandlerName('notification', 'show')).toBe('notification.show')
    })
  })
})
