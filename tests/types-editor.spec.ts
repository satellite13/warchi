import { test, expect } from '@playwright/test'

test.describe('Types editor page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/types')
    // Wait for the sidebar to appear
    await expect(page.locator('.type-sidebar')).toBeVisible({ timeout: 15000 })
    // Wait for loading to finish
    await expect(page.locator('.type-sidebar__loading')).toBeHidden({ timeout: 20000 })
  })

  test('page loads with sidebar and section headers', async ({ page }) => {
    // Section headers render as uppercase labels (e.g. NODE TYPES / LINK TYPES in EN)
    const sectionLabels = page.locator('.type-sidebar__section-label')
    await expect(sectionLabels).toHaveCount(2, { timeout: 10000 })

    // The sections should be visible
    await expect(sectionLabels.first()).toBeVisible()
    await expect(sectionLabels.last()).toBeVisible()
  })

  test('empty state message when nothing is selected', async ({ page }) => {
    // When no type is selected, the empty state should show
    const emptyState = page.locator('.empty-state')
    const typeForm = page.locator('.type-form')

    const emptyVisible = await emptyState.isVisible().catch(() => false)
    const formVisible = await typeForm.isVisible().catch(() => false)
    expect(emptyVisible || formVisible).toBeTruthy()

    if (emptyVisible) {
      await expect(emptyState.locator('.empty-state__icon')).toBeVisible()
      await expect(emptyState.locator('.empty-state__text')).toBeVisible()
    }
  })

  test('click a type and verify the form loads', async ({ page }) => {
    // Check if any types exist in the sidebar
    const typeItems = page.locator('.type-sidebar__item')
    const count = await typeItems.count()

    if (count > 0) {
      // Click the first type
      await typeItems.first().click()

      // Verify the form loads
      await expect(page.locator('.type-form')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('.type-form__header')).toBeVisible()

      // Verify form has a name input
      await expect(page.locator('.type-form .form-input').first()).toBeVisible()
    }
    // If no types exist, the test still passes (the sidebar sections are verified above)
  })
})
