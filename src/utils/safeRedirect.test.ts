import { describe, expect, it } from 'vitest'

import {
  isSafeInternalRedirectPath,
  isSafeSiteReturnUrl,
  allowedSiteReturnOrigins
} from './safeRedirect'

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

describe('isSafeSiteReturnUrl', () => {
  it('allows only configured origins', () => {
    const allowed = ['http://localhost:5174', 'https://www.example.com']
    expect(isSafeSiteReturnUrl('http://localhost:5174/feedback', allowed)).toBe(true)
    expect(isSafeSiteReturnUrl('https://www.example.com/downloads', allowed)).toBe(true)
    expect(isSafeSiteReturnUrl('https://evil.com/', allowed)).toBe(false)
  })

  it('reads origins from env helpers', () => {
    expect(
      allowedSiteReturnOrigins({
        VITE_SITE_RETURN_ORIGINS: 'http://a.test, http://b.test',
        VITE_SITE_URL: 'http://ignored.test'
      })
    ).toEqual(['http://a.test', 'http://b.test'])
    expect(allowedSiteReturnOrigins({ VITE_SITE_URL: 'http://site.test' })).toEqual([
      'http://site.test'
    ])
  })
})
