import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/composables/authStorage', () => ({
  saveStoredUser: vi.fn(),
  clearAuthStorage: vi.fn(),
  emitAuthUpdated: vi.fn(),
  emitAuthCleared: vi.fn(),
}))

vi.mock('@/api/config', () => ({
  buildApiUrl: vi.fn((path: string) => `http://test-api/api/v1${path}`),
}))

vi.mock('@/utils/userRole', () => ({
  normalizeUser: vi.fn((user: unknown) => user),
}))

vi.mock('@/utils/csrfCookie', () => ({
  getCsrfTokenFromCookie: vi.fn(() => 'csrf-test-token'),
  CSRF_HEADER_NAME: 'X-CSRF-Token',
}))

import { apiGet, apiPost, apiPut, apiDelete } from './apiClient'
import { clearAuthStorage, emitAuthCleared } from '@/composables/authStorage'
import { getCsrfTokenFromCookie } from '@/utils/csrfCookie'

function mockFetchResponse(body: unknown, status = 200) {
  const text = body === undefined ? '' : JSON.stringify(body)
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  })
}

describe('apiClient', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('apiGet', () => {
    it('makes GET request with credentials include', async () => {
      const fetchMock = mockFetchResponse({ id: 1 })
      vi.stubGlobal('fetch', fetchMock)

      await apiGet('/models')

      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-api/api/v1/models',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        }),
      )
    })
  })

  describe('apiPost', () => {
    it('makes POST request with JSON body and Content-Type header', async () => {
      const fetchMock = mockFetchResponse({ id: 1 })
      vi.stubGlobal('fetch', fetchMock)

      await apiPost('/models', { name: 'test' })

      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-api/api/v1/models',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ name: 'test' }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'csrf-test-token',
          }),
        }),
      )
    })
  })

  describe('apiPut', () => {
    it('makes PUT request with JSON body', async () => {
      const fetchMock = mockFetchResponse({ id: 1 })
      vi.stubGlobal('fetch', fetchMock)

      await apiPut('/models/1', { name: 'updated' })

      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-api/api/v1/models/1',
        expect.objectContaining({
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ name: 'updated' }),
        }),
      )
    })
  })

  describe('apiDelete', () => {
    it('makes DELETE request', async () => {
      const fetchMock = mockFetchResponse(undefined, 204)
      vi.stubGlobal('fetch', fetchMock)

      await apiDelete('/models/1')

      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-api/api/v1/models/1',
        expect.objectContaining({
          method: 'DELETE',
          credentials: 'include',
        }),
      )
    })
  })

  describe('successful responses', () => {
    it('returns { success: true, data } for 200 with JSON body', async () => {
      vi.stubGlobal('fetch', mockFetchResponse({ id: 1, name: 'test' }))

      const result = await apiGet<{ id: number; name: string }>('/models/1')

      expect(result).toEqual({
        success: true,
        data: { id: 1, name: 'test' },
      })
    })

    it('returns undefined data for 204 No Content', async () => {
      vi.stubGlobal('fetch', mockFetchResponse(undefined, 204))

      const result = await apiDelete('/models/1')

      expect(result).toEqual({
        success: true,
        data: undefined,
      })
    })
  })

  describe('error responses', () => {
    it('returns { success: false, error } for non-OK responses', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ message: 'Not found' })),
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await apiGet('/models/1')

      expect(result).toEqual({
        success: false,
        error: { status: 404, message: 'Not found', details: { message: 'Not found' } },
      })
    })

    it('returns status 0 for network errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))

      const result = await apiGet('/models')

      expect(result).toEqual({
        success: false,
        error: { status: 0, message: 'Network failure' },
      })
    })

    it('returns generic connection error for non-Error throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue('unknown'))

      const result = await apiGet('/models')

      expect(result).toEqual({
        success: false,
        error: { status: 0, message: 'Ошибка подключения' },
      })
    })
  })

  describe('401 token refresh', () => {
    it('triggers token refresh on 401 for non-public paths', async () => {
      const refreshResponse = {
        user: { id: '1', email: 'test@test.com', role: 'USER' },
      }

      let callCount = 0
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            text: () => Promise.resolve(JSON.stringify({ message: 'Unauthorized' })),
          })
        }
        if (callCount === 2) {
          expect(url).toBe('http://test-api/api/v1/auth/refresh')
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(refreshResponse)),
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ data: 'ok' })),
        })
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await apiGet('/models')

      expect(result).toEqual({ success: true, data: { data: 'ok' } })
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('skips refresh for public auth paths (/auth/login)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ message: 'Bad credentials' })),
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await apiPost('/auth/login', { email: 'a', password: 'b' })

      expect(result.success).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('failed refresh clears session', async () => {
      let callCount = 0
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        callCount++
        if (url.includes('/auth/refresh')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            text: () => Promise.resolve(''),
          })
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve(JSON.stringify({ message: 'Unauthorized' })),
        })
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await apiGet('/models')

      expect(result.success).toBe(false)
      expect(callCount).toBe(2)
      expect(clearAuthStorage).toHaveBeenCalled()
      expect(emitAuthCleared).toHaveBeenCalled()
    })

    it('does not clear session when refresh fails because of a network error', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/auth/refresh')) {
          return Promise.reject(new Error('Network failure'))
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve(JSON.stringify({ message: 'Unauthorized' })),
        })
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await apiGet('/models')

      expect(result.success).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(clearAuthStorage).not.toHaveBeenCalled()
      expect(emitAuthCleared).not.toHaveBeenCalled()
    })
  })

  describe('CSRF protection', () => {
    it('fails mutating protected requests before fetch when CSRF cookie is missing', async () => {
      vi.mocked(getCsrfTokenFromCookie).mockReturnValueOnce(null)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const result = await apiPost('/models', { name: 'test' })

      expect(result).toEqual({
        success: false,
        error: { status: 419, message: 'CSRF token is missing.' },
      })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('does not require CSRF for public auth requests', async () => {
      vi.mocked(getCsrfTokenFromCookie).mockReturnValueOnce(null)
      const fetchMock = mockFetchResponse({ user: { id: 'u1' } })
      vi.stubGlobal('fetch', fetchMock)

      await apiPost('/auth/login', { email: 'a', password: 'b' })

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})
