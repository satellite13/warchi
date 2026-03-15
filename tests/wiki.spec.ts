import { test, expect } from '@playwright/test'

test.describe('Wiki page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wiki')
  })

  test('sidebar loads and title is visible', async ({ page }) => {
    const sidebar = page.locator('.wiki-view__sidebar')
    await expect(sidebar).toBeVisible({ timeout: 10000 })

    const title = page.locator('.wiki-view__sidebar-title')
    await expect(title).toBeVisible()
    await expect(title).not.toBeEmpty()
  })

  test('shows group structure if groups exist', async ({ page }) => {
    await expect(page.locator('.wiki-view__sidebar')).toBeVisible({ timeout: 10000 })

    // Wait for loading to finish
    await page.waitForTimeout(2000)

    const groups = page.locator('.wiki-view__group')
    const groupCount = await groups.count()

    if (groupCount > 0) {
      // Each group should have a title button and a list
      const firstGroup = groups.first()
      await expect(firstGroup.locator('.wiki-view__group-title-btn')).toBeVisible()
      await expect(firstGroup.locator('.wiki-view__group-count')).toBeVisible()
    }
  })

  test('clicking a document loads content', async ({ page }) => {
    await expect(page.locator('.wiki-view__sidebar')).toBeVisible({ timeout: 10000 })

    // Wait for loading to finish
    await page.waitForTimeout(2000)

    const items = page.locator('.wiki-view__item-btn')
    const itemCount = await items.count()

    if (itemCount > 0) {
      await items.first().click()

      // Content area should show markdown or loading
      const markdown = page.locator('.wiki-view__markdown')
      const loading = page.locator('.wiki-view__content-loading')
      await expect(markdown.or(loading)).toBeVisible({ timeout: 10000 })

      // Eventually markdown should render
      await expect(markdown).toBeVisible({ timeout: 15000 })
    }
  })

  test('shows placeholder when nothing is selected', async ({ page }) => {
    await expect(page.locator('.wiki-view__sidebar')).toBeVisible({ timeout: 10000 })

    const placeholder = page.locator('.wiki-view__placeholder')
    await expect(placeholder).toBeVisible()
  })
})
