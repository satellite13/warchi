import type { APIRequestContext, Page } from '@playwright/test'

const CSRF_COOKIE = 'warchi_csrf'
const CSRF_HEADER = 'X-CSRF-Token'

export type E2eUser = {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
}

function apiPath(path: string): string {
  return path.startsWith('/api/') ? path : `/api/v1${path.startsWith('/') ? path : `/${path}`}`
}

export function csrfFromCookies(
  cookies: Array<{ name: string; value: string }>
): string | null {
  const match = cookies.find((c) => c.name === CSRF_COOKIE)
  return match?.value ? decodeURIComponent(match.value) : null
}

export async function csrfFromPage(page: Page): Promise<string> {
  const cookies = await page.context().cookies()
  const token = csrfFromCookies(cookies)
  if (!token) {
    throw new Error('CSRF cookie warchi_csrf is missing; login/session may be incomplete')
  }
  return token
}

export async function apiJson<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options?: { data?: unknown; csrf?: string | null }
): Promise<{ ok: boolean; status: number; data: T | null; raw: string }> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options?.csrf && method !== 'GET') {
    headers[CSRF_HEADER] = options.csrf
  }
  const response = await request.fetch(apiPath(path), {
    method,
    headers,
    data: options?.data,
  })
  const raw = await response.text()
  let data: T | null = null
  if (raw.trim()) {
    try {
      data = JSON.parse(raw) as T
    } catch {
      data = null
    }
  }
  return { ok: response.ok(), status: response.status(), data, raw }
}

export async function ensureUser(
  request: APIRequestContext,
  creds: { email: string; password: string; firstName: string; lastName: string }
): Promise<void> {
  const login = await apiJson(request, 'POST', '/auth/login', {
    data: { email: creds.email, password: creds.password },
  })
  if (login.ok) return

  const register = await apiJson(request, 'POST', '/auth/register', {
    data: {
      email: creds.email,
      password: creds.password,
      firstName: creds.firstName,
      lastName: creds.lastName,
    },
  })
  if (register.ok) return

  const retry = await apiJson(request, 'POST', '/auth/login', {
    data: { email: creds.email, password: creds.password },
  })
  if (!retry.ok) {
    throw new Error(
      `Unable to ensure E2E user ${creds.email}: login=${login.status} register=${register.status} retry=${retry.status}`
    )
  }
}

export async function loginViaUi(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/login')
  const emailInput = page.locator('#email')
  if (page.url().includes('/login')) {
    await emailInput.waitFor({ state: 'visible', timeout: 15000 })
    await emailInput.fill(email)
    await page.locator('#password').fill(password)
    await page.locator('button.submit').click()
    await page.waitForURL('/home', { timeout: 15000 })
  } else {
    await page.waitForURL('/home', { timeout: 15000 })
  }
  await page.evaluate(() => {
    window.localStorage.setItem('warchi.locale', 'en')
  })
  await page.reload()
  await page.waitForURL('/home', { timeout: 15000 })
}

export async function currentUser(page: Page): Promise<E2eUser> {
  const csrf = await csrfFromPage(page)
  const me = await apiJson<{ id: string; email: string; firstName?: string; lastName?: string }>(
    page.request,
    'GET',
    '/auth/me',
    { csrf }
  )
  if (!me.ok || !me.data?.id) {
    throw new Error(`GET /auth/me failed: ${me.status} ${me.raw}`)
  }
  return me.data
}
