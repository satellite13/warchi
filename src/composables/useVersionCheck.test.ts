import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useVersionCheck } from './useVersionCheck'

type MutableEnv = Record<string, string | boolean | undefined>

describe('useVersionCheck', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '9.9.9', buildTime: '2026-09-16T00:00:00Z' }),
      })
    )
    vi.stubGlobal('location', { ...window.location, reload: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.assign(import.meta.env, originalEnv)
  })

  it('shows an informer without auto-reloading when a newer version is published', async () => {
    const env = import.meta.env as MutableEnv
    env.DEV = false
    env.APP_VERSION = '0.25.17'
    env.APP_BUILD_TIME = '2026-09-01T00:00:00Z'
    env.BASE_URL = '/'

    let api: ReturnType<typeof useVersionCheck> | null = null
    const Host = defineComponent({
      setup() {
        api = useVersionCheck()
        return () => null
      },
    })

    mount(Host)
    await vi.waitFor(() => expect(api?.showNewVersionToast.value).toBe(true))
    await nextTick()

    expect(api).not.toBeNull()
    expect(api!.newVersion.value).toBe('9.9.9')
    expect(window.location.reload).not.toHaveBeenCalled()
  })
})
