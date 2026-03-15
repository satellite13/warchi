import { describe, expect, it } from 'vitest'
import { parseNumberInput } from '@/utils/number'

describe('parseNumberInput', () => {
  it('parses integer strings', () => {
    expect(parseNumberInput('0')).toBe(0)
    expect(parseNumberInput('42')).toBe(42)
    expect(parseNumberInput('-7')).toBe(-7)
  })

  it('parses float strings', () => {
    expect(parseNumberInput('3.14')).toBe(3.14)
    expect(parseNumberInput('-0.5')).toBe(-0.5)
    expect(parseNumberInput('0.0')).toBe(0)
  })

  it('trims whitespace before parsing', () => {
    expect(parseNumberInput('  42  ')).toBe(42)
    expect(parseNumberInput(' 3.14 ')).toBe(3.14)
  })

  it('returns null for empty string', () => {
    expect(parseNumberInput('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(parseNumberInput('   ')).toBeNull()
    expect(parseNumberInput('\t')).toBeNull()
  })

  it('returns null for non-numeric strings', () => {
    expect(parseNumberInput('abc')).toBeNull()
    expect(parseNumberInput('12abc')).toBeNull()
    expect(parseNumberInput('hello')).toBeNull()
  })

  it('returns null for NaN-producing inputs', () => {
    expect(parseNumberInput('NaN')).toBeNull()
  })

  it('returns null for Infinity', () => {
    expect(parseNumberInput('Infinity')).toBeNull()
    expect(parseNumberInput('-Infinity')).toBeNull()
  })

  it('parses scientific notation', () => {
    expect(parseNumberInput('1e3')).toBe(1000)
    expect(parseNumberInput('2.5e2')).toBe(250)
  })

  it('parses zero variations', () => {
    expect(parseNumberInput('0')).toBe(0)
    expect(parseNumberInput('-0')).toBe(-0)
    expect(parseNumberInput('0.0')).toBe(0)
  })
})
