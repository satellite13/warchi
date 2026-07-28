/** UUID when available; deterministic-enough fallback otherwise. */
export function createId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID()
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
}
