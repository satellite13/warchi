import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home')
  })

  test('shows hero section with greeting', async ({ page }) => {
    await expect(page.locator('.hero')).toBeVisible()
    await expect(page.locator('.hero__greeting')).toBeVisible()
    await expect(page.locator('.hero__name')).not.toBeEmpty()
  })

  test('shows stats cards', async ({ page }) => {
    const statCards = page.locator('.stat-card')
    await expect(statCards.first()).toBeVisible()
    const count = await statCards.count()
    expect(count).toBeGreaterThanOrEqual(4)
  })

  test('shows recent models section', async ({ page }) => {
    await expect(page.locator('.section__title').first()).toBeVisible()
  })

  test('shows quick actions', async ({ page }) => {
    const actions = page.locator('.action-btn')
    await expect(actions.first()).toBeVisible()
  })

  test('quick action navigates to models', async ({ page }) => {
    const modelsAction = page.locator('.action-btn').first()
    await modelsAction.click()
    await expect(page).toHaveURL(/\/(models|notations|types|shapes|docs)/)
  })
})
