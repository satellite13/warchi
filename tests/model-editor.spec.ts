import { test, expect } from '@playwright/test'
import {
  cleanupLazyModelFixture,
  createLazyModelFixture,
  openLazyModelEditor,
} from './helpers/lazyModelFixture'

test.describe('Model editor', () => {
  test('opens a configured model and adds a root folder', async ({ page }) => {
    test.setTimeout(60000)
    const fixture = await createLazyModelFixture(page)

    try {
      await openLazyModelEditor(page, fixture)
      await expect(page.getByRole('heading', { name: fixture.modelName })).toBeVisible()
      await expect(page.getByPlaceholder('Search...')).toBeVisible()

      await page
        .locator(`[data-tree-node-id="${fixture.rootFolderId}"] .tree-node__toggle`)
        .click()
      await page.getByRole('button', { name: fixture.diagramName }).dblclick()
      await expect(page.getByRole('button', { name: /Directory component/ })).toBeVisible()

      await page.getByRole('button', { name: 'Add root folder' }).click()
      const modal = page.locator('.modal-overlay')
      await expect(modal).toBeVisible()
      await modal.getByPlaceholder('New folder').fill('E2E Test Folder')
      await modal.getByRole('button', { name: 'Create' }).click()
      await expect(modal).toBeHidden()

      await expect(
        page.getByRole('button', { name: 'E2E Test Folder', exact: true })
      ).toBeVisible()
    } finally {
      await cleanupLazyModelFixture(page, fixture)
    }
  })
})
