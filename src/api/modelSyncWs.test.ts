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

      expect(buildModelSyncWsUrl()).toBe('ws://localhost:5173/ws')
    })

    it('builds wss:// URL for https protocol', () => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        protocol: 'https:',
        host: 'example.com',
      } as Location)

      expect(buildModelSyncWsUrl()).toBe('wss://example.com/ws')
    })
  })

  describe('non-browser environment', () => {
    it('returns empty string when window is undefined', () => {
      const originalWindow = globalThis.window
      // @ts-expect-error intentional for SSR branch
      delete globalThis.window

      expect(buildModelSyncWsUrl()).toBe('')

      globalThis.window = originalWindow
    })
  })
})
