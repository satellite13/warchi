import { config } from '@vue/test-utils'
import { vi } from 'vitest'

class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

const localStorageMock = new MemoryStorage()

vi.stubGlobal('localStorage', localStorageMock)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  })
}

// Stub global UiIcon component (renders as <img> with icon name as alt)
config.global.stubs = {
  UiIcon: {
    template: '<i class="ui-icon" :data-icon="name">{{ name }}</i>',
    props: ['name', 'alt'],
  },
}

// Provide minimal i18n mock
config.global.mocks = {
  $t: (key: string) => key,
}
