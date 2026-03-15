import { test, expect } from '@playwright/test'

test.describe('Notations list page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/notations')
  })

  test('shows page header with search', async ({ page }) => {
    await expect(page.locator('.home-header')).toBeVisible()
  })

  test('shows grid with cards', async ({ page }) => {
    const grid = page.locator('.model-grid')
    await expect(grid).toBeVisible({ timeout: 10000 })
  })

  test('search filters notations', async ({ page }) => {
    const searchInput = page.locator('.home-header input[type="text"], .home-header .search-input__input')
    await searchInput.fill('nonexistent-notation-xyz')
    await page.waitForTimeout(500)
    const emptyState = page.locator('.empty-state, .section__empty')
    const cards = page.locator('.model-grid .entity-card')
    const emptyVisible = await emptyState.isVisible().catch(() => false)
    const cardCount = await cards.count()
    expect(emptyVisible || cardCount === 0).toBeTruthy()
  })
})
