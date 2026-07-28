import { describe, expect, it } from 'vitest'
import {
  entityNameVersionKey,
  findDuplicateNameVersionGroups,
  findNameVersionConflict,
} from './nameVersionUniqueness'

describe('nameVersionUniqueness', () => {
  describe('entityNameVersionKey', () => {
    it('trims name and version', () => {
      expect(entityNameVersionKey('  Actor ', ' 1.0.0 ')).toBe('Actor\u00001.0.0')
    })
  })

  describe('findNameVersionConflict', () => {
    const entities = [
      { id: 'a', name: 'Actor', version: '1.0.0' },
      { id: 'b', name: 'Service', version: '1.0.0' },
      { id: 'c', name: 'Actor', version: '2.0.0' },
      { id: 'd', name: 'Gone', version: '1.0.0', _isDeleted: true },
    ]

    it('finds conflict by name+version', () => {
      expect(findNameVersionConflict(entities, 'Actor', '1.0.0')?.id).toBe('a')
    })

    it('ignores trimmed differences', () => {
      expect(findNameVersionConflict(entities, ' Actor ', ' 1.0.0 ')?.id).toBe('a')
    })

    it('allows same name with different version', () => {
      expect(findNameVersionConflict(entities, 'Actor', '2.0.0', 'c')).toBeUndefined()
    })

    it('excludes the given id', () => {
      expect(findNameVersionConflict(entities, 'Actor', '1.0.0', 'a')).toBeUndefined()
    })

    it('ignores deleted entities', () => {
      expect(findNameVersionConflict(entities, 'Gone', '1.0.0')).toBeUndefined()
    })
  })

  describe('findDuplicateNameVersionGroups', () => {
    it('returns empty when all name+version pairs are unique', () => {
      expect(
        findDuplicateNameVersionGroups([
          { id: 'a', name: 'Actor', version: '1.0.0' },
          { id: 'b', name: 'Actor', version: '2.0.0' },
        ]),
      ).toEqual([])
    })

    it('groups duplicates including soft-same local rows after silent merge', () => {
      expect(
        findDuplicateNameVersionGroups([
          { id: 'shared', name: 'Actor', version: '1.0.0' },
          { id: 'shared', name: 'Actor', version: '1.0.0' },
          { id: 'other', name: 'Service', version: '1.0.0' },
        ]),
      ).toEqual([{ name: 'Actor', version: '1.0.0', ids: ['shared', 'shared'] }])
    })

    it('skips deleted entities', () => {
      expect(
        findDuplicateNameVersionGroups([
          { id: 'a', name: 'Actor', version: '1.0.0' },
          { id: 'b', name: 'Actor', version: '1.0.0', _isDeleted: true },
        ]),
      ).toEqual([])
    })
  })
})
