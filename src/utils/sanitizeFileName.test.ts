import { describe, expect, it } from 'vitest'
import { sanitizeFileName } from './sanitizeFileName'

describe('sanitizeFileName', () => {
  it('keeps latin names as lowercase hyphenated slugs', () => {
    expect(sanitizeFileName('C4-Composite')).toBe('c4-composite')
    expect(sanitizeFileName('  My Diagram  ')).toBe('my-diagram')
  })

  it('transliterates cyrillic to ascii instead of dropping letters', () => {
    expect(sanitizeFileName('С4 композиция')).toBe('s4-kompozitsiya')
    expect(sanitizeFileName('C4 с композитными компонентами')).toBe(
      'c4-s-kompozitnymi-komponentami',
    )
  })

  it('strips remaining non-ascii characters', () => {
    expect(sanitizeFileName('diagram — αβ')).toBe('diagram')
  })
})
