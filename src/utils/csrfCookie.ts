const CSRF_COOKIE_NAME = 'warchi_csrf'

export const CSRF_HEADER_NAME = 'X-CSRF-Token'

export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${CSRF_COOKIE_NAME}=`
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
  if (!match) return null
  return decodeURIComponent(match.slice(prefix.length)) || null
}
