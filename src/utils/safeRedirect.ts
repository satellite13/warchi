export function isSafeInternalRedirectPath(value: string): boolean {
  let decoded = value.trim()
  if (!decoded.startsWith('/')) return false

  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    return false
  }

  if (!decoded.startsWith('/')) return false
  if (decoded.startsWith('//')) return false
  if (decoded.includes('\\')) return false

  return true
}

/** Comma-separated origins from VITE_SITE_RETURN_ORIGINS, or single VITE_SITE_URL. */
export function allowedSiteReturnOrigins(
  env: { VITE_SITE_RETURN_ORIGINS?: string; VITE_SITE_URL?: string } = import.meta.env
): string[] {
  const fromList = (env.VITE_SITE_RETURN_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (fromList.length > 0) return fromList
  const siteUrl = (env.VITE_SITE_URL || '').trim()
  return siteUrl ? [siteUrl] : []
}

export function isSafeSiteReturnUrl(
  value: string,
  allowedOrigins: string[] = allowedSiteReturnOrigins()
): boolean {
  if (!value.trim() || allowedOrigins.length === 0) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    return allowedOrigins.some((origin) => {
      try {
        const allowed = new URL(origin)
        if (allowed.origin === url.origin) return true
        // Accept http/https variants of the same configured site host.
        return allowed.hostname === url.hostname && allowed.port === url.port
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}
