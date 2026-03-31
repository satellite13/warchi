import { test, expect } from '@playwright/test'

const uniqueName = () => `E2E-Model-${Date.now()}`

test.describe('Models CRUD lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/models')
    await expect(page.locator('.model-grid')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.card-skeleton')).toHaveCount(0, { timeout: 15000 })
  })

  test('create → rename → delete model', async ({ page }) => {
    const name = uniqueName()
    const renamedName = `${name}-renamed`

    // --- CREATE ---
    await page.locator('.create-card').click()
    await expect(page.locator('.modal-overlay')).toBeVisible()

    const nameInput = page.locator('#models-name')
    const versionInput = page.locator('#models-version')
    await nameInput.fill(name)
    await versionInput.fill('1.0.0')

    await page.locator('.create-form button[type="submit"]').click()

    // Wait for modal to close and card to appear
    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })
    const card = page.locator('.model-card__title', { hasText: name })
    await expect(card).toBeVisible({ timeout: 10000 })

    // --- RENAME ---
    const cardWrap = page.locator('.model-card-wrap').filter({ hasText: name })
    await cardWrap.locator('.model-card__rename').click()
    await expect(page.locator('.modal-overlay')).toBeVisible()

    const renameInput = page.locator('.rename-form input[type="text"]')
    await renameInput.clear()
    await renameInput.fill(renamedName)

    await page.locator('.rename-form button[type="submit"]').click()
    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })

    const renamedCard = page.locator('.model-card__title', { hasText: renamedName })
    await expect(renamedCard).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.model-card__title', { hasText: name }).first()).not.toHaveText(name)

    // --- DELETE ---
    const renamedCardWrap = page.locator('.model-card-wrap').filter({ hasText: renamedName })
    await renamedCardWrap.locator('.model-card__delete').click()
    await expect(page.locator('.modal-overlay')).toBeVisible()

    await page.locator('.btn--danger').click()
    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })

    await expect(page.locator('.model-card__title', { hasText: renamedName })).toBeHidden({ timeout: 10000 })
  })
})
