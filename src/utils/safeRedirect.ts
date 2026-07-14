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
        return new URL(origin).origin === url.origin
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}
