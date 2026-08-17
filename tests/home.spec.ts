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

  test('does not show marketing subtitle', async ({ page }) => {
    await expect(page.locator('.hero__subtitle')).toHaveCount(0)
  })

  test('shows stats cards', async ({ page }) => {
    const statCards = page.locator('.hero .stat-card')
    await expect(statCards.first()).toBeVisible()
    const count = await statCards.count()
    expect(count).toBeGreaterThanOrEqual(4)
  })

  test('shows recent models section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Недавние модели|Recent models/ })
    ).toBeVisible()
  })

  test('shows recent diagrams section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Недавние диаграммы|Recent diagrams/ })
    ).toBeVisible()
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
