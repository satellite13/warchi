import { test as setup, expect } from '@playwright/test'

const TEST_EMAIL = process.env.E2E_EMAIL || 'e2e-test@warchi.dev'
const TEST_PASSWORD = process.env.E2E_PASSWORD || 'e2eTest123!'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('.card-brand')).toHaveText('wArchi')

  await page.locator('#email').fill(TEST_EMAIL)
  await page.locator('#password').fill(TEST_PASSWORD)
  await page.locator('button.submit').click()

  // Wait for redirect to home page after successful login
  await expect(page).toHaveURL('/home', { timeout: 10000 })
  await expect(page.locator('.hero')).toBeVisible()

  // E2E runs against English UI strings (app default is Russian).
  await page.evaluate(() => {
    window.localStorage.setItem('warchi.locale', 'en')
  })
  await page.reload()
  await expect(page.locator('.hero')).toBeVisible({ timeout: 10000 })

  await page.context().storageState({ path: 'tests/.auth/user.json' })
})
