import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/api/apiClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/utils/userDisplay', () => ({
  getUserDisplayName: vi.fn(
    (user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined, fallback: string) => {
      if (!user) return fallback
      const parts = [user.firstName, user.lastName].filter(Boolean)
      return parts.length > 0 ? parts.join(' ') : (user.email ?? fallback)
    },
  ),
}))

import {
  getOwnerDisplayNameFromMap,
  normalizeOwnerId,
  resolveOwnerDisplayNames,
  resolveOwnerLabel,
} from '@/utils/resolveOwnerNames'
import { apiGet, apiPost } from '@/api/apiClient'

const mockedApiGet = vi.mocked(apiGet)
const mockedApiPost = vi.mocked(apiPost)

beforeEach(() => {
  vi.clearAllMocks()
  mockedApiPost.mockResolvedValue({ success: false, error: { status: 500, message: 'not available' } })
})

describe('resolveOwnerDisplayNames', () => {
  it('returns existing map when ownerIds is empty', async () => {
    const existing = new Map([['u1', 'Alice']])
    const result = await resolveOwnerDisplayNames([], existing, null, '?')
    expect(result).toEqual(existing)
    expect(mockedApiGet).not.toHaveBeenCalled()
  })

  it('adds current user to result', async () => {
    const currentUser = { id: 'u1', firstName: 'Ivan', lastName: 'Petrov', email: null }
    const result = await resolveOwnerDisplayNames([], new Map(), currentUser, '?')
    expect(result.get('u1')).toBe('Ivan Petrov')
  })

  it('fetches unknown owners from API', async () => {
    mockedApiGet.mockResolvedValueOnce({
      success: true,
      data: { id: 'u2', firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com' },
    })
    const result = await resolveOwnerDisplayNames(['u2'], new Map(), null, '?')
    expect(mockedApiGet).toHaveBeenCalledWith('/users/u2/public')
    expect(result.get('u2')).toBe('Jane Doe')
  })

  it('skips already known owner ids', async () => {
    const existing = new Map([['u1', 'Known User']])
    const result = await resolveOwnerDisplayNames(['u1'], existing, null, '?')
    expect(mockedApiGet).not.toHaveBeenCalled()
    expect(result.get('u1')).toBe('Known User')
  })

  it('skips current user id in API calls', async () => {
    const currentUser = { id: 'u1', firstName: 'Ivan', lastName: null, email: 'ivan@test.com' }
    const result = await resolveOwnerDisplayNames(['u1'], new Map(), currentUser, '?')
    expect(mockedApiGet).not.toHaveBeenCalled()
    expect(mockedApiPost).not.toHaveBeenCalled()
    expect(result.has('u1')).toBe(true)
  })

  it('fetches profile when session user has no display fields', async () => {
    const currentUser = { id: 'u1', firstName: null, lastName: null, email: null }
    mockedApiPost.mockResolvedValueOnce({
      success: true,
      data: {
        items: [{ id: 'u1', firstName: 'Ivan', lastName: 'Petrov', email: 'ivan@test.com' }],
        total: 1,
        page: 0,
        size: 1,
      },
    })
    const result = await resolveOwnerDisplayNames(['u1'], new Map(), currentUser, 'Unknown')
    expect(mockedApiPost).toHaveBeenCalledWith('/users/public/batch', { ids: ['u1'] })
    expect(result.get('u1')).toBe('Ivan Petrov')
  })

  it('uses fallback on API failure', async () => {
    mockedApiGet.mockResolvedValueOnce({
      success: false,
      error: { status: 404, message: 'Not found' },
    })
    const result = await resolveOwnerDisplayNames(['u3'], new Map(), null, 'Unknown')
    expect(result.get('u3')).toBe('Unknown')
  })

  it('deduplicates owner ids', async () => {
    mockedApiGet.mockResolvedValueOnce({
      success: true,
      data: { id: 'u2', firstName: 'A', lastName: 'B', email: null },
    })
    await resolveOwnerDisplayNames(['u2', 'u2', 'u2'], new Map(), null, '?')
    expect(mockedApiPost).toHaveBeenCalledTimes(1)
    expect(mockedApiGet).toHaveBeenCalledTimes(1)
  })

  it('skips empty string ids', async () => {
    const result = await resolveOwnerDisplayNames(['', ''], new Map(), null, '?')
    expect(mockedApiPost).not.toHaveBeenCalled()
    expect(mockedApiGet).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it('uses batch endpoint when available', async () => {
    mockedApiPost.mockResolvedValueOnce({
      success: true,
      data: {
        items: [{ id: 'u2', firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com' }],
        total: 1,
        page: 0,
        size: 1,
      },
    })
    const result = await resolveOwnerDisplayNames(['u2'], new Map(), null, '?')
    expect(mockedApiPost).toHaveBeenCalledWith('/users/public/batch', { ids: ['u2'] })
    expect(mockedApiGet).not.toHaveBeenCalled()
    expect(result.get('u2')).toBe('Jane Doe')
  })

  it('normalizes owner id casing in map keys', async () => {
    mockedApiPost.mockResolvedValueOnce({
      success: true,
      data: {
        items: [
          {
            id: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@test.com',
          },
        ],
        total: 1,
        page: 0,
        size: 1,
      },
    })
    const result = await resolveOwnerDisplayNames(
      ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
      new Map(),
      null,
      '?'
    )
    expect(result.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('Jane Doe')
    expect(
      getOwnerDisplayNameFromMap(
        result,
        'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        '?'
      )
    ).toBe('Jane Doe')
    expect(normalizeOwnerId('  ABC  ')).toBe('abc')
  })

  it('uses ownerDisplayName when public profile is unavailable', () => {
    const result = resolveOwnerLabel(
      new Map(),
      'u1',
      null,
      'Unknown',
      'admin@admin.ru',
      'Иван Петров'
    )
    expect(result).toBe('Иван Петров')
  })

  it('uses ownerEmail when display name is unavailable', () => {
    const result = resolveOwnerLabel(new Map(), 'u1', null, 'Unknown', 'admin@admin.ru')
    expect(result).toBe('admin@admin.ru')
  })

  it('retries owners previously cached as fallback', async () => {
    const existing = new Map([['u2', 'Unknown']])
    mockedApiPost.mockResolvedValueOnce({
      success: true,
      data: {
        items: [{ id: 'u2', firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com' }],
        total: 1,
        page: 0,
        size: 1,
      },
    })

    const result = await resolveOwnerDisplayNames(['u2'], existing, null, 'Unknown')

    expect(mockedApiPost).toHaveBeenCalledWith('/users/public/batch', { ids: ['u2'] })
    expect(result.get('u2')).toBe('Jane Doe')
  })

  it('falls back to individual requests when batch fails', async () => {
    mockedApiPost.mockResolvedValueOnce({
      success: false,
      error: { status: 404, message: 'Not found' },
    })
    mockedApiGet.mockResolvedValueOnce({
      success: true,
      data: { id: 'u2', firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com' },
    })
    const result = await resolveOwnerDisplayNames(['u2'], new Map(), null, '?')
    expect(mockedApiPost).toHaveBeenCalledTimes(1)
    expect(mockedApiGet).toHaveBeenCalledWith('/users/u2/public')
    expect(result.get('u2')).toBe('Jane Doe')
  })
})
