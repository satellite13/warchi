import { describe, expect, it } from 'vitest'

import { isSafeInternalRedirectPath } from './safeRedirect'

describe('isSafeInternalRedirectPath', () => {
  it('allows normal internal absolute paths', () => {
    expect(isSafeInternalRedirectPath('/home')).toBe(true)
    expect(isSafeInternalRedirectPath('/models/123?tab=diagram#canvas')).toBe(true)
  })

  it('rejects external and protocol-relative redirects', () => {
    expect(isSafeInternalRedirectPath('https://example.com')).toBe(false)
    expect(isSafeInternalRedirectPath('javascript:alert(1)')).toBe(false)
    expect(isSafeInternalRedirectPath('//evil.example/path')).toBe(false)
    expect(isSafeInternalRedirectPath('%2F%2Fevil.example/path')).toBe(false)
  })

  it('rejects backslash-based URL confusion', () => {
    expect(isSafeInternalRedirectPath('/\\evil.example')).toBe(false)
    expect(isSafeInternalRedirectPath('/%5Cevil.example')).toBe(false)
  })
})
