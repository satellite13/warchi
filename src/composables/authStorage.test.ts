import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('authStorage', () => {
  const store = new Map<string, string>()

  const mockLocalStorage = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => store.clear()),
    get length() {
      return store.size
    },
    key: vi.fn(() => null),
  }

  beforeEach(() => {
    store.clear()
    mockLocalStorage.getItem.mockImplementation((key: string) => store.get(key) ?? null)
    mockLocalStorage.setItem.mockImplementation((key: string, value: string) => {
      store.set(key, value)
    })
    mockLocalStorage.removeItem.mockImplementation((key: string) => {
      store.delete(key)
    })
    vi.stubGlobal('window', {
      localStorage: mockLocalStorage,
      dispatchEvent: vi.fn(),
      CustomEvent: globalThis.CustomEvent ?? class CustomEvent extends Event {
        detail: unknown
        constructor(type: string, init?: { detail?: unknown }) {
          super(type)
          this.detail = init?.detail
        }
      },
      Event: globalThis.Event,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function loadModule() {
    return await import('./authStorage')
  }

  describe('loadStoredUser / saveStoredUser', () => {
    it('saves and loads a user', async () => {
      const { loadStoredUser, saveStoredUser } = await loadModule()
      const user = { id: 'u1', email: 'test@test.com', role: 'USER' as const }

      saveStoredUser(user)
      const loaded = loadStoredUser()

      expect(loaded).toEqual(user)
    })

    it('returns null when no user stored', async () => {
      const { loadStoredUser } = await loadModule()
      expect(loadStoredUser()).toBeNull()
    })

    it('clears user when saving null', async () => {
      const { loadStoredUser, saveStoredUser } = await loadModule()
      const user = { id: 'u1', email: 'test@test.com' }

      saveStoredUser(user)
      expect(loadStoredUser()).toBeTruthy()

      saveStoredUser(null)
      expect(loadStoredUser()).toBeNull()
    })

    it('returns null for invalid JSON in storage', async () => {
      store.set('warchi_user', '{invalid')
      const { loadStoredUser } = await loadModule()
      expect(loadStoredUser()).toBeNull()
    })
  })

  describe('clearAuthStorage', () => {
    it('clears stored user', async () => {
      const { clearAuthStorage, saveStoredUser, loadStoredUser } = await loadModule()

      saveStoredUser({ id: 'u1', email: 'a@b.com' })
      clearAuthStorage()

      expect(loadStoredUser()).toBeNull()
    })
  })

  describe('emitAuthUpdated', () => {
    it('dispatches custom event with user detail', async () => {
      const { emitAuthUpdated, AUTH_UPDATED_EVENT } = await loadModule()
      const user = { id: 'u1', email: 'test@test.com' }

      emitAuthUpdated(user)

      expect(window.dispatchEvent).toHaveBeenCalled()
      const call = vi.mocked(window.dispatchEvent).mock.calls[0]
      const event = call[0] as CustomEvent
      expect(event.type).toBe(AUTH_UPDATED_EVENT)
      expect(event.detail).toEqual(user)
    })
  })

  describe('emitAuthCleared', () => {
    it('dispatches cleared event', async () => {
      const { emitAuthCleared, AUTH_CLEARED_EVENT } = await loadModule()

      emitAuthCleared()

      expect(window.dispatchEvent).toHaveBeenCalled()
      const call = vi.mocked(window.dispatchEvent).mock.calls[0]
      expect(call[0].type).toBe(AUTH_CLEARED_EVENT)
    })
  })

  describe('exported constants', () => {
    it('exports AUTH_UPDATED_EVENT', async () => {
      const { AUTH_UPDATED_EVENT } = await loadModule()
      expect(typeof AUTH_UPDATED_EVENT).toBe('string')
      expect(AUTH_UPDATED_EVENT).toBe('warchi-auth-updated')
    })

    it('exports AUTH_CLEARED_EVENT', async () => {
      const { AUTH_CLEARED_EVENT } = await loadModule()
      expect(typeof AUTH_CLEARED_EVENT).toBe('string')
      expect(AUTH_CLEARED_EVENT).toBe('warchi-auth-cleared')
    })
  })
})
