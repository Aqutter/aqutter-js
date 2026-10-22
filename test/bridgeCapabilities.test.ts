import { describe, expect, it } from 'vitest'

import { BridgeHandler } from '../src/contract/bridge'
import { setBridgeCapabilities } from '../src/index'
import type { BridgeNameMismatch } from '../src/index'

const core = Object.values(BridgeHandler)

const run = (names: string[]): BridgeNameMismatch | null => {
  let result: BridgeNameMismatch | null = null
  setBridgeCapabilities(names, { onMismatch: (mismatch) => { result = mismatch } })
  return result
}

describe('setBridgeCapabilities mismatch check', () => {
  it('reports nothing when both sides list the same core handlers', () => {
    expect(run([...core])).toBeNull()
  })

  it('ignores plugin handlers (<id>.<method>) that the host provides', () => {
    expect(run([...core, 'battery.level', 'haptics.impact', 'mirror-demo.state'])).toBeNull()
  })

  it('still reports a core handler the host provides but the web does not declare', () => {
    const mismatch = run([...core, 'typo_handler', 'battery.level'])
    expect(mismatch?.missingOnWeb).toEqual(['typo_handler'])
  })

  it('still reports a core handler the web declares but the host does not provide', () => {
    const [removed, ...rest] = core
    const mismatch = run([...rest, 'battery.level'])
    expect(mismatch?.missingOnHost).toEqual([removed])
    expect(mismatch?.missingOnWeb).toEqual([])
  })
})
