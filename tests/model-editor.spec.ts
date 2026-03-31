import { test, expect } from '@playwright/test'

const uniqueName = () => `E2E-ModelEditor-${Date.now()}`

test.describe('Model editor', () => {
  test('create model, open editor, verify tree panel, add root folder, clean up', async ({
    page,
  }) => {
    test.setTimeout(60000)
    const name = uniqueName()

    // --- Go to /models and create a new model ---
    await page.goto('/models')
    await expect(page.locator('.model-grid')).toBeVisible({ timeout: 10000 })

    await page.locator('.create-card').click()
    await expect(page.locator('.modal-overlay')).toBeVisible()

    await page.locator('#models-name').fill(name)
    await page.locator('#models-version').fill('1.0.0')
    await page.locator('.create-form button[type="submit"]').click()

    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })
    const card = page.locator('.model-card__title', { hasText: name })
    await expect(card).toBeVisible({ timeout: 10000 })

    // --- Click on the created model card to open the editor ---
    const cardWrap = page.locator('.model-card-wrap').filter({ hasText: name })
    await cardWrap.locator('.model-card').first().click()

    // --- Verify model editor loads ---
    await expect(page.locator('.model-header')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.back-btn')).toBeVisible()

    // --- Verify the left tree panel is visible ---
    await expect(page.locator('.panel')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.panel__search-input')).toBeVisible()

    // --- Verify the tree shows empty state or existing nodes ---
    const treeNode = page.locator('.tree-node')
    const emptyTree = page.locator('.tree__empty')
    const hasNodes = await treeNode.first().isVisible().catch(() => false)
    const isEmpty = await emptyTree.isVisible().catch(() => false)
    expect(hasNodes || isEmpty).toBeTruthy()

    // --- Add a root folder via the create_new_folder button ---
    // Button order in .panel__header-actions: [0] = sync toggle, [1] = create folder, [2] = add node
    const addFolderBtn = page.locator('.panel__header-actions .mini-btn').nth(1)
    await addFolderBtn.click()

    // Create folder modal with a name input
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 })

    // Fill in the folder name
    const folderNameInput = page.locator('.modal-overlay .field-input')
    await folderNameInput.fill('E2E Test Folder')

    // Primary action in the modal footer (Create)
    await page.locator('.modal-overlay .btn--primary').click()
    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })

    // Wait for a new tree node to appear (folder node)
    await expect(page.locator('.tree-node').first()).toBeVisible({ timeout: 5000 })

    // Verify there is at least one tree node now
    const nodeCount = await page.locator('.tree-node').count()
    expect(nodeCount).toBeGreaterThanOrEqual(1)

    // --- Go back to models list ---
    await page.locator('.back-btn').click()

    // Handle unsaved changes dialog if it appears
    const leaveBtn = page.locator('.btn--danger')
    const leaveBtnVisible = await leaveBtn.first().isVisible({ timeout: 2000 }).catch(() => false)
    if (leaveBtnVisible) {
      await leaveBtn.first().click()
    }

    await expect(page.locator('.model-grid')).toBeVisible({ timeout: 10000 })

    // --- Delete the model to clean up ---
    const deleteCardWrap = page.locator('.model-card-wrap').filter({ hasText: name })
    await deleteCardWrap.locator('.model-card__delete').click()
    await expect(page.locator('.modal-overlay')).toBeVisible()
    await page.locator('.btn--danger').click()
    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })
    await expect(page.locator('.model-card__title', { hasText: name })).toBeHidden({
      timeout: 10000,
    })
  })
})
