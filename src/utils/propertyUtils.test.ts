import { describe, expect, it } from 'vitest'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import { coercePropertyValue, regexTestProperty } from '@/utils/propertyUtils'

const prop = (overrides: Partial<CustomProperty>): CustomProperty =>
  ({
    id: 'test',
    name: 'Test',
    type: 'string',
    required: false,
    min: null,
    max: null,
    ...overrides,
  }) as CustomProperty

describe('coercePropertyValue', () => {
  describe('boolean type', () => {
    const boolProp = prop({ type: 'boolean' })

    it('returns true when checked is true', () => {
      expect(coercePropertyValue(boolProp, '', true)).toBe(true)
    })

    it('returns false when checked is false', () => {
      expect(coercePropertyValue(boolProp, '', false)).toBe(false)
    })

    it('returns false when checked is undefined', () => {
      expect(coercePropertyValue(boolProp, '')).toBe(false)
    })

    it('ignores raw string value for boolean type', () => {
      expect(coercePropertyValue(boolProp, 'true', false)).toBe(false)
    })
  })

  describe('number type', () => {
    const numProp = prop({ type: 'number' })

    it('returns parsed integer', () => {
      expect(coercePropertyValue(numProp, '42')).toBe(42)
    })

    it('returns parsed float', () => {
      expect(coercePropertyValue(numProp, '3.14')).toBe(3.14)
    })

    it('returns parsed negative number', () => {
      expect(coercePropertyValue(numProp, '-10')).toBe(-10)
    })

    it('returns zero for "0"', () => {
      expect(coercePropertyValue(numProp, '0')).toBe(0)
    })

    it('returns null for non-numeric string', () => {
      expect(coercePropertyValue(numProp, 'abc')).toBeNull()
    })

    it('returns 0 for empty string (Number("") === 0)', () => {
      expect(coercePropertyValue(numProp, '')).toBe(0)
    })

    it('returns null for Infinity', () => {
      expect(coercePropertyValue(numProp, 'Infinity')).toBeNull()
    })

    it('returns null for NaN string', () => {
      expect(coercePropertyValue(numProp, 'NaN')).toBeNull()
    })
  })

  describe('string type', () => {
    const strProp = prop({ type: 'string' })

    it('returns raw string as-is', () => {
      expect(coercePropertyValue(strProp, 'hello')).toBe('hello')
    })

    it('returns empty string as-is', () => {
      expect(coercePropertyValue(strProp, '')).toBe('')
    })
  })

  describe('enum type', () => {
    const enumProp = prop({ type: 'enum', enumValues: ['a', 'b', 'c'] })

    it('returns raw string as-is (no validation in coerce)', () => {
      expect(coercePropertyValue(enumProp, 'a')).toBe('a')
    })

    it('returns any string (coerce does not restrict to enumValues)', () => {
      expect(coercePropertyValue(enumProp, 'xyz')).toBe('xyz')
    })
  })
})

describe('regexTestProperty', () => {
  describe('non-string properties', () => {
    it('returns null for number type', () => {
      expect(regexTestProperty(prop({ type: 'number', regex: '\\d+' }), '123')).toBeNull()
    })

    it('returns null for boolean type', () => {
      expect(regexTestProperty(prop({ type: 'boolean', regex: '.*' }), 'true')).toBeNull()
    })

    it('returns null for enum type', () => {
      expect(regexTestProperty(prop({ type: 'enum', regex: '.*' }), 'val')).toBeNull()
    })
  })

  describe('missing or empty regex', () => {
    it('returns null when regex is undefined', () => {
      expect(regexTestProperty(prop({ type: 'string' }), 'test')).toBeNull()
    })

    it('returns null when regex is empty string', () => {
      expect(regexTestProperty(prop({ type: 'string', regex: '' }), 'test')).toBeNull()
    })

    it('returns null when regex is whitespace only', () => {
      expect(regexTestProperty(prop({ type: 'string', regex: '   ' }), 'test')).toBeNull()
    })
  })

  describe('empty value', () => {
    it('returns null for empty string value', () => {
      expect(regexTestProperty(prop({ type: 'string', regex: '\\d+' }), '')).toBeNull()
    })

    it('returns null for whitespace-only value', () => {
      expect(regexTestProperty(prop({ type: 'string', regex: '\\d+' }), '   ')).toBeNull()
    })
  })

  describe('matching', () => {
    it('returns true when value matches regex', () => {
      expect(regexTestProperty(prop({ type: 'string', regex: '^\\d+$' }), '123')).toBe(true)
    })

    it('returns false when value does not match regex', () => {
      expect(regexTestProperty(prop({ type: 'string', regex: '^\\d+$' }), 'abc')).toBe(false)
    })

    it('returns true for partial match (regex without anchors)', () => {
      expect(regexTestProperty(prop({ type: 'string', regex: '\\d+' }), 'abc123def')).toBe(true)
    })

    it('works with email-like pattern', () => {
      const emailProp = prop({ type: 'string', regex: '^[^@]+@[^@]+$' })
      expect(regexTestProperty(emailProp, 'user@example.com')).toBe(true)
      expect(regexTestProperty(emailProp, 'invalid')).toBe(false)
    })
  })

  describe('invalid regex', () => {
    it('returns null for invalid regex pattern', () => {
      expect(regexTestProperty(prop({ type: 'string', regex: '[invalid' }), 'test')).toBeNull()
    })
  })
})
