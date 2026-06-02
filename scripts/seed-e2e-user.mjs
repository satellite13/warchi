/**
 * seed-e2e-user.mjs — подготовка тестового пользователя для E2E (Playwright).
 * Регистрирует или проверяет существование пользователя через API arepos-server,
 * чтобы e2e-тесты могли логиниться без ручной настройки БД.
 *
 * Использование:
 *   node scripts/seed-e2e-user.mjs
 *   npm run test:e2e:seed-user
 *
 * Переменные окружения:
 *   E2E_API_BASE_URL — URL API (по умолчанию http://localhost:8080/api/v1)
 *   E2E_EMAIL, E2E_PASSWORD — учётные данные тестового пользователя
 *   E2E_SEED_SKIP=true — пропустить seed без ошибки
 */
const API_BASE_URL = process.env.E2E_API_BASE_URL || process.env.E2E_API_URL || 'http://localhost:8080/api/v1'
const E2E_EMAIL = process.env.E2E_EMAIL || 'e2e-test@warchi.dev'
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'e2eTest123!'
const E2E_FIRST_NAME = process.env.E2E_FIRST_NAME || 'E2E'
const E2E_LAST_NAME = process.env.E2E_LAST_NAME || 'User'
const REQUEST_TIMEOUT_MS = Number(process.env.E2E_SEED_TIMEOUT_MS || 15000)

function withSlash(path) {
  return path.startsWith('/') ? path : `/${path}`
}

async function postJson(path, payload) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE_URL}${withSlash(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const raw = await response.text()
    let body = null
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = { raw }
      }
    }

    return { response, body }
  } finally {
    clearTimeout(timeoutId)
  }
}

function messageFromBody(body) {
  if (!body) return ''
  if (typeof body.message === 'string') return body.message
  if (typeof body.error === 'string') return body.error
  if (typeof body.raw === 'string') return body.raw
  return JSON.stringify(body)
}

async function login() {
  return postJson('/auth/login', {
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  })
}

async function register() {
  return postJson('/auth/register', {
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
    firstName: E2E_FIRST_NAME,
    lastName: E2E_LAST_NAME,
  })
}

async function main() {
  if (process.env.E2E_SEED_SKIP === 'true') {
    console.log('[e2e-seed] Skip requested by E2E_SEED_SKIP=true')
    return
  }

  try {
    const loginAttempt = await login()
    if (loginAttempt.response.ok) {
      console.log(`[e2e-seed] User is ready: ${E2E_EMAIL}`)
      return
    }

    const registerAttempt = await register()
    if (registerAttempt.response.ok) {
      console.log(`[e2e-seed] User has been created: ${E2E_EMAIL}`)
      return
    }

    const secondLoginAttempt = await login()
    if (secondLoginAttempt.response.ok) {
      console.log(`[e2e-seed] User already existed and is ready: ${E2E_EMAIL}`)
      return
    }

    const details = [
      `login status: ${loginAttempt.response.status} ${messageFromBody(loginAttempt.body)}`,
      `register status: ${registerAttempt.response.status} ${messageFromBody(registerAttempt.body)}`,
      `second login status: ${secondLoginAttempt.response.status} ${messageFromBody(secondLoginAttempt.body)}`,
    ].join('\n')

    throw new Error(`Unable to prepare E2E user.\n${details}`)
  } catch (error) {
    const base = error instanceof Error ? error.message : String(error)
    const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : ''
    console.error(`[e2e-seed] ${base}${cause}`)
    process.exit(1)
  }
}

await main()
