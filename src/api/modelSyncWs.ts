/**
 * STOMP (Sock-less) endpoint на том же origin, что и SPA; в dev Vite проксирует `/ws` на API.
 * JWT передаётся через httpOnly cookie при WebSocket handshake.
 */
export function buildModelSyncWsUrl(): string {
  if (typeof window === 'undefined') {
    return ''
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${proto}//${host}/ws`
}
