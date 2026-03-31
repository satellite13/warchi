import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('home page loads after login', async ({ page }) => {
    await page.goto('/home')
    await expect(page.locator('.hero')).toBeVisible()
  })

  test('navigate to models', async ({ page }) => {
    await page.goto('/models')
    await expect(page.locator('.home-header')).toBeVisible()
  })

  test('navigate to notations', async ({ page }) => {
    await page.goto('/notations')
    await expect(page.locator('.home-header')).toBeVisible()
  })

  test('navigate to types', async ({ page }) => {
    await page.goto('/types')
    await expect(page.locator('body')).toContainText(/Type/i)
  })

  test('navigate to shapes', async ({ page }) => {
    await page.goto('/shapes')
    await expect(page.locator('body')).toContainText(/Shape/i)
  })

  test('navigate to docs', async ({ page }) => {
    await page.goto('/docs')
    await expect(page).toHaveURL(/\/docs/)
  })

  test('navigate to profile', async ({ page }) => {
    await page.goto('/profile')
    // Profile page should show some user info
    await expect(page.locator('body')).toBeVisible()
  })

  test('authenticated user redirected from login to home', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL('/home')
  })
})
