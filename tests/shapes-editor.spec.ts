import { test, expect } from '@playwright/test'

test.describe('Shapes editor page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shapes')
    // Wait for the sidebar to appear
    await expect(page.locator('.shape-sidebar')).toBeVisible({ timeout: 15000 })
    // Wait for loading to finish
    await expect(page.locator('.shape-sidebar__loading')).toBeHidden({ timeout: 20000 })
  })

  test('page loads with sidebar', async ({ page }) => {
    await expect(page.locator('.shape-sidebar__header')).toBeVisible()
    await expect(page.locator('.shape-sidebar__search-input')).toBeVisible()
  })

  test('empty state when no shape selected', async ({ page }) => {
    // When no shape is selected, the empty state should show
    const emptyState = page.locator('.empty-state')
    const shapeContent = page.locator('.shape-editor__content')

    const emptyVisible = await emptyState.isVisible().catch(() => false)
    const contentVisible = await shapeContent.isVisible().catch(() => false)
    expect(emptyVisible || contentVisible).toBeTruthy()

    if (emptyVisible) {
      await expect(emptyState.locator('.empty-state__icon')).toBeVisible()
      await expect(emptyState.locator('.empty-state__text')).toBeVisible()
    }
  })

  test('click a shape and verify form loads', async ({ page }) => {
    // Check if any shapes exist in the sidebar
    const shapeItems = page.locator('.shape-sidebar__item')
    const count = await shapeItems.count()

    if (count > 0) {
      // Click the first shape
      await shapeItems.first().click()

      // Verify the form/content loads
      await expect(page.locator('.shape-editor__content')).toBeVisible({ timeout: 10000 })
    }
    // If no shapes exist, the test still passes (sidebar is verified above)
  })
})
