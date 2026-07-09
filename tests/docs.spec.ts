import { test, expect } from '@playwright/test'

test.describe('Docs page', () => {
  test('loads docs page with sidebar and content', async ({ page }) => {
    await page.goto('/docs')
    await expect(page.locator('.docs-sidebar')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.docs-content')).toBeVisible()
  })

  test('sidebar shows navigation links', async ({ page }) => {
    await page.goto('/docs')
    const links = page.locator('.docs-sidebar__link')
    await expect(links.first()).toBeVisible({ timeout: 10000 })
    const count = await links.count()
    expect(count).toBeGreaterThanOrEqual(5)
  })

  test('default section renders content', async ({ page }) => {
    await page.goto('/docs')
    // Wait for loading to finish and content to render
    const body = page.locator('.docs-content__body')
    await expect(body).toBeVisible({ timeout: 10000 })
    await expect(body).not.toBeEmpty()
  })

  test('navigate between doc sections', async ({ page }) => {
    await page.goto('/docs')
    await expect(page.locator('.docs-sidebar')).toBeVisible({ timeout: 10000 })

    // Click on the second sidebar link (models section)
    const secondLink = page.locator('.docs-sidebar__link').nth(1)
    await secondLink.click()

    // URL should change to include section param
    await expect(page).toHaveURL(/\/docs\//)

    // Content should still be visible and rendered
    const body = page.locator('.docs-content__body')
    await expect(body).toBeVisible({ timeout: 10000 })
    await expect(body).not.toBeEmpty()

    // Click a different section (third link)
    const thirdLink = page.locator('.docs-sidebar__link').nth(2)
    await thirdLink.click()
    await expect(body).toBeVisible({ timeout: 10000 })
    await expect(body).not.toBeEmpty()
  })

  test('active section is highlighted in sidebar', async ({ page }) => {
    await page.goto('/docs')
    await expect(page.locator('.docs-sidebar')).toBeVisible({ timeout: 10000 })

    // First link (overview) should be active by default
    const firstLink = page.locator('.docs-sidebar__link').first()
    await expect(firstLink).toHaveClass(/docs-sidebar__link--active/)

    // Click second link
    const secondLink = page.locator('.docs-sidebar__link').nth(1)
    await secondLink.click()
    await expect(secondLink).toHaveClass(/docs-sidebar__link--active/, { timeout: 5000 })
  })

  test('auth docs describe cookie session without JS-readable JWTs', async ({ page }) => {
    await page.goto('/docs/auth')
    const body = page.locator('.docs-content__body')
    await expect(body).toBeVisible({ timeout: 10000 })
    await expect(body).toContainText(/cookie session|cookie-сесси/i)
    await expect(body).toContainText(/localStorage|sessionStorage/)
    await expect(body).toContainText(/JWT/)
  })
})
