import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'ru' } }),
}))

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('./useApi', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPut: vi.fn(),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}))

const mockGetUserDisplayName = vi.fn((user: unknown, fallback?: string) => {
  if (!user) return fallback ?? '?'
  const u = user as { firstName?: string; lastName?: string; email?: string }
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || (u.email ?? fallback ?? '?')
})

vi.mock('../utils/userDisplay', () => ({
  getUserDisplayName: (user: unknown, fallback?: string) => mockGetUserDisplayName(user, fallback),
}))

import { useAccessShares } from './useAccessShares'
import type { AccessShareResponse, ShareResourceType, SharePermission } from '../types/api'

function makeShare(overrides: Partial<AccessShareResponse> = {}): AccessShareResponse {
  return {
    id: 'share-1',
    resourceType: 'MODEL' as ShareResourceType,
    resourceId: 'model-1',
    granteeUserId: 'user-grantee',
    grantedByUserId: 'user-grantor',
    permission: 'VIEW' as SharePermission,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

describe('useAccessShares', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserDisplayName.mockImplementation((user: unknown, fallback?: string) => {
      if (!user) return fallback ?? '?'
      const u = user as { firstName?: string; lastName?: string; email?: string }
      return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || (u.email ?? fallback ?? '?')
    })
  })

  describe('initial state', () => {
    it('starts with empty shares, no loading, no error', () => {
      const state = useAccessShares()
      expect(state.shares.value).toEqual([])
      expect(state.isLoading.value).toBe(false)
      expect(state.isSubmitting.value).toBe(false)
      expect(state.errorMessage.value).toBeNull()
    })
  })

  describe('loadShares', () => {
    it('sets isLoading during request', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: [] })

      const { loadShares, isLoading } = useAccessShares()
      loadShares('MODEL', 'model-1')

      expect(isLoading.value).toBe(true)
    })

    it('populates shares on success', async () => {
      const share = makeShare()
      mockApiGet.mockResolvedValueOnce({ success: true, data: [share] })
      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: { firstName: 'Grantee', lastName: 'User', email: 'g@test.com' },
      })
      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: { firstName: 'Grantor', lastName: 'User', email: 'gr@test.com' },
      })

      const { loadShares, shares, isLoading, errorMessage } = useAccessShares()
      await loadShares('MODEL', 'model-1')

      expect(mockApiGet).toHaveBeenCalledWith('/access/shares/MODEL/model-1')
      expect(shares.value).toHaveLength(1)
      expect(shares.value[0].granteeDisplayName).toBe('Grantee User')
      expect(shares.value[0].grantedByDisplayName).toBe('Grantor User')
      expect(shares.value[0].permissionLabel).toBe('share.viewOnly')
      expect(isLoading.value).toBe(false)
      expect(errorMessage.value).toBeNull()
    })

    it('maps EDIT permission to correct label', async () => {
      const share = makeShare({ permission: 'EDIT' })
      mockApiGet.mockResolvedValueOnce({ success: true, data: [share] })
      mockApiGet.mockResolvedValueOnce({ success: true, data: { firstName: 'A', lastName: '' } })
      mockApiGet.mockResolvedValueOnce({ success: true, data: { firstName: 'B', lastName: '' } })

      const { loadShares, shares } = useAccessShares()
      await loadShares('NOTATION', 'notation-1')

      expect(shares.value[0].permissionLabel).toBe('share.edit')
    })

    it('sets error and clears shares on API failure', async () => {
      mockApiGet.mockResolvedValue({ success: false, error: { message: 'Server error' } })

      const { loadShares, shares, isLoading, errorMessage } = useAccessShares()
      await loadShares('MODEL', 'model-1')

      expect(errorMessage.value).toBe('Server error')
      expect(shares.value).toEqual([])
      expect(isLoading.value).toBe(false)
    })

    it('handles empty response data', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: null })

      const { loadShares, shares } = useAccessShares()
      await loadShares('MODEL', 'model-1')

      expect(shares.value).toEqual([])
    })

    it('handles non-array response as empty', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: 'not-array' as unknown })

      const { loadShares, shares } = useAccessShares()
      await loadShares('MODEL', 'model-1')

      expect(shares.value).toEqual([])
    })

    it('uses fallback error message for unexpected errors', async () => {
      mockApiGet.mockRejectedValue('string error')

      const { loadShares, errorMessage } = useAccessShares()
      await loadShares('MODEL', 'model-1')

      expect(errorMessage.value).toBe('share.loadSharesError')
    })

    it('encodes resourceId in URL', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: [] })

      const { loadShares } = useAccessShares()
      await loadShares('MODEL', 'model/with space')

      expect(mockApiGet).toHaveBeenCalledWith('/access/shares/MODEL/model%2Fwith%20space')
    })
  })

  describe('grantShare', () => {
    it('calls apiPost and reloads shares on success', async () => {
      const payload = {
        resourceType: 'MODEL' as ShareResourceType,
        resourceId: 'model-1',
        granteeUserId: 'user-2',
        permission: 'EDIT' as SharePermission,
      }
      mockApiPost.mockResolvedValueOnce({ success: true, data: makeShare() })
      mockApiGet.mockResolvedValue({ success: true, data: [] })

      const { grantShare, isSubmitting, errorMessage } = useAccessShares()
      const result = await grantShare(payload)

      expect(result).toBe(true)
      expect(mockApiPost).toHaveBeenCalledWith('/access/shares', payload)
      expect(isSubmitting.value).toBe(false)
      expect(errorMessage.value).toBeNull()
    })

    it('returns false and sets error on API failure', async () => {
      const payload = {
        resourceType: 'MODEL' as ShareResourceType,
        resourceId: 'model-1',
        granteeUserId: 'user-2',
        permission: 'VIEW' as SharePermission,
      }
      mockApiPost.mockResolvedValue({ success: false, error: { message: 'Duplicate' } })

      const { grantShare, isSubmitting, errorMessage } = useAccessShares()
      const result = await grantShare(payload)

      expect(result).toBe(false)
      expect(errorMessage.value).toBe('Duplicate')
      expect(isSubmitting.value).toBe(false)
    })

    it('returns false for unexpected errors', async () => {
      const payload = {
        resourceType: 'MODEL' as ShareResourceType,
        resourceId: 'model-1',
        granteeUserId: 'user-2',
        permission: 'VIEW' as SharePermission,
      }
      mockApiPost.mockRejectedValue(new Error('Network'))

      const { grantShare, errorMessage } = useAccessShares()
      const result = await grantShare(payload)

      expect(result).toBe(false)
      expect(errorMessage.value).toBe('Network')
    })

    it('sets isSubmitting during request', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: makeShare() })
      mockApiGet.mockResolvedValue({ success: true, data: [] })

      const { grantShare, isSubmitting } = useAccessShares()
      const promise = grantShare({
        resourceType: 'MODEL',
        resourceId: 'model-1',
        granteeUserId: 'u',
        permission: 'VIEW',
      })
      expect(isSubmitting.value).toBe(true)
      await promise
      expect(isSubmitting.value).toBe(false)
    })
  })

  describe('revokeShare', () => {
    it('calls apiDelete and reloads shares on success', async () => {
      mockApiDelete.mockResolvedValueOnce({ success: true, data: undefined })
      mockApiGet.mockResolvedValue({ success: true, data: [] })

      const { revokeShare, isSubmitting, errorMessage } = useAccessShares()
      const result = await revokeShare('MODEL', 'model-1', 'share-1')

      expect(result).toBe(true)
      expect(mockApiDelete).toHaveBeenCalledWith('/access/shares/share-1')
      expect(isSubmitting.value).toBe(false)
      expect(errorMessage.value).toBeNull()
    })

    it('returns false and sets error on failure', async () => {
      mockApiDelete.mockResolvedValue({ success: false, error: { message: 'Not found' } })

      const { revokeShare, errorMessage } = useAccessShares()
      const result = await revokeShare('MODEL', 'model-1', 'share-1')

      expect(result).toBe(false)
      expect(errorMessage.value).toBe('Not found')
    })

    it('returns false for unexpected errors', async () => {
      mockApiDelete.mockRejectedValue('unknown')

      const { revokeShare, errorMessage } = useAccessShares()
      const result = await revokeShare('MODEL', 'model-1', 'share-1')

      expect(result).toBe(false)
      expect(errorMessage.value).toBe('share.revokeShareError')
    })

    it('sets isSubmitting during request', async () => {
      mockApiDelete.mockResolvedValue({ success: true, data: undefined })
      mockApiGet.mockResolvedValue({ success: true, data: [] })

      const { revokeShare, isSubmitting } = useAccessShares()
      const promise = revokeShare('MODEL', 'm-1', 's-1')
      expect(isSubmitting.value).toBe(true)
      await promise
      expect(isSubmitting.value).toBe(false)
    })
  })

  describe('resolveUserName (internal, exercised via loadShares)', () => {
    it('caches user name resolution across sequential loadShares calls', async () => {
      const shares = [
        makeShare({ granteeUserId: 'user-x', grantedByUserId: 'user-y' }),
        makeShare({ granteeUserId: 'user-x', grantedByUserId: 'user-z' }),
      ]

      // First call: user-x, user-y, user-z each resolved via API
      mockApiGet.mockResolvedValueOnce({ success: true, data: shares })
      mockApiGet.mockResolvedValueOnce({ success: true, data: { firstName: 'X', lastName: '' } })
      mockApiGet.mockResolvedValueOnce({ success: true, data: { firstName: 'Y', lastName: '' } })
      // Second user-x fires in Promise.all before cache is set from first
      mockApiGet.mockResolvedValueOnce({ success: true, data: { firstName: 'X', lastName: '' } })
      mockApiGet.mockResolvedValueOnce({ success: true, data: { firstName: 'Z', lastName: '' } })

      const { loadShares } = useAccessShares()
      await loadShares('MODEL', 'model-1')

      // 1 load + 4 user lookups (user-x fires twice in parallel before cache set)
      expect(mockApiGet).toHaveBeenCalledTimes(5)

      // Second call: cache should now be populated for all three users
      mockApiGet.mockResolvedValueOnce({ success: true, data: shares })
      // No more user API calls needed — all cached
      await loadShares('MODEL', 'model-1')

      // 5 (first) + 1 (second load) = 6; cache prevented user lookups
      expect(mockApiGet).toHaveBeenCalledTimes(6)
    })

    it('resolves null granteeUserId to allUsers', async () => {
      const share = makeShare({ granteeUserId: null })
      mockApiGet.mockResolvedValueOnce({ success: true, data: [share] })
      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: { firstName: 'Grantor', lastName: '' },
      })

      const { loadShares, shares } = useAccessShares()
      await loadShares('MODEL', 'model-1')

      expect(shares.value[0].granteeDisplayName).toBe('share.allUsers')
    })

    it('uses unknownUser fallback when user API fails', async () => {
      const share = makeShare({ granteeUserId: 'user-fail' })
      mockApiGet.mockResolvedValueOnce({ success: true, data: [share] })
      mockApiGet.mockResolvedValueOnce({ success: false, error: { message: 'err' } })
      mockApiGet.mockResolvedValueOnce({ success: true, data: { firstName: 'G', lastName: '' } })

      const { loadShares, shares } = useAccessShares()
      await loadShares('MODEL', 'model-1')

      expect(shares.value[0].granteeDisplayName).toBe('common.unknownUser')
    })

    it('clears shares when user lookup throws (propagates through Promise.all)', async () => {
      const shares = [makeShare({ granteeUserId: 'user-throw', grantedByUserId: 'u1' })]
      mockApiGet.mockResolvedValueOnce({ success: true, data: shares })
      mockApiGet.mockRejectedValueOnce(new Error('Network'))

      const { loadShares, shares: sharesRef, errorMessage } = useAccessShares()
      await loadShares('MODEL', 'model-1')

      // Promise.all rejects -> catch in loadShares sets empty shares
      expect(sharesRef.value).toEqual([])
      expect(errorMessage.value).toBe('Network')
    })

    it('caches failed user result when API returns success:false', async () => {
      const shares = [makeShare({ granteeUserId: 'user-fail', grantedByUserId: 'user-ok' })]
      mockApiGet.mockResolvedValueOnce({ success: true, data: shares })
      mockApiGet.mockResolvedValueOnce({ success: false, error: { message: 'err' } })
      mockApiGet.mockResolvedValueOnce({ success: true, data: { firstName: 'Ok', lastName: '' } })

      const { loadShares, shares: sharesRef } = useAccessShares()
      await loadShares('MODEL', 'model-1')

      expect(sharesRef.value[0].granteeDisplayName).toBe('common.unknownUser')
      expect(sharesRef.value[0].grantedByDisplayName).toBe('Ok')

      // Second call: user-fail cached, should not make another API call for it
      mockApiGet.mockResolvedValueOnce({ success: true, data: shares })
      await loadShares('MODEL', 'model-1')

      // Only 1 additional call (load shares) — user-fail and user-ok both cached
      expect(mockApiGet).toHaveBeenCalledTimes(4)
    })
  })
})
