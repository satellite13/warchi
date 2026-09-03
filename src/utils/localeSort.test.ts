import { describe, expect, it } from 'vitest'
import { compareLocalizedEntityNames, localeTagFromAppLocale } from './localeSort'

describe('localeSort', () => {
  it('maps app locale to tag', () => {
    expect(localeTagFromAppLocale('ru')).toBe('ru')
    expect(localeTagFromAppLocale('en')).toBe('en')
    expect(localeTagFromAppLocale('de')).toBe('en')
  })

  it('sorts empty names last and respects numeric order', () => {
    expect(compareLocalizedEntityNames('item2', 'item10', 'en')).toBeLessThan(0)
    expect(compareLocalizedEntityNames('', 'A', 'en')).toBeGreaterThan(0)
  })
})
