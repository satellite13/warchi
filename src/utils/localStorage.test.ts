import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('localStorage utils', () => {
  const store = new Map<string, string>()

  const mockLocalStorage = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value) }),
    removeItem: vi.fn((key: string) => { store.delete(key) }),
    clear: vi.fn(() => store.clear()),
    get length() { return store.size },
    key: vi.fn(() => null),
  }

  beforeEach(() => {
    store.clear()
    mockLocalStorage.getItem.mockImplementation((key: string) => store.get(key) ?? null)
    mockLocalStorage.setItem.mockImplementation((key: string, value: string) => { store.set(key, value) })
    vi.stubGlobal('window', { localStorage: mockLocalStorage })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function loadUtils() {
    const mod = await import('@/utils/localStorage')
    return mod
  }

  describe('loadJson / saveJson', () => {
    it('stores and retrieves an object', async () => {
      const { loadJson, saveJson } = await loadUtils()
      const data = { foo: 'bar', num: 42 }
      saveJson('obj', data)
      expect(loadJson('obj')).toEqual(data)
    })

    it('stores and retrieves an array', async () => {
      const { loadJson, saveJson } = await loadUtils()
      const data = [1, 2, 3]
      saveJson('arr', data)
      expect(loadJson('arr')).toEqual(data)
    })

    it('returns null for missing key', async () => {
      const { loadJson } = await loadUtils()
      expect(loadJson('missing')).toBeNull()
    })

    it('returns null for invalid JSON', async () => {
      const { loadJson } = await loadUtils()
      store.set('bad', '{not-json')
      expect(loadJson('bad')).toBeNull()
    })

    it('returns null for non-object JSON (string)', async () => {
      const { loadJson } = await loadUtils()
      store.set('str', JSON.stringify('hello'))
      expect(loadJson('str')).toBeNull()
    })

    it('returns null for non-object JSON (number)', async () => {
      const { loadJson } = await loadUtils()
      store.set('num', JSON.stringify(42))
      expect(loadJson('num')).toBeNull()
    })

    it('returns null for JSON null', async () => {
      const { loadJson } = await loadUtils()
      store.set('nil', JSON.stringify(null))
      expect(loadJson('nil')).toBeNull()
    })

    it('silently ignores setItem errors', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })
      const { saveJson } = await loadUtils()
      expect(() => saveJson('key', { a: 1 })).not.toThrow()
    })
  })

  describe('loadString / saveString', () => {
    it('stores and retrieves a string', async () => {
      const { loadString, saveString } = await loadUtils()
      saveString('key', 'hello')
      expect(loadString('key')).toBe('hello')
    })

    it('returns empty string as default fallback for missing key', async () => {
      const { loadString } = await loadUtils()
      expect(loadString('missing')).toBe('')
    })

    it('returns custom fallback for missing key', async () => {
      const { loadString } = await loadUtils()
      expect(loadString('missing', 'default')).toBe('default')
    })

    it('returns stored empty string (not fallback)', async () => {
      const { loadString, saveString } = await loadUtils()
      saveString('empty', '')
      expect(loadString('empty', 'fallback')).toBe('')
    })

    it('silently ignores setItem errors', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })
      const { saveString } = await loadUtils()
      expect(() => saveString('key', 'val')).not.toThrow()
    })
  })

  describe('loadNumber / saveNumber', () => {
    it('stores and retrieves an integer', async () => {
      const { loadNumber, saveNumber } = await loadUtils()
      saveNumber('int', 42)
      expect(loadNumber('int', 0)).toBe(42)
    })

    it('stores and retrieves a float', async () => {
      const { loadNumber, saveNumber } = await loadUtils()
      saveNumber('float', 3.14)
      expect(loadNumber('float', 0)).toBe(3.14)
    })

    it('stores and retrieves a negative number', async () => {
      const { loadNumber, saveNumber } = await loadUtils()
      saveNumber('neg', -10)
      expect(loadNumber('neg', 0)).toBe(-10)
    })

    it('stores and retrieves zero', async () => {
      const { loadNumber, saveNumber } = await loadUtils()
      saveNumber('zero', 0)
      expect(loadNumber('zero', 99)).toBe(0)
    })

    it('returns fallback for missing key', async () => {
      const { loadNumber } = await loadUtils()
      expect(loadNumber('missing', 7)).toBe(7)
    })

    it('returns fallback for NaN value', async () => {
      const { loadNumber } = await loadUtils()
      store.set('nan', 'not-a-number')
      expect(loadNumber('nan', 5)).toBe(5)
    })

    it('returns fallback for Infinity', async () => {
      const { loadNumber } = await loadUtils()
      store.set('inf', 'Infinity')
      expect(loadNumber('inf', 5)).toBe(5)
    })

    it('returns 0 for empty string (Number("") === 0, which is finite)', async () => {
      const { loadNumber } = await loadUtils()
      store.set('empty', '')
      expect(loadNumber('empty', 5)).toBe(0)
    })

    it('silently ignores setItem errors', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })
      const { saveNumber } = await loadUtils()
      expect(() => saveNumber('key', 42)).not.toThrow()
    })
  })
})
