import { test, expect } from '@playwright/test'

test.describe('Language switching', () => {
  test('default locale is Russian when storage key is cleared; can switch to EN and back', async ({
    page,
  }) => {
    await page.goto('/home')
    await expect(page.locator('.hero')).toBeVisible({ timeout: 10000 })

    // Auth setup persists `en`; remove it to verify app fallback to Russian default.
    await page.evaluate(() => {
      window.localStorage.removeItem('warchi.locale')
    })
    await page.reload()
    await expect(page.locator('.hero')).toBeVisible({ timeout: 10000 })

    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')

    const statLabel = page.locator('.stat-card__label').first()
    await expect(statLabel).toBeVisible()

    // Language switcher in the header
    const switcher = page.locator('.language-switcher')
    await expect(switcher).toBeVisible()

    // Click EN button
    const enButton = switcher.locator('.language-switcher__button', { hasText: 'EN' })
    await enButton.click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 5000 })
    await expect(statLabel).toHaveText(/Models|Notations|Node types|Link types/, { timeout: 5000 })

    const ruButton = switcher.locator('.language-switcher__button', { hasText: 'RU' })
    await ruButton.click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'ru', { timeout: 5000 })
  })
})
