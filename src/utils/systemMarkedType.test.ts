import { describe, expect, it } from 'vitest'
import { isSystemMarkedType } from './systemMarkedType'

describe('isSystemMarkedType', () => {
  it('detects system: true', () => {
    expect(isSystemMarkedType({ parsedAttrs: { system: true } })).toBe(true)
  })

  it('detects system.hiddenTreeRootType', () => {
    expect(
      isSystemMarkedType({
        parsedAttrs: { system: { hiddenTreeRootType: true } },
      }),
    ).toBe(true)
  })

  it('detects any true flag inside system object', () => {
    expect(
      isSystemMarkedType({
        parsedAttrs: { system: { hiddenTreeRoot: true } },
      }),
    ).toBe(true)
  })

  it('ignores system: false and empty system object', () => {
    expect(isSystemMarkedType({ parsedAttrs: { system: false } })).toBe(false)
    expect(isSystemMarkedType({ parsedAttrs: { system: {} } })).toBe(false)
    expect(
      isSystemMarkedType({
        parsedAttrs: { system: { hiddenTreeRootType: false } },
      }),
    ).toBe(false)
  })

  it('ignores types without system marker', () => {
    expect(isSystemMarkedType({ parsedAttrs: {} })).toBe(false)
    expect(isSystemMarkedType(null)).toBe(false)
  })
})
