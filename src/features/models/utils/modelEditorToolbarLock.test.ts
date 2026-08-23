import { describe, expect, it } from 'vitest'
import { isSaveLockedToolbarEvent } from './modelEditorToolbarLock'

describe('isSaveLockedToolbarEvent', () => {
  it('blocks save, OEF import and validation scripts while save validation is running', () => {
    expect(isSaveLockedToolbarEvent('save', true)).toBe(true)
    expect(isSaveLockedToolbarEvent('import-oef', true)).toBe(true)
    expect(isSaveLockedToolbarEvent('run-validation-script', true)).toBe(true)
    expect(isSaveLockedToolbarEvent('close-diagram', true)).toBe(false)
    expect(isSaveLockedToolbarEvent('import-oef', false)).toBe(false)
  })
})
