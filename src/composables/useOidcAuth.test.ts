import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiPost = vi.fn()
const mockApiGet = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('../api/apiClient', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}))

vi.mock('../utils/userRole', () => ({
  normalizeUser: vi.fn((user: unknown) => user),
}))

const mockSaveStoredUser = vi.fn()
const mockEmitAuthUpdated = vi.fn()

vi.mock('./authStorage', () => ({
  saveStoredUser: (...args: unknown[]) => mockSaveStoredUser(...args),
  emitAuthUpdated: (...args: unknown[]) => mockEmitAuthUpdated(...args),
  emitAuthCleared: vi.fn(),
  clearAuthStorage: vi.fn(),
  loadStoredUser: vi.fn(() => null),
}))

import { useOidcAuth } from './useOidcAuth'

function mockOidcUser() {
  return {
    id: 'u-1',
    email: 'test@example.com',
    role: 'USER',
    firstName: 'Test',
    lastName: 'User',
  }
}

function mockOidcResponse(accessToken = 'at-123', refreshToken = 'rt-456') {
  return {
    accessToken,
    refreshToken,
    user: mockOidcUser(),
  }
}

describe('useOidcAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the module-level oidcLinkStatus ref between tests
    const { oidcLinkStatus, ssoConfig } = useOidcAuth()
    oidcLinkStatus.value = { linked: false }
    ssoConfig.value = { enabled: false, displayName: 'SSO' }
    // Reset location.href to empty string
    Object.defineProperty(globalThis, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    })
  })

  describe('fetchSsoConfig', () => {
    it('stores enabled config and display name', async () => {
      mockApiGet.mockResolvedValue({
        success: true,
        data: { enabled: true, displayName: 'Lemanapro' },
      })

      const { fetchSsoConfig, ssoConfig } = useOidcAuth()
      const result = await fetchSsoConfig()

      expect(mockApiGet).toHaveBeenCalledWith('/auth/sso/config')
      expect(result).toEqual({ enabled: true, displayName: 'Lemanapro' })
      expect(ssoConfig.value).toEqual({ enabled: true, displayName: 'Lemanapro' })
    })

    it('falls back to disabled when request fails', async () => {
      mockApiGet.mockResolvedValue({ success: false, error: { message: 'down' } })

      const { fetchSsoConfig, ssoConfig } = useOidcAuth()
      const result = await fetchSsoConfig()

      expect(result).toEqual({ enabled: false, displayName: 'SSO' })
      expect(ssoConfig.value.enabled).toBe(false)
    })
  })

  describe('ssoLogin', () => {
    it('redirects to SSO authorize URL on success', async () => {
      mockApiGet.mockResolvedValue({
        success: true,
        data: { url: 'https://sso.example.com/authorize' },
      })

      await useOidcAuth().ssoLogin()

      expect(mockApiGet).toHaveBeenCalledWith('/auth/sso/authorize')
      expect(globalThis.location.href).toBe('https://sso.example.com/authorize')
    })

    it('throws error when apiGet fails', async () => {
      mockApiGet.mockResolvedValue({
        success: false,
        error: { status: 500, message: 'Internal Server Error' },
      })

      const { ssoLogin } = useOidcAuth()
      await expect(ssoLogin()).rejects.toThrow('Internal Server Error')
    })

    it('throws error when authorize returns empty URL', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: { url: '' } })

      const { ssoLogin } = useOidcAuth()
      await expect(ssoLogin()).rejects.toThrow('SSO authorize returned empty URL')
    })

    it('throws error when authorize returns no data', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: undefined as never })

      const { ssoLogin } = useOidcAuth()
      await expect(ssoLogin()).rejects.toThrow('SSO authorize returned empty URL')
    })
  })

  describe('processCallback', () => {
    it('returns true and stores auth data on success', async () => {
      const resp = mockOidcResponse()
      mockApiPost.mockResolvedValue({ success: true, data: resp })

      const { processCallback } = useOidcAuth()
      const result = await processCallback('auth-code', 'auth-state')

      expect(result).toBe(true)
      expect(mockApiPost).toHaveBeenCalledWith('/auth/sso/callback', {
        code: 'auth-code',
        state: 'auth-state',
      })
      // Cookies are set by the API; frontend only persists the user profile.
      expect(mockSaveStoredUser).toHaveBeenCalledWith(resp.user)
      expect(mockEmitAuthUpdated).toHaveBeenCalledWith(resp.user)
    })

    it('returns false when apiPost fails', async () => {
      mockApiPost.mockResolvedValue({
        success: false,
        error: { status: 400, message: 'Invalid code' },
      })

      const { processCallback } = useOidcAuth()
      const result = await processCallback('bad-code', 'state')

      expect(result).toBe(false)
      expect(mockSaveStoredUser).not.toHaveBeenCalled()
      expect(mockEmitAuthUpdated).not.toHaveBeenCalled()
    })

    it('returns false when response data is missing', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: null })

      const { processCallback } = useOidcAuth()
      const result = await processCallback('code', 'state')

      expect(result).toBe(false)
    })
  })

  describe('startLinkSso', () => {
    it('redirects to SSO link URL on success', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: { url: 'https://sso.example.com/link' } })

      const { startLinkSso } = useOidcAuth()
      await startLinkSso('user-123')

      expect(mockApiGet).toHaveBeenCalledWith('/auth/sso/authorize?linkUserId=user-123')
      expect(globalThis.location.href).toBe('https://sso.example.com/link')
    })

    it('does not redirect when API fails', async () => {
      mockApiGet.mockResolvedValue({
        success: false,
        error: { status: 500, message: 'Error' },
      })

      const { startLinkSso } = useOidcAuth()
      await startLinkSso('user-456')

      expect(mockApiGet).toHaveBeenCalled()
    })

    it('does not redirect when URL is empty', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: { url: '' } })

      const { startLinkSso } = useOidcAuth()
      await startLinkSso('user-789')

      // The condition is result.data?.url — empty string is falsy, so no redirect
      expect(globalThis.location.href).toBe('')
    })
  })

  describe('processLinkCallback', () => {
    it('returns true and stores auth data on success', async () => {
      const resp = mockOidcResponse('link-at', 'link-rt')
      mockApiPost.mockResolvedValue({ success: true, data: resp })

      const { processLinkCallback } = useOidcAuth()
      const result = await processLinkCallback('link-code', 'link-state')

      expect(result).toBe(true)
      expect(mockApiPost).toHaveBeenCalledWith('/auth/sso/link/callback', {
        code: 'link-code',
        state: 'link-state',
      })
      expect(mockSaveStoredUser).toHaveBeenCalledWith(resp.user)
      expect(mockEmitAuthUpdated).toHaveBeenCalledWith(resp.user)
    })

    it('returns false when apiPost fails', async () => {
      mockApiPost.mockResolvedValue({
        success: false,
        error: { status: 401, message: 'Unauthorized' },
      })

      const { processLinkCallback } = useOidcAuth()
      const result = await processLinkCallback('code', 'state')

      expect(result).toBe(false)
    })

    it('returns false when response data is missing', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: undefined as never })

      const { processLinkCallback } = useOidcAuth()
      const result = await processLinkCallback('code', 'state')

      expect(result).toBe(false)
    })
  })

  describe('unlinkSso', () => {
    it('returns true and updates status on success', async () => {
      mockApiDelete.mockResolvedValue({ success: true, data: { linked: false } })

      const { unlinkSso, oidcLinkStatus } = useOidcAuth()
      const result = await unlinkSso()

      expect(result).toBe(true)
      expect(mockApiDelete).toHaveBeenCalledWith('/auth/sso/unlink')
      expect(oidcLinkStatus.value).toEqual({ linked: false })
    })

    it('returns false when apiDelete fails', async () => {
      mockApiDelete.mockResolvedValue({
        success: false,
        error: { status: 500, message: 'Server error' },
      })

      const { unlinkSso } = useOidcAuth()
      const result = await unlinkSso()

      expect(result).toBe(false)
    })

    it('returns false when response data is missing', async () => {
      mockApiDelete.mockResolvedValue({ success: true, data: null as unknown as void })

      const { unlinkSso } = useOidcAuth()
      const result = await unlinkSso()

      expect(result).toBe(false)
    })
  })

  describe('getLinkStatus', () => {
    it('returns status and updates ref on success', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: { linked: true, oidcSub: 'sub-123' } })

      const { getLinkStatus, oidcLinkStatus } = useOidcAuth()
      const result = await getLinkStatus()

      expect(result).toEqual({ linked: true, oidcSub: 'sub-123' })
      expect(mockApiGet).toHaveBeenCalledWith('/auth/sso/status')
      expect(oidcLinkStatus.value).toEqual({ linked: true, oidcSub: 'sub-123' })
    })

    it('returns current status when apiGet fails', async () => {
      mockApiGet.mockResolvedValue({
        success: false,
        error: { status: 404, message: 'Not found' },
      })

      const { getLinkStatus, oidcLinkStatus } = useOidcAuth()
      // Status was reset in beforeEach
      expect(oidcLinkStatus.value).toEqual({ linked: false })

      const result = await getLinkStatus()
      expect(result).toEqual({ linked: false })
    })

    it('returns current status when data is missing', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: null as never })

      const { getLinkStatus, oidcLinkStatus } = useOidcAuth()
      const result = await getLinkStatus()

      expect(result).toEqual(oidcLinkStatus.value)
    })
  })

  describe('oidcLinkStatus', () => {
    it('starts with linked: false', () => {
      const { oidcLinkStatus } = useOidcAuth()
      expect(oidcLinkStatus.value).toEqual({ linked: false })
    })
  })
})
