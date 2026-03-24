import { describe, it, expect } from 'vitest'
import { normalizeUserRole, normalizeUser } from '@/utils/userRole'
import type { User } from '@/types/entities'

describe('normalizeUserRole', () => {
  it('returns "ADMIN" for "ADMIN" input', () => {
    expect(normalizeUserRole('ADMIN')).toBe('ADMIN')
  })

  it('returns "USER" for "USER" input', () => {
    expect(normalizeUserRole('USER')).toBe('USER')
  })

  it('returns "USER" for null', () => {
    expect(normalizeUserRole(null)).toBe('USER')
  })

  it('returns "USER" for undefined', () => {
    expect(normalizeUserRole(undefined)).toBe('USER')
  })

  it('returns "USER" for empty string', () => {
    expect(normalizeUserRole('')).toBe('USER')
  })

  it('returns "USER" for unknown role string', () => {
    expect(normalizeUserRole('MODERATOR')).toBe('USER')
  })

  it('returns "USER" for lowercase "admin"', () => {
    expect(normalizeUserRole('admin')).toBe('USER')
  })
})

describe('normalizeUser', () => {
  const baseUser: User = {
    id: '1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'ADMIN',
    createdAt: '2025-01-01T00:00:00Z',
  }

  it('preserves ADMIN role', () => {
    const result = normalizeUser(baseUser)
    expect(result.role).toBe('ADMIN')
  })

  it('preserves USER role', () => {
    const result = normalizeUser({ ...baseUser, role: 'USER' })
    expect(result.role).toBe('USER')
  })

  it('normalizes unknown role to USER', () => {
    const result = normalizeUser({ ...baseUser, role: 'UNKNOWN' as unknown as User['role'] })
    expect(result.role).toBe('USER')
  })

  it('preserves all other user fields', () => {
    const result = normalizeUser(baseUser)
    expect(result.id).toBe('1')
    expect(result.email).toBe('test@example.com')
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Doe')
    expect(result.createdAt).toBe('2025-01-01T00:00:00Z')
  })

  it('returns a new object (does not mutate input)', () => {
    const result = normalizeUser(baseUser)
    expect(result).not.toBe(baseUser)
    expect(result).toEqual(baseUser)
  })
})
