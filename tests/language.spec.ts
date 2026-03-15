import { test, expect } from '@playwright/test'

test.describe('Language switching', () => {
  test('default language is RU and can switch to EN and back', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.hero')).toBeVisible({ timeout: 10000 })

    // Default language should be RU — check for Russian text in stat cards
    const statLabel = page.locator('.stat-card__label').first()
    await expect(statLabel).toBeVisible()
    await expect(statLabel).toHaveText(/Модели|Нотации|Типы узлов|Типы связей/)

    // Find language switcher in the header
    const switcher = page.locator('.language-switcher')
    await expect(switcher).toBeVisible()

    // Click EN button
    const enButton = switcher.locator('.language-switcher__button', { hasText: 'EN' })
    await enButton.click()

    // Verify page switches to English
    await expect(statLabel).toHaveText(/Models|Notations|Node types|Link types/, { timeout: 5000 })

    // Switch back to RU
    const ruButton = switcher.locator('.language-switcher__button', { hasText: 'RU' })
    await ruButton.click()

    // Verify Russian text is restored
    await expect(statLabel).toHaveText(/Модели|Нотации|Типы узлов|Типы связей/, { timeout: 5000 })
  })
})
