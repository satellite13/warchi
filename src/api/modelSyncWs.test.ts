import { describe, it, expect, vi, beforeEach } from 'vitest'

import { buildModelSyncWsUrl } from './modelSyncWs'

describe('buildModelSyncWsUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('browser environment', () => {
    it('builds ws:// URL for http protocol', () => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        protocol: 'http:',
        host: 'localhost:5173',
      } as Location)

      const url = buildModelSyncWsUrl('my-token')

      expect(url).toBe('ws://localhost:5173/ws?token=my-token')
    })

    it('builds wss:// URL for https protocol', () => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        protocol: 'https:',
        host: 'example.com',
      } as Location)

      const url = buildModelSyncWsUrl('secure-token')

      expect(url).toBe('wss://example.com/ws?token=secure-token')
    })

    it('encodes special characters in token', () => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        protocol: 'https:',
        host: 'app.example.com',
      } as Location)

      const url = buildModelSyncWsUrl('token/with?special&chars=here')

      expect(url).toBe('wss://app.example.com/ws?token=token%2Fwith%3Fspecial%26chars%3Dhere')
    })

    it('encodes Unicode characters in token', () => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        protocol: 'http:',
        host: 'localhost:3000',
      } as Location)

      const url = buildModelSyncWsUrl('тест-токен')

      expect(url).toContain('token=')
      expect(decodeURIComponent(url.split('token=')[1])).toBe('тест-токен')
    })
  })

  describe('server-side rendering', () => {
    it('returns empty string when window is undefined', () => {
      const origWindow = globalThis.window
      vi.spyOn(globalThis, 'window', 'get').mockReturnValue(
        undefined as unknown as (typeof globalThis)['window']
      )

      const url = buildModelSyncWsUrl('some-token')

      expect(url).toBe('')

      vi.spyOn(globalThis, 'window', 'get').mockRestore()
      Object.defineProperty(globalThis, 'window', { value: origWindow, writable: true })
    })
  })

  describe('edge cases', () => {
    it('handles empty token', () => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        protocol: 'http:',
        host: 'localhost:5173',
      } as Location)

      const url = buildModelSyncWsUrl('')

      expect(url).toBe('ws://localhost:5173/ws?token=')
    })

    it('handles token with spaces', () => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        protocol: 'https:',
        host: 'example.com',
      } as Location)

      const url = buildModelSyncWsUrl('my token with spaces')

      expect(url).toBe('wss://example.com/ws?token=my%20token%20with%20spaces')
    })
  })
})
