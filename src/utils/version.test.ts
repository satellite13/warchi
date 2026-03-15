import { describe, expect, it } from 'vitest'
import { bumpMinor, compareVersions, isValidVersion } from '@/utils/version'

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.0.0', '0.0.0')).toBe(0)
    expect(compareVersions('10.20.30', '10.20.30')).toBe(0)
  })

  it('returns positive when a > b', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.1.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
  })

  it('returns negative when a < b', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
  })

  it('compares major version first', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
  })

  it('compares minor version when major is equal', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBeGreaterThan(0)
  })

  it('handles versions with different segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0)
    expect(compareVersions('1', '1.0.0')).toBe(0)
  })

  it('handles large version numbers', () => {
    expect(compareVersions('100.200.300', '100.200.299')).toBeGreaterThan(0)
  })
})

describe('isValidVersion', () => {
  it('accepts valid semver strings', () => {
    expect(isValidVersion('0.0.0')).toBe(true)
    expect(isValidVersion('1.2.3')).toBe(true)
    expect(isValidVersion('10.20.30')).toBe(true)
    expect(isValidVersion('999.999.999')).toBe(true)
  })

  it('rejects versions with fewer than three segments', () => {
    expect(isValidVersion('1')).toBe(false)
    expect(isValidVersion('1.2')).toBe(false)
  })

  it('rejects versions with more than three segments', () => {
    expect(isValidVersion('1.2.3.4')).toBe(false)
  })

  it('rejects non-numeric segments', () => {
    expect(isValidVersion('a.b.c')).toBe(false)
    expect(isValidVersion('1.2.x')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidVersion('')).toBe(false)
  })

  it('rejects strings with spaces', () => {
    expect(isValidVersion(' 1.2.3')).toBe(false)
    expect(isValidVersion('1.2.3 ')).toBe(false)
  })

  it('rejects versions with negative numbers', () => {
    expect(isValidVersion('-1.0.0')).toBe(false)
  })

  it('rejects versions with leading zeros prefix like v', () => {
    expect(isValidVersion('v1.0.0')).toBe(false)
  })
})

describe('bumpMinor', () => {
  it('increments the minor version and resets patch to 0', () => {
    expect(bumpMinor('1.0.0')).toBe('1.1.0')
    expect(bumpMinor('1.2.3')).toBe('1.3.0')
    expect(bumpMinor('0.0.0')).toBe('0.1.0')
  })

  it('handles large minor versions', () => {
    expect(bumpMinor('1.99.5')).toBe('1.100.0')
  })

  it('preserves major version', () => {
    expect(bumpMinor('5.3.1')).toBe('5.4.0')
  })

  it('returns null for invalid versions', () => {
    expect(bumpMinor('')).toBeNull()
    expect(bumpMinor('1.2')).toBeNull()
    expect(bumpMinor('abc')).toBeNull()
    expect(bumpMinor('1.2.3.4')).toBeNull()
    expect(bumpMinor('not-a-version')).toBeNull()
  })
})
