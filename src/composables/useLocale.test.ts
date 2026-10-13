import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'

const mockLocale = ref('ru')

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: mockLocale,
  }),
  createI18n: vi.fn(() => ({})),
}))

vi.mock('../i18n', () => ({
  LOCALE_STORAGE_KEY: 'warchi.locale',
  isSupportedLocale: (value: string | null) => value === 'ru' || value === 'en',
}))

import { useLocale } from './useLocale'

describe('useLocale', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocale.value = 'ru'
    localStorage.clear()
    document.documentElement.lang = 'ru'
  })

  it('returns correct supportedLocales array', () => {
    const { supportedLocales } = useLocale()
    expect(supportedLocales).toEqual(['ru', 'en'])
  })

  it('returns currentLocale as computed', () => {
    const { currentLocale } = useLocale()
    expect(currentLocale.value).toBe('ru')
  })

  describe('setLocale', () => {
    it('sets locale to en', async () => {
      const { currentLocale, setLocale } = useLocale()
      setLocale('en')
      await nextTick()

      expect(currentLocale.value).toBe('en')
      expect(localStorage.getItem('warchi.locale')).toBe('en')
      expect(document.documentElement.lang).toBe('en')
    })

    it('switches from en back to ru', async () => {
      const { currentLocale, setLocale } = useLocale()
      setLocale('en')
      await nextTick()
      expect(currentLocale.value).toBe('en')

      setLocale('ru')
      await nextTick()
      expect(currentLocale.value).toBe('ru')
    })
  })

  describe('toggleLocale', () => {
    it('toggles from ru to en', async () => {
      const { currentLocale, toggleLocale } = useLocale()
      expect(currentLocale.value).toBe('ru')

      toggleLocale()
      await nextTick()

      expect(currentLocale.value).toBe('en')
      expect(localStorage.getItem('warchi.locale')).toBe('en')
      expect(document.documentElement.lang).toBe('en')
    })

    it('toggles from en to ru', async () => {
      const { currentLocale, setLocale, toggleLocale } = useLocale()
      setLocale('en')
      await nextTick()

      toggleLocale()
      await nextTick()

      expect(currentLocale.value).toBe('ru')
      expect(localStorage.getItem('warchi.locale')).toBe('ru')
      expect(document.documentElement.lang).toBe('ru')
    })

    it('double toggle returns to original', async () => {
      const { currentLocale, toggleLocale } = useLocale()
      toggleLocale()
      await nextTick()
      toggleLocale()
      await nextTick()

      expect(currentLocale.value).toBe('ru')
    })
  })

  describe('unsupported locale fallback', () => {
    it('defaults to ru for unsupported i18n locale value', () => {
      mockLocale.value = 'xx'
      const { currentLocale } = useLocale()
      expect(currentLocale.value).toBe('ru')
    })
  })

  describe('localStorage persistence', () => {
    it('saves locale to localStorage on set', async () => {
      const { setLocale } = useLocale()
      setLocale('en')
      await nextTick()
      expect(localStorage.getItem('warchi.locale')).toBe('en')
    })
  })

  describe('document lang update', () => {
    it('updates document.documentElement.lang on set', async () => {
      const { setLocale } = useLocale()
      setLocale('en')
      await nextTick()
      expect(document.documentElement.lang).toBe('en')
    })

    it('updates document.documentElement.lang on toggle', async () => {
      const { toggleLocale } = useLocale()
      toggleLocale()
      await nextTick()
      expect(document.documentElement.lang).toBe('en')

      toggleLocale()
      await nextTick()
      expect(document.documentElement.lang).toBe('ru')
    })
  })
})
