import { describe, it, expect } from 'vitest'
import { toAccessLabel } from '@/utils/accessPermission'

describe('toAccessLabel', () => {
  describe('Russian locale (default)', () => {
    it('returns "Мой" for OWNER', () => {
      expect(toAccessLabel('OWNER')).toBe('Мой')
    })

    it('returns "Общий: редактирование" for EDIT', () => {
      expect(toAccessLabel('EDIT')).toBe('Общий: редактирование')
    })

    it('returns "Общий: просмотр" for VIEW', () => {
      expect(toAccessLabel('VIEW')).toBe('Общий: просмотр')
    })

    it('returns "Админ-доступ" for ADMIN', () => {
      expect(toAccessLabel('ADMIN')).toBe('Админ-доступ')
    })

    it('returns "Мой" for OWNER with explicit ru locale', () => {
      expect(toAccessLabel('OWNER', 'ru')).toBe('Мой')
    })
  })

  describe('English locale', () => {
    it('returns "Mine" for OWNER', () => {
      expect(toAccessLabel('OWNER', 'en')).toBe('Mine')
    })

    it('returns "Shared: edit" for EDIT', () => {
      expect(toAccessLabel('EDIT', 'en')).toBe('Shared: edit')
    })

    it('returns "Shared: view" for VIEW', () => {
      expect(toAccessLabel('VIEW', 'en')).toBe('Shared: view')
    })

    it('returns "Admin access" for ADMIN', () => {
      expect(toAccessLabel('ADMIN', 'en')).toBe('Admin access')
    })
  })

  describe('edge cases', () => {
    it('returns empty string for null', () => {
      expect(toAccessLabel(null)).toBe('')
    })

    it('returns empty string for undefined', () => {
      expect(toAccessLabel(undefined)).toBe('')
    })

    it('returns empty string for null with en locale', () => {
      expect(toAccessLabel(null, 'en')).toBe('')
    })

    it('returns empty string for undefined with en locale', () => {
      expect(toAccessLabel(undefined, 'en')).toBe('')
    })
  })
})
