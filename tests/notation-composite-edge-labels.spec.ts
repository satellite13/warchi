import { test, expect } from '@playwright/test'

const uniqueName = (prefix: string) => `${prefix}-${Date.now()}`

/** Locators match English UI (`en` is set in auth setup). */
const RE = {
  componentKindLabel: /Component kind/i,
  compositeKind: /^Composite$/i,
  compositeTab: /Composite Figure/i,
  styleBindingsSection: /Style bindings/i,
  figureStyleTab: /Figure Style/i,
  labelPosition: /Label position/i,
  labelFollowPath: /Follow path/i,
}

async function createNotation(page: import('@playwright/test').Page, name: string) {
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

  const cardWrap = page.locator('.model-card-wrap').filter({ hasText: name })
  await cardWrap.locator('.model-card').first().click()

  await expect(page.locator('.component-list__header')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.notation-canvas-area')).toBeVisible()
}

async function leaveEditorToList(page: import('@playwright/test').Page) {
  await page.locator('.back-btn').click()
  const leaveBtn = page.locator('.btn--danger', { hasText: /Leave|Quitter/i })
  const leaveVisible = await leaveBtn.isVisible({ timeout: 2000 }).catch(() => false)
  if (leaveVisible) await leaveBtn.click()
  await expect(page.locator('.model-grid')).toBeVisible({ timeout: 10000 })
}

async function deleteNotationCard(page: import('@playwright/test').Page, name: string) {
  const deleteCardWrap = page.locator('.model-card-wrap').filter({ hasText: name })
  await deleteCardWrap.locator('.model-card__delete').click()
  await expect(page.locator('.modal-overlay')).toBeVisible()
  await page.locator('.btn--danger').click()
  await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })
  await expect(page.locator('.model-card__title', { hasText: name })).toBeHidden({ timeout: 10000 })
}

test.describe('Composite components and edge labels', () => {
  test('composite component: Composite Figure tab and style bindings section', async ({
    page,
  }) => {
    test.setTimeout(90000)
    const notationName = uniqueName('E2E-Composite')
    const componentName = `Comp-${Date.now()}`

    await createNotation(page, notationName)

    const addComponentBtn = page.locator('.component-list__actions .add-btn').nth(1)
    await addComponentBtn.click()
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 })

    await page.locator('#component-form input[type="text"]').first().fill(componentName)

    const kindBlock = page.locator('.modal-label').filter({ hasText: RE.componentKindLabel })
    await kindBlock.locator('.searchable-select__control').click()
    await page
      .locator('.searchable-select-panel .searchable-select__item')
      .filter({ hasText: RE.compositeKind })
      .click()

    await page.locator('button[type="submit"][form="component-form"]').click()
    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })

    await expect(page.locator('.component-item__name', { hasText: componentName })).toBeVisible({
      timeout: 5000,
    })

    const compositeTab = page.locator('.tab-panel__tab').filter({ hasText: RE.compositeTab })
    await expect(compositeTab).toBeVisible()
    await compositeTab.click()

    await expect(page.locator('.csp')).toBeVisible()
    await expect(page.locator('.csp__shape-btn').first()).toBeVisible()

    const bindingsToggle = page
      .locator('.csp')
      .getByRole('button', { name: RE.styleBindingsSection })
    await bindingsToggle.click()

    await expect(page.locator('.csp .a5')).toBeVisible()
    await expect(page.locator('.csp .a5__header')).toBeVisible()

    await leaveEditorToList(page)
    await deleteNotationCard(page, notationName)
  })

  test('relation: label position on path and follow path', async ({ page }) => {
    test.setTimeout(90000)
    const notationName = uniqueName('E2E-EdgeLabel')
    const relationName = `Rel-${Date.now()}`

    await createNotation(page, notationName)

    const addRelationBtn = page.locator('.component-list__actions .add-btn').nth(2)
    await addRelationBtn.click()
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 })

    await page.locator('#relation-form input[type="text"]').first().fill(relationName)
    await page.locator('button[type="submit"][form="relation-form"]').click()
    await expect(page.locator('.modal-overlay')).toBeHidden({ timeout: 10000 })

    const relationRow = page
      .locator('.component-item.component-item--relation')
      .filter({ hasText: relationName })
    await expect(relationRow).toBeVisible({ timeout: 5000 })
    await relationRow.click()

    const styleTab = page.locator('.tab-panel__tab').filter({ hasText: RE.figureStyleTab })
    await expect(styleTab).toBeVisible()
    await styleTab.click()

    await expect(page.locator('.sp-header__type--edge')).toBeVisible()

    const labelTextInput = page.locator('.sp-body .sp-field input.sp-input--full').first()
    await labelTextInput.fill('e2e-label')

    const positionRow = page.locator('.sp-body .lfr').filter({ hasText: RE.labelPosition })
    const positionNumber = positionRow.locator('input[type="number"]').first()
    await positionNumber.fill('0.35')
    await expect(positionNumber).toHaveValue('0.35')

    const followRow = page.locator('.sp-body .lfr').filter({ hasText: RE.labelFollowPath })
    const followCheckbox = followRow.locator('input.toggle-switch__input')
    await followRow.locator('label.toggle-switch').click()
    await expect(followCheckbox).toBeChecked()

    await leaveEditorToList(page)
    await deleteNotationCard(page, notationName)
  })
})
