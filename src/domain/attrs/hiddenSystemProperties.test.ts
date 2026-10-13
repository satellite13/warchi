import { describe, expect, it } from 'vitest'
import { isHiddenSystemProperty } from './hiddenSystemProperties'

describe('isHiddenSystemProperty', () => {
  it('hides both name forms of the auto-created sync marker', () => {
    expect(isHiddenSystemProperty('auto-created')).toBe(true)
    expect(isHiddenSystemProperty('autoCreated')).toBe(true)
  })

  it('hides editor system flags shared across schemas', () => {
    expect(isHiddenSystemProperty('group')).toBe(true)
    expect(isHiddenSystemProperty('boundary')).toBe(true)
  })

  it('keeps ordinary user-facing properties visible', () => {
    expect(isHiddenSystemProperty('Owner')).toBe(false)
    expect(isHiddenSystemProperty('tier')).toBe(false)
    expect(isHiddenSystemProperty('')).toBe(false)
  })
})
