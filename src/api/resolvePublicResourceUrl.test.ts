import { describe, it, expect, afterEach, vi } from 'vitest'
import { resolvePublicResourceUrl } from './resolvePublicResourceUrl'

describe('resolvePublicResourceUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('regression: must not double-prefix absolute share urls from public-url-base', () => {
    // Backend with AREPOS_PUBLIC_URL_BASE returns a full URL. Wrapping with buildApiUrl
    // previously produced: https://app.warchi.ru/api/v1/https://app.warchi.ru/api/v1/...
    const url =
      'https://app.warchi.ru/api/v1/diagrams/svg/public/d61d4713-7dcf-43fe-a390-490020482fe7'
    const resolved = resolvePublicResourceUrl(url)
    expect(resolved).toBe(url)
    expect(resolved).not.toContain('/api/v1/https://')
    expect(resolved.match(/\/api\/v1\//g)).toHaveLength(1)
  })

  it('returns absolute http URLs unchanged', () => {
    const url = 'http://localhost:8080/api/v1/diagrams/svg/public/abc'
    expect(resolvePublicResourceUrl(url)).toBe(url)
  })

  it('prefixes relative /api/v1 paths with window.origin', () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.warchi.ru' } })
    expect(resolvePublicResourceUrl('/api/v1/diagrams/svg/public/abc')).toBe(
      'https://app.warchi.ru/api/v1/diagrams/svg/public/abc'
    )
  })

  it('normalizes paths without a leading slash', () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.warchi.ru' } })
    expect(resolvePublicResourceUrl('api/v1/diagrams/svg/public/abc')).toBe(
      'https://app.warchi.ru/api/v1/diagrams/svg/public/abc'
    )
  })
})
