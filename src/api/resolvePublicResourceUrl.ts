/**
 * Resolve a backend public resource URL for display / clipboard.
 * Backend may return either an absolute URL (when public-url-base is set)
 * or a path that already includes `/api/v1/...` — never wrap those with buildApiUrl.
 */
export function resolvePublicResourceUrl(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`
  }
  return path
}
