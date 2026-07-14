import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/config', () => ({
  buildApiUrl: vi.fn((path: string) => `http://test-api/api/v1${path}`),
}))

import {
  clearOutage,
  reportAvailabilityOutage,
  retryNow,
  useAvailabilityGuard,
} from './useAvailabilityGuard'

describe('useAvailabilityGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearOutage()
  })

  afterEach(() => {
    clearOutage()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps authz outage after a generic backend ping succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const { outage } = useAvailabilityGuard()

    reportAvailabilityOutage('authz_unavailable', 'Authorization service is unavailable')
    const ok = await retryNow()

    expect(ok).toBe(true)
    expect(outage.value?.kind).toBe('authz_unavailable')
  })

  it('clears backend outage after a generic backend ping succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const { outage } = useAvailabilityGuard()

    reportAvailabilityOutage('backend_unavailable', 'Backend unavailable')
    const ok = await retryNow()

    expect(ok).toBe(true)
    expect(outage.value).toBeNull()
  })
})
