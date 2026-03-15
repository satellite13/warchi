import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()

vi.mock('@/composables/useApi', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
}))

vi.mock('@/composables/authStorage', () => ({
  loadStoredUser: vi.fn(() => null),
  saveStoredUser: vi.fn(),
  setAccessToken: vi.fn(),
  setRefreshToken: vi.fn(),
  clearAuthStorage: vi.fn(),
  emitAuthUpdated: vi.fn(),
  emitAuthCleared: vi.fn(),
  AUTH_UPDATED_EVENT: 'warchi-auth-updated',
  AUTH_CLEARED_EVENT: 'warchi-auth-cleared',
}))

vi.mock('@/utils/userRole', () => ({
  normalizeUser: vi.fn((user: unknown) => user),
}))

import { useAuth } from './useAuth'
import {
  clearAuthStorage,
  emitAuthCleared,
  emitAuthUpdated,
  saveStoredUser,
  setAccessToken,
  setRefreshToken,
} from '@/composables/authStorage'

const fakeUser = {
  id: 'u1',
  email: 'test@example.com',
  role: 'USER' as const,
  firstName: 'John',
  lastName: 'Doe',
}

const fakeAuthResponse = {
  accessToken: 'acc-token',
  refreshToken: 'ref-token',
  user: fakeUser,
}

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset currentUser state by calling logout
    const { logout } = useAuth()
    logout()
    vi.clearAllMocks()
  })

  describe('login', () => {
    it('calls apiPost with /auth/login and credentials', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: fakeAuthResponse })

      const { login } = useAuth()
      await login('test@example.com', 'password123')

      expect(mockApiPost).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      })
    })

    it('returns { success: true } on successful login', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: fakeAuthResponse })

      const { login } = useAuth()
      const result = await login('test@example.com', 'password123')

      expect(result).toEqual({ success: true })
    })

    it('stores tokens and user on successful login', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: fakeAuthResponse })

      const { login } = useAuth()
      await login('test@example.com', 'password123')

      expect(setAccessToken).toHaveBeenCalledWith('acc-token')
      expect(setRefreshToken).toHaveBeenCalledWith('ref-token')
      expect(saveStoredUser).toHaveBeenCalledWith(fakeUser)
      expect(emitAuthUpdated).toHaveBeenCalledWith(fakeUser)
    })

    it('returns { success: false, error } on failed login', async () => {
      mockApiPost.mockResolvedValue({
        success: false,
        error: { status: 401, message: 'Invalid credentials' },
      })

      const { login } = useAuth()
      const result = await login('test@example.com', 'wrong')

      expect(result).toEqual({ success: false, error: 'Invalid credentials' })
    })
  })

  describe('register', () => {
    it('calls apiPost with /auth/register and profile data', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: fakeAuthResponse })

      const { register } = useAuth()
      await register('test@example.com', 'pass', {
        firstName: 'John',
        lastName: 'Doe',
      })

      expect(mockApiPost).toHaveBeenCalledWith('/auth/register', {
        email: 'test@example.com',
        password: 'pass',
        firstName: 'John',
        lastName: 'Doe',
      })
    })

    it('returns { success: true } on successful registration', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: fakeAuthResponse })

      const { register } = useAuth()
      const result = await register('test@example.com', 'pass', {
        firstName: 'John',
        lastName: 'Doe',
      })

      expect(result).toEqual({ success: true })
    })
  })

  describe('registerAdmin', () => {
    it('includes adminSecret in the request body', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: fakeAuthResponse })

      const { registerAdmin } = useAuth()
      await registerAdmin('admin@example.com', 'pass', 'secret123', {
        firstName: 'Admin',
        lastName: 'User',
      })

      expect(mockApiPost).toHaveBeenCalledWith('/auth/register-admin', {
        email: 'admin@example.com',
        password: 'pass',
        firstName: 'Admin',
        lastName: 'User',
        adminSecret: 'secret123',
      })
    })
  })

  describe('logout', () => {
    it('clears tokens, user, and emits cleared event', async () => {
      // Login first to set user
      mockApiPost.mockResolvedValue({ success: true, data: fakeAuthResponse })
      const { login, logout, currentUser } = useAuth()
      await login('test@example.com', 'pass')
      vi.clearAllMocks()

      logout()

      expect(clearAuthStorage).toHaveBeenCalled()
      expect(emitAuthCleared).toHaveBeenCalled()
      expect(currentUser.value).toBeNull()
    })
  })

  describe('loadCurrentUser', () => {
    it('fetches /auth/me and sets currentUser', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: fakeUser })

      const { loadCurrentUser, currentUser } = useAuth()
      await loadCurrentUser()

      expect(mockApiGet).toHaveBeenCalledWith('/auth/me')
      expect(currentUser.value).toEqual(fakeUser)
      expect(saveStoredUser).toHaveBeenCalledWith(fakeUser)
    })

    it('does nothing on failed request', async () => {
      mockApiGet.mockResolvedValue({
        success: false,
        error: { status: 401, message: 'Unauthorized' },
      })

      const { loadCurrentUser, currentUser } = useAuth()
      await loadCurrentUser()

      expect(currentUser.value).toBeNull()
    })
  })

  describe('isAuthenticated', () => {
    it('is false when no user is logged in', () => {
      const { isAuthenticated } = useAuth()
      expect(isAuthenticated.value).toBe(false)
    })

    it('is true after successful login', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: fakeAuthResponse })

      const { login, isAuthenticated } = useAuth()
      await login('test@example.com', 'pass')

      expect(isAuthenticated.value).toBe(true)
    })
  })

  describe('isAdmin', () => {
    it('is false for regular user', async () => {
      mockApiPost.mockResolvedValue({ success: true, data: fakeAuthResponse })

      const { login, isAdmin } = useAuth()
      await login('test@example.com', 'pass')

      expect(isAdmin.value).toBe(false)
    })

    it('is true for admin user', async () => {
      const adminResponse = {
        ...fakeAuthResponse,
        user: { ...fakeUser, role: 'ADMIN' as const },
      }
      mockApiPost.mockResolvedValue({ success: true, data: adminResponse })

      const { login, isAdmin } = useAuth()
      await login('admin@example.com', 'pass')

      expect(isAdmin.value).toBe(true)
    })
  })

  describe('updateMyProfile', () => {
    it('sends PUT to /users/me/profile', async () => {
      mockApiPut.mockResolvedValue({ success: true, data: fakeUser })

      const { updateMyProfile } = useAuth()
      await updateMyProfile({ firstName: 'Jane' })

      expect(mockApiPut).toHaveBeenCalledWith('/users/me/profile', { firstName: 'Jane' })
    })

    it('returns { success: true } and updates currentUser on success', async () => {
      const updatedUser = { ...fakeUser, firstName: 'Jane' }
      mockApiPut.mockResolvedValue({ success: true, data: updatedUser })

      const { updateMyProfile, currentUser } = useAuth()
      const result = await updateMyProfile({ firstName: 'Jane' })

      expect(result).toEqual({ success: true })
      expect(currentUser.value).toEqual(updatedUser)
      expect(saveStoredUser).toHaveBeenCalledWith(updatedUser)
      expect(emitAuthUpdated).toHaveBeenCalledWith(updatedUser)
    })

    it('returns { success: false, error } on failure', async () => {
      mockApiPut.mockResolvedValue({
        success: false,
        error: { status: 400, message: 'Validation error' },
      })

      const { updateMyProfile } = useAuth()
      const result = await updateMyProfile({ firstName: '' })

      expect(result).toEqual({ success: false, error: 'Validation error' })
    })
  })
})
