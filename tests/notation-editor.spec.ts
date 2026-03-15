import { test, expect } from '@playwright/test'

const uniqueName = () => `E2E-NotationEditor-${Date.now()}`

test.describe('Notation editor', () => {
  test('create notation, open editor, add component, verify list, clean up', async ({ page }) => {
    test.setTimeout(60000)
    const name = uniqueName()
    const componentName = `Comp-${Date.now()}`
    const newTypeName = `Type-${Date.now()}`

    // --- Go to /notations and create a new notation ---
    await page.goto('/notations')
    await expect(page.locator('.model-grid')).toBeVisible({ timeout: 10000 })

    await page.locator('.create-card').click()
    await expect(page.locator('.modal-overlay')).toBeVisible()

    await page.locator('#notations-name').fill(name)
    await page.locator('#notations-version').fill('1.0.0')
    await page.locator('.create-form button[type="submit"]').click()

    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })
    const card = page.locator('.model-card__title', { hasText: name })
    await expect(card).toBeVisible({ timeout: 10000 })

    // --- Open the notation editor ---
    const cardWrap = page.locator('.model-card-wrap').filter({ hasText: name })
    await cardWrap.locator('.model-card').first().click()

    // --- Verify notation editor loads ---
    await expect(page.locator('.component-list__header')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.notation-canvas-area')).toBeVisible()

    // --- Add a component via the add button in component list header ---
    // The add-btn buttons: [0] = sync toggle, [1] = add component, [2] = add relation
    const addComponentBtn = page.locator('.component-list__actions .add-btn').nth(1)
    await addComponentBtn.click()

    // --- Fill in the component modal ---
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 })

    const form = page.locator('#component-form')
    // Fill name (first text input)
    const inputs = form.locator('input[type="text"]')
    await inputs.first().fill(componentName)

    // The default type selection is "__new__", so we need to fill in the new type name
    // The new type name input appears when typeSelection === NEW_TYPE_VALUE
    // It is the input after the SearchableSelect for type
    // Find all text inputs - name, version, tags, new-type-name
    const allInputs = form.locator('input[type="text"]')
    const inputCount = await allInputs.count()

    // Fill the new type name field (should be the last text input visible)
    if (inputCount >= 4) {
      await allInputs.nth(3).fill(newTypeName)
    }

    // Submit the form
    await page.locator('button[type="submit"][form="component-form"]').click()
    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })

    // --- Verify the component appears in the list ---
    const componentItem = page.locator('.component-item')
    await expect(componentItem.first()).toBeVisible({ timeout: 10000 })
    const componentNames = page.locator('.component-item__name')
    await expect(componentNames.filter({ hasText: componentName })).toBeVisible({ timeout: 5000 })

    // --- Go back to notations list ---
    await page.locator('.back-btn').click()

    // Handle unsaved changes dialog if it appears
    const leaveBtn = page.locator('.btn--danger', { hasText: /покинуть|уйти|leave/i })
    const leaveBtnVisible = await leaveBtn.isVisible({ timeout: 2000 }).catch(() => false)
    if (leaveBtnVisible) {
      await leaveBtn.click()
    }

    await expect(page.locator('.model-grid')).toBeVisible({ timeout: 10000 })

    // --- Delete the notation to clean up ---
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
