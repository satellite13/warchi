import { test, expect } from '@playwright/test'

/**
 * Stale local profile: UI user in localStorage without auth cookies must not stay
 * "authenticated". App calls /auth/me on mount and clears local auth on 401/403.
 */
test.describe('Stale local profile without cookies', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('clears local profile and redirects to login when cookies are missing', async ({
    page,
  }) => {
    // Seed profile once (do not use addInitScript — it would re-seed on every navigation).
    await page.goto('/login')
    await page.evaluate(() => {
      window.localStorage.setItem(
        'warchi_user',
        JSON.stringify({
          id: 'stale-user-id',
          email: 'stale@warchi.dev',
          role: 'USER',
          firstName: 'Stale',
          lastName: 'Profile',
        })
      )
      window.localStorage.setItem('warchi.locale', 'en')
    })

    await page.goto('/models')

    // Router may briefly allow /models (local profile present), then /auth/me 401 clears session.
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 })

    const stored = await page.evaluate(() => window.localStorage.getItem('warchi_user'))
    expect(stored).toBeNull()
  })
})
