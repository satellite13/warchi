import { describe, expect, it } from 'vitest'
import { nextUniqueShapeName } from './uniqueShapeName'

describe('nextUniqueShapeName', () => {
  it('returns base when free', () => {
    expect(nextUniqueShapeName('Hex', new Set())).toBe('Hex')
    expect(nextUniqueShapeName('Hex', new Set(['Other']))).toBe('Hex')
  })

  it('suffixes on case-insensitive conflict', () => {
    expect(nextUniqueShapeName('Hex', new Set(['hex']))).toBe('Hex (2)')
    expect(nextUniqueShapeName('Hex', new Set(['Hex', 'Hex (2)']))).toBe('Hex (3)')
  })
})
