import { describe, expect, it } from 'vitest'
import { formatDate } from '@/utils/formatDate'

describe('formatDate', () => {
  describe('returns dash for invalid inputs', () => {
    it('returns "—" for undefined', () => {
      expect(formatDate(undefined)).toBe('—')
    })

    it('returns "—" for null', () => {
      expect(formatDate(null)).toBe('—')
    })

    it('returns "—" for empty string', () => {
      expect(formatDate('')).toBe('—')
    })

    it('returns "—" for invalid date string', () => {
      expect(formatDate('not-a-date')).toBe('—')
      expect(formatDate('abc')).toBe('—')
      expect(formatDate('2024-13-45')).toBe('—')
    })
  })

  describe('formats valid dates', () => {
    const validDate = '2024-06-15T10:30:00Z'

    it('returns a non-empty string for a valid ISO date', () => {
      const result = formatDate(validDate)
      expect(result).not.toBe('—')
      expect(result.length).toBeGreaterThan(0)
    })

    it('returns a non-dash string with ru locale', () => {
      const result = formatDate(validDate, 'ru')
      expect(result).not.toBe('—')
      expect(result.length).toBeGreaterThan(0)
    })

    it('returns a non-dash string with en locale', () => {
      const result = formatDate(validDate, 'en')
      expect(result).not.toBe('—')
      expect(result.length).toBeGreaterThan(0)
    })

    it('returns a non-dash string without time when includeTime is false', () => {
      const result = formatDate(validDate, 'ru', false)
      expect(result).not.toBe('—')
      expect(result.length).toBeGreaterThan(0)
    })

    it('produces different output with and without time', () => {
      const withTime = formatDate(validDate, 'en', true)
      const withoutTime = formatDate(validDate, 'en', false)
      expect(withTime).not.toBe('—')
      expect(withoutTime).not.toBe('—')
      // The version with time should be longer or different
      expect(withTime).not.toBe(withoutTime)
    })
  })

  describe('handles various valid date formats', () => {
    it('handles date-only string', () => {
      const result = formatDate('2024-01-01')
      expect(result).not.toBe('—')
    })

    it('handles full ISO string with timezone', () => {
      const result = formatDate('2024-06-15T10:30:00+03:00')
      expect(result).not.toBe('—')
    })

    it('handles epoch-start date', () => {
      const result = formatDate('1970-01-01T00:00:00Z')
      expect(result).not.toBe('—')
    })
  })

  describe('defaults to ru locale', () => {
    it('uses ru-RU when locale is undefined', () => {
      const result = formatDate('2024-06-15T10:30:00Z')
      expect(result).not.toBe('—')
    })

    it('uses ru-RU when locale is unknown', () => {
      const result = formatDate('2024-06-15T10:30:00Z', 'de')
      expect(result).not.toBe('—')
    })
  })
})
