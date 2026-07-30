import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForPublicShareUrl } from './waitForPublicShareUrl'

describe('waitForPublicShareUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns true when SVG is served', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/svg+xml' },
      text: async () => '<svg></svg>',
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(waitForPublicShareUrl('https://example.com/svg')).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/svg',
      expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store' })
    )
  })

  it('retries until ready', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        headers: { get: () => 'application/json' },
        text: async () => '{"error":"NOT_FOUND"}',
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'image/svg+xml' },
        text: async () => '<svg></svg>',
      })
    vi.stubGlobal('fetch', fetchMock)

    const promise = waitForPublicShareUrl('https://example.com/svg', { attempts: 3, delayMs: 10 })
    await vi.advanceTimersByTimeAsync(10)
    await expect(promise).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns false after attempts exhausted', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: { get: () => 'application/json' },
      text: async () => '{}',
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = waitForPublicShareUrl('https://example.com/svg', { attempts: 2, delayMs: 5 })
    await vi.advanceTimersByTimeAsync(5)
    await expect(promise).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
