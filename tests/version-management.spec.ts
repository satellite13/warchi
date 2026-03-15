import { test, expect } from '@playwright/test'

const uniqueName = () => `E2E-Version-${Date.now()}`

test.describe('Version management', () => {
  test('create model, create version from it, verify version tree, clean up', async ({ page }) => {
    const name = uniqueName()
    await page.goto('/models')
    await expect(page.locator('.model-grid')).toBeVisible({ timeout: 10000 })

    // --- CREATE original model ---
    await page.locator('.create-card').click()
    await expect(page.locator('.modal-overlay')).toBeVisible()

    await page.locator('#models-name').fill(name)
    await page.locator('#models-version').fill('0.1.0')
    await page.locator('.create-form button[type="submit"]').click()

    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })
    const card = page.locator('.model-card__title', { hasText: name })
    await expect(card).toBeVisible({ timeout: 10000 })

    // --- CREATE FROM VERSION ---
    const cardWrap = page.locator('.model-card-wrap').filter({ hasText: name })
    const copyBtn = cardWrap.locator('.model-card__copy-version')
    await expect(copyBtn).toBeVisible()
    await copyBtn.click()

    await expect(page.locator('.modal-overlay')).toBeVisible()

    // In the create modal, the name should be pre-filled, update the version
    const versionInput = page.locator('#models-version')
    await versionInput.clear()
    await versionInput.fill('0.2.0')
    await page.locator('.create-form button[type="submit"]').click()

    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })

    // Verify that the card now shows a version select (multiple versions exist)
    const updatedCardWrap = page.locator('.model-card-wrap').filter({ hasText: name })
    const versionSelect = updatedCardWrap.locator('.model-card__select select')
    await expect(versionSelect).toBeVisible({ timeout: 10000 })

    // --- VERSION TREE ---
    const versionTreeBtn = updatedCardWrap.locator('.model-card__version-tree')
    const treeButtonVisible = await versionTreeBtn.isVisible().catch(() => false)
    if (treeButtonVisible) {
      await versionTreeBtn.click()
      await expect(page.locator('.version-tree')).toBeVisible({ timeout: 5000 })
      // Close the modal
      await page.locator('.btn--secondary').click()
      await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 5000 })
    }

    // --- CLEANUP: delete both versions ---
    // Select version 0.2.0 and delete
    const currentCardWrap = page.locator('.model-card-wrap').filter({ hasText: name })
    await currentCardWrap.locator('.model-card__delete').click()
    await expect(page.locator('.modal-overlay')).toBeVisible()
    await page.locator('.btn--danger').click()
    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })

    // If a card with the same name still exists (other version), delete it too
    await page.waitForTimeout(1000)
    const remainingCard = page.locator('.model-card-wrap').filter({ hasText: name })
    const remainingCount = await remainingCard.count()
    if (remainingCount > 0) {
      await remainingCard.first().locator('.model-card__delete').click()
      await expect(page.locator('.modal-overlay')).toBeVisible()
      await page.locator('.btn--danger').click()
      await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })
    }

    // Verify cleanup
    await expect(page.locator('.model-card__title', { hasText: name })).toBeHidden({ timeout: 10000 })
  })
})
