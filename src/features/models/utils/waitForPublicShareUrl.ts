/**
 * Poll a public diagram share URL until it serves SVG (or give up).
 * Uses credentials: 'omit' so readiness matches an anonymous recipient tab.
 */
export async function waitForPublicShareUrl(
  url: string,
  options: { attempts?: number; delayMs?: number } = {}
): Promise<boolean> {
  const attempts = options.attempts ?? 10
  const delayMs = options.delayMs ?? 200

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'image/svg+xml,*/*' },
      })
      if (response.ok) {
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType.includes('svg')) {
          return true
        }
        const body = await response.text()
        if (body.includes('<svg')) {
          return true
        }
      }
    } catch {
      // retry
    }
    if (i < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  return false
}
