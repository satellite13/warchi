import { describe, it, expect } from 'vitest'
import { outlinesEquivalent } from './outlinesEquivalent'

const rect = JSON.stringify([
  { type: 'line', points: [[0, 0], [1, 0]] },
  { type: 'line', points: [[1, 0], [1, 1]] },
  { type: 'line', points: [[1, 1], [0, 1]] },
  { type: 'line', points: [[0, 1], [0, 0]] },
])

describe('outlinesEquivalent', () => {
  it('returns true for identical JSON', () => {
    expect(outlinesEquivalent(rect, rect)).toBe(true)
  })

  it('returns true when whitespace differs but segments match', () => {
    const spaced = JSON.stringify(JSON.parse(rect), null, 2)
    expect(outlinesEquivalent(rect, spaced)).toBe(true)
  })

  it('returns false for different geometry', () => {
    const other = JSON.stringify([{ type: 'line', points: [[0, 0], [2, 0]] }])
    expect(outlinesEquivalent(rect, other)).toBe(false)
  })

  it('returns false for null/invalid/empty either side', () => {
    expect(outlinesEquivalent(null, rect)).toBe(false)
    expect(outlinesEquivalent(rect, null)).toBe(false)
    expect(outlinesEquivalent('not-json', rect)).toBe(false)
    expect(outlinesEquivalent('[]', rect)).toBe(false)
    expect(outlinesEquivalent(rect, '[]')).toBe(false)
  })
})
