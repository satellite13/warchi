import { test, expect } from '@playwright/test'

// Login tests run WITHOUT stored auth state
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('shows login form with branding', async ({ page }) => {
    await expect(page.locator('.card-brand')).toHaveText('wArchi')
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('button.submit')).toBeVisible()
  })

  test('has three mode tabs', async ({ page }) => {
    const tabs = page.locator('.tab')
    await expect(tabs).toHaveCount(3)
  })

  test('shows validation error for empty email', async ({ page }) => {
    await page.locator('button.submit').click()
    await expect(page.locator('.msg--error')).toBeVisible()
  })

  test('shows validation error for short password', async ({ page }) => {
    await page.locator('#email').fill('test@test.com')
    await page.locator('#password').fill('123')
    await page.locator('button.submit').click()
    await expect(page.locator('.msg--error')).toBeVisible()
  })

  test('switching to register tab shows profile fields', async ({ page }) => {
    const registerTab = page.locator('.tab').nth(1)
    await registerTab.click()
    await expect(page.locator('#first-name')).toBeVisible()
    await expect(page.locator('#last-name')).toBeVisible()
  })

  test('switching to admin tab shows admin secret field', async ({ page }) => {
    const adminTab = page.locator('.tab').nth(2)
    await adminTab.click()
    await expect(page.locator('#admin-secret')).toBeVisible()
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/models')
    await expect(page).toHaveURL(/\/login/)
  })
})
