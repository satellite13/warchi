import { describe, it, expect } from 'vitest'
import { normalizeUserRole, normalizeUser } from '@/utils/userRole'
import type { User } from '@/types/entities'

describe('normalizeUserRole', () => {
  it('returns admin for admin (case-insensitive)', () => {
    expect(normalizeUserRole('admin')).toBe('admin')
    expect(normalizeUserRole('ADMIN')).toBe('admin')
  })

  it('returns architect, editor, reader, viewer for known roles', () => {
    expect(normalizeUserRole('architect')).toBe('architect')
    expect(normalizeUserRole('editor')).toBe('editor')
    expect(normalizeUserRole('reader')).toBe('reader')
    expect(normalizeUserRole('viewer')).toBe('viewer')
  })

  it('maps legacy USER to reader', () => {
    expect(normalizeUserRole('USER')).toBe('reader')
    expect(normalizeUserRole('user')).toBe('reader')
  })

  it('returns viewer for null, undefined, empty, or unknown', () => {
    expect(normalizeUserRole(null)).toBe('viewer')
    expect(normalizeUserRole(undefined)).toBe('viewer')
    expect(normalizeUserRole('')).toBe('viewer')
    expect(normalizeUserRole('MODERATOR')).toBe('viewer')
  })
})

describe('normalizeUser', () => {
  const baseUser: User = {
    id: '1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'admin',
    featureGrants: ['model.create'],
    createdAt: '2025-01-01T00:00:00Z',
  }

  it('preserves admin role', () => {
    const result = normalizeUser(baseUser)
    expect(result.role).toBe('admin')
  })

  it('maps legacy USER role to reader', () => {
    const result = normalizeUser({ ...baseUser, role: 'USER' as unknown as User['role'] })
    expect(result.role).toBe('reader')
  })

  it('normalizes unknown role to viewer', () => {
    const result = normalizeUser({ ...baseUser, role: 'UNKNOWN' as unknown as User['role'] })
    expect(result.role).toBe('viewer')
  })

  it('preserves featureGrants', () => {
    const result = normalizeUser(baseUser)
    expect(result.featureGrants).toEqual(['model.create'])
  })

  it('defaults missing featureGrants to empty array', () => {
    const { featureGrants: _ignored, ...withoutGrants } = baseUser
    const result = normalizeUser(withoutGrants)
    expect(result.featureGrants).toEqual([])
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
  })
})
