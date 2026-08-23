import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { apiJson, csrfFromPage, type E2eUser } from './e2eApi'

export type DiagramLockFixture = {
  modelId: string
  modelName: string
  notationId: string
  notationName: string
  diagramId: string
  diagramName: string
  owner: E2eUser
}

type EntityId = { id: string }

/**
 * Creates a shared model + empty diagram via API (cookie session from `ownerPage`).
 * Grants EDIT share to `collabUserId` so a second browser can open the same editor.
 */
export async function createSharedDiagramFixture(
  ownerPage: Page,
  owner: E2eUser,
  collabUserId: string
): Promise<DiagramLockFixture> {
  const csrf = await csrfFromPage(ownerPage)
  const stamp = Date.now()
  const modelName = `E2E-Lock-${stamp}`
  const notationName = `E2E-Lock-Notation-${stamp}`
  const diagramName = `E2E-Lock-Diagram-${stamp}`

  const notation = await apiJson<EntityId>(ownerPage.request, 'POST', '/notations', {
    csrf,
    data: {
      name: notationName,
      version: '1.0.0',
      ownerId: owner.id,
      attrs: null,
    },
  })
  if (!notation.ok || !notation.data?.id) {
    throw new Error(`Create notation failed: ${notation.status} ${notation.raw}`)
  }

  const model = await apiJson<EntityId>(ownerPage.request, 'POST', '/models', {
    csrf,
    data: {
      name: modelName,
      version: '1.0.0',
      ownerId: owner.id,
      attrs: null,
    },
  })
  if (!model.ok || !model.data?.id) {
    throw new Error(`Create model failed: ${model.status} ${model.raw}`)
  }

  const diagram = await apiJson<EntityId>(ownerPage.request, 'POST', '/diagrams', {
    csrf,
    data: {
      name: diagramName,
      version: '1.0.0',
      ownerId: owner.id,
      modelId: model.data.id,
      notationId: notation.data.id,
      nodeId: null,
      attrs: JSON.stringify({ instances: { nodes: [], edges: [] } }),
    },
  })
  if (!diagram.ok || !diagram.data?.id) {
    throw new Error(`Create diagram failed: ${diagram.status} ${diagram.raw}`)
  }

  const share = await apiJson(ownerPage.request, 'POST', '/access/shares', {
    csrf,
    data: {
      resourceType: 'MODEL',
      resourceId: model.data.id,
      granteeUserId: collabUserId,
      permission: 'EDIT',
    },
  })
  if (!share.ok) {
    throw new Error(`Grant model share failed: ${share.status} ${share.raw}`)
  }

  return {
    modelId: model.data.id,
    modelName,
    notationId: notation.data.id,
    notationName,
    diagramId: diagram.data.id,
    diagramName,
    owner,
  }
}

export async function cleanupDiagramLockFixture(
  ownerPage: Page,
  fixture: DiagramLockFixture
): Promise<void> {
  const csrf = await csrfFromPage(ownerPage).catch(() => null)
  if (!csrf) return
  await apiJson(ownerPage.request, 'DELETE', `/diagrams/${fixture.diagramId}`, { csrf })
  await apiJson(ownerPage.request, 'DELETE', `/models/${fixture.modelId}`, { csrf })
  await apiJson(ownerPage.request, 'DELETE', `/notations/${fixture.notationId}`, { csrf })
}

export async function openModelEditor(page: Page, modelId: string): Promise<void> {
  await page.goto(`/models/${modelId}`)
  await page.locator('.model-header').waitFor({ state: 'visible', timeout: 20000 })
}

/**
 * Playwright focuses one page at a time; the product releases locks on `visibilitychange=hidden`.
 * Pin visibility and ignore release requests so the holder keeps the lock while the second
 * context opens the same diagram.
 */
export async function holdDiagramLockAcrossBlur(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    })
    document.addEventListener(
      'visibilitychange',
      (event) => {
        event.stopImmediatePropagation()
      },
      true
    )
  })
  await page.route('**/api/v1/diagram-locks/*/release', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    })
  })
}

export async function openDiagramByName(page: Page, diagramName: string): Promise<void> {
  const row = page.locator('.diagram-row').filter({ hasText: diagramName })
  await row.waitFor({ state: 'visible', timeout: 15000 })
  await row.locator('.diagram-row__select').dblclick()
  await row.locator('.diagram-row--active').waitFor({
    state: 'visible',
    timeout: 15000,
  })
}

export async function expectOwnLockPip(page: Page, diagramName: string): Promise<void> {
  const row = page.locator('.diagram-row').filter({ hasText: diagramName })
  await expect(row.locator('.diagram-row__lock-pip--own')).toBeVisible({ timeout: 15000 })
}

export async function expectForeignLockPip(page: Page, diagramName: string): Promise<void> {
  const row = page.locator('.diagram-row').filter({ hasText: diagramName })
  const pip = row.locator('.diagram-row__lock-pip')
  await expect(pip).toBeVisible({ timeout: 20000 })
  await expect(pip).not.toHaveClass(/diagram-row__lock-pip--own/)
  await expect(pip).toHaveAttribute('title', /Being edited by|Редактирует:/i)
}
