import { test, expect } from '@playwright/test'
import {
  cleanupXssDocumentFixture,
  createXssDocumentFixture,
  expectSanitizedMarkdown,
  type XssDocFixture,
} from './helpers/xssFixture'

test.describe('Stored XSS smoke', () => {
  test('wiki and document modal sanitize stored markdown payloads', async ({ page }) => {
    test.setTimeout(90000)
    let fixture: XssDocFixture | null = null

    // Fail the test if an XSS payload somehow executes.
    page.on('dialog', async (dialog) => {
      await dialog.dismiss()
      throw new Error(`Unexpected dialog: ${dialog.message()}`)
    })

    try {
      fixture = await createXssDocumentFixture(page)

      // --- Wiki preview ---
      await page.goto('/wiki')
      await expect(page.locator('.wiki-view__sidebar')).toBeVisible({ timeout: 15000 })
      const wikiItem = page.locator('.wiki-view__item-btn', { hasText: fixture.nodeTypeName })
      await expect(wikiItem).toBeVisible({ timeout: 20000 })
      await wikiItem.click()
      await expectSanitizedMarkdown(page, '.wiki-view__markdown')

      // --- Document modal preview (types editor) ---
      await page.goto('/types')
      await expect(page.locator('.type-sidebar')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('.type-sidebar__loading')).toBeHidden({ timeout: 20000 })

      const typeItem = page.locator('.type-sidebar__item', { hasText: fixture.nodeTypeName })
      await expect(typeItem).toBeVisible({ timeout: 20000 })
      await typeItem.click()
      await expect(page.locator('.type-form')).toBeVisible({ timeout: 10000 })

      await page.locator('.type-form__doc-btn').click()
      await expect(page.locator('.doc-modal-overlay')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('.doc-modal__preview')).toBeVisible({ timeout: 15000 })
      await expectSanitizedMarkdown(page, '.doc-modal__preview')
    } finally {
      if (fixture) {
        await cleanupXssDocumentFixture(page, fixture)
      }
    }
  })
})
