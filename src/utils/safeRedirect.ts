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
