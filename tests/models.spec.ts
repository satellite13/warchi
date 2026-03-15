import { test, expect } from '@playwright/test'

test.describe('Models list page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/models')
  })

  test('shows page header', async ({ page }) => {
    await expect(page.locator('.home-header')).toBeVisible()
  })

  test('shows search input', async ({ page }) => {
    const searchInput = page.locator('.home-header input[type="text"], .home-header .search-input__input')
    await expect(searchInput).toBeVisible()
  })

  test('shows create card or model cards', async ({ page }) => {
    // Page either shows create card (if no models) or model grid
    const grid = page.locator('.model-grid')
    await expect(grid).toBeVisible({ timeout: 10000 })
  })

  test('search filters models', async ({ page }) => {
    const searchInput = page.locator('.home-header input[type="text"], .home-header .search-input__input')
    await searchInput.fill('nonexistent-model-xyz-test')
    // Should either show empty state or no cards
    await page.waitForTimeout(500)
    const emptyState = page.locator('.empty-state, .section__empty')
    const cards = page.locator('.model-grid .entity-card')
    const emptyVisible = await emptyState.isVisible().catch(() => false)
    const cardCount = await cards.count()
    expect(emptyVisible || cardCount === 0).toBeTruthy()
  })
})
