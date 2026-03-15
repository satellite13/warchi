import { test, expect } from '@playwright/test'

test.describe('User profile page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile')
    await page.waitForLoadState('networkidle')
  })

  test('shows profile heading and subtitle', async ({ page }) => {
    await expect(page.locator('.card h1')).toBeVisible()
    await expect(page.locator('.card p')).toBeVisible()
  })

  test('shows profile form fields', async ({ page }) => {
    const fields = page.locator('.field')
    await expect(fields).toHaveCount(4)

    // All inputs should be visible and have values loaded from API
    const inputs = page.locator('.field input')
    for (let i = 0; i < 4; i++) {
      await expect(inputs.nth(i)).toBeVisible()
    }
  })

  test('save button is disabled when no changes', async ({ page }) => {
    const saveBtn = page.locator('.profile-form__save')
    await expect(saveBtn).toBeVisible()
    await expect(saveBtn).toBeDisabled()
  })

  test('can update profile fields and save', async ({ page }) => {
    const firstNameInput = page.locator('.field input').first()

    // Read the current value, modify it, then restore
    const originalValue = await firstNameInput.inputValue()
    const tempValue = `${originalValue}-test`

    await firstNameInput.clear()
    await firstNameInput.fill(tempValue)

    const saveBtn = page.locator('.profile-form__save')
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()

    // Wait for success message
    await expect(page.locator('.msg--success')).toBeVisible({ timeout: 10000 })

    // Restore original value
    await firstNameInput.clear()
    await firstNameInput.fill(originalValue)
    await saveBtn.click()
    await expect(page.locator('.msg--success')).toBeVisible({ timeout: 10000 })
  })
})
