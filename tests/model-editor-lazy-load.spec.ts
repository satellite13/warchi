import { expect, test } from '@playwright/test'
import {
  cleanupLazyModelFixture,
  cleanupLazyCopyTargetFixture,
  createLazyCopyTargetFixture,
  createLazyModelFixture,
  openLazyModelEditor,
} from './helpers/lazyModelFixture'

test.describe('Model editor lazy loading', () => {
  test('loads only root rows until a folder or diagram is opened', async ({ page }) => {
    test.setTimeout(60000)
    const fixture = await createLazyModelFixture(page)
    const apiRequests: URL[] = []
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/v1/')) apiRequests.push(url)
    })

    try {
      await openLazyModelEditor(page, fixture)
      await expect(page.getByRole('heading', { name: fixture.modelName })).toBeVisible()

      const nodeRequestsOnOpen = apiRequests.filter(url => url.pathname === '/api/v1/nodes')
      expect(nodeRequestsOnOpen).toHaveLength(1)
      expect(nodeRequestsOnOpen[0]?.searchParams.get('parentId')).toBe('root')
      expect(apiRequests.some(url => url.pathname === '/api/v1/links')).toBe(false)

      const folderToggle = page.locator(
        `[data-tree-node-id="${fixture.rootFolderId}"] .tree-node__toggle`
      )
      await folderToggle.click()
      await expect(
        page.getByRole('button', { name: fixture.childFolderName, exact: true })
      ).toBeVisible()

      const expandedFolderRequest = apiRequests.find(
        url =>
          url.pathname === '/api/v1/nodes' &&
          url.searchParams.get('parentId') === fixture.rootFolderId
      )
      expect(expandedFolderRequest).toBeDefined()

      await page.getByRole('button', { name: fixture.diagramName }).dblclick()
      await expect(page.locator(`[data-tree-diagram-id="${fixture.diagramId}"]`)).toHaveClass(
        /diagram-row--active/
      )

      expect(
        apiRequests.some(
          url => url.pathname === '/api/v1/nodes' && url.searchParams.get('parentId') === null
        )
      ).toBe(false)
      expect(apiRequests.some(url => url.pathname === '/api/v1/links')).toBe(false)
    } finally {
      await cleanupLazyModelFixture(page, fixture)
    }
  })

  test('loads target folders lazily in the diagram copy wizard', async ({ page }) => {
    test.setTimeout(60000)
    const source = await createLazyModelFixture(page)
    const target = await createLazyCopyTargetFixture(page, source)
    const apiRequests: URL[] = []
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/v1/')) apiRequests.push(url)
    })

    try {
      await openLazyModelEditor(page, source)
      await page.locator(`[data-tree-node-id="${source.rootFolderId}"] .tree-node__toggle`).click()
      const diagramRow = page.locator(`[data-tree-diagram-id="${source.diagramId}"]`)
      await diagramRow.hover()
      await diagramRow.getByRole('button', { name: 'Copy diagram to another model' }).click()

      const modal = page.locator('.modal-overlay')
      await expect(modal.getByRole('heading', { name: 'Copy diagram to another model' })).toBeVisible()
      const targetField = modal.locator('.diagram-copy__field').filter({ hasText: 'Target model' })
      await targetField.locator('.searchable-select__control').click()
      await page
        .locator('.searchable-select-panel .searchable-select__item')
        .filter({ hasText: `${target.modelName} (1.0.0)` })
        .click()

      const picker = modal.locator('fieldset.diagram-copy__folder-picker')
      const targetRoot = picker
        .locator('.diagram-copy__folder-branch')
        .filter({ hasText: target.rootFolderName })
      await targetRoot.getByRole('button', { name: 'Expand folder' }).click()
      await picker.getByRole('radio', { name: target.childFolderName, exact: true }).check()

      expect(
        apiRequests.some(
          url =>
            url.pathname === '/api/v1/nodes' &&
            url.searchParams.get('modelId') === target.modelId &&
            url.searchParams.get('parentId') === target.rootFolderId &&
            url.searchParams.get('foldersOnly') === 'true'
        )
      ).toBe(true)
    } finally {
      await cleanupLazyCopyTargetFixture(page, target)
      await cleanupLazyModelFixture(page, source)
    }
  })

  test('loads traceability through bounded graph endpoints', async ({ page }) => {
    test.setTimeout(60000)
    const fixture = await createLazyModelFixture(page)
    const apiRequests: URL[] = []
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/v1/')) apiRequests.push(url)
    })
    try {
      await openLazyModelEditor(page, fixture)
      await page.locator(`[data-tree-node-id="${fixture.rootFolderId}"] .tree-node__toggle`).click()
      await page.locator(`[data-tree-node-id="${fixture.nodeIds[1]}"] .tree-node__toggle`).click()
      await page.locator(`[data-tree-node-id="${fixture.nodeIds[2]}"] .tree-node__select`).click()
      await page.getByRole('button', { name: 'Traceability', exact: true }).click()
      await expect(page.locator('#traceability-tree-panel')).toBeVisible()
      expect(apiRequests.some(url => url.pathname.endsWith('/graph/neighbors'))).toBe(true)
      expect(apiRequests.some(url => url.pathname.endsWith('/diagram-references'))).toBe(true)
    } finally {
      await cleanupLazyModelFixture(page, fixture)
    }
  })

  test('saves a traceability node dropped onto the diagram exactly once', async ({ page }) => {
    test.setTimeout(60000)
    const fixture = await createLazyModelFixture(page)
    try {
      await openLazyModelEditor(page, fixture)
      await page.locator(`[data-tree-node-id="${fixture.rootFolderId}"] .tree-node__toggle`).click()
      await page.getByRole('button', { name: fixture.diagramName }).dblclick()
      await expect(page.locator(`[data-tree-diagram-id="${fixture.diagramId}"]`)).toHaveClass(
        /diagram-row--active/
      )
      await page.locator(`[data-tree-node-id="${fixture.nodeIds[1]}"] .tree-node__toggle`).click()
      await page.locator(`[data-tree-node-id="${fixture.nodeIds[2]}"] .tree-node__select`).click()
      await page.getByRole('button', { name: 'Traceability', exact: true }).click()

      const dragHandle = page.getByTestId('trace-node-drag-root')
      await expect(dragHandle).toHaveAttribute('aria-disabled', 'false')
      const canvas = page.locator('.diagram-canvas__canvas')
      const canvasBox = await canvas.boundingBox()
      expect(canvasBox).not.toBeNull()
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
      await dragHandle.dispatchEvent('dragstart', { dataTransfer })
      await canvas.dispatchEvent('dragover', {
        dataTransfer,
        clientX: canvasBox!.x + canvasBox!.width / 2,
        clientY: canvasBox!.y + canvasBox!.height / 2,
      })
      await canvas.dispatchEvent('drop', {
        dataTransfer,
        clientX: canvasBox!.x + canvasBox!.width / 2,
        clientY: canvasBox!.y + canvasBox!.height / 2,
      })

      const batchSaveResponse = page.waitForResponse(response => {
        const url = new URL(response.url())
        return (
          url.pathname === `/api/v1/models/${fixture.modelId}/batch-save` &&
          response.request().method() === 'POST'
        )
      })
      await page.getByTitle('Save changes').click()
      const response = await batchSaveResponse
      expect(response.ok()).toBe(true)

      const payload = JSON.parse(response.request().postData() ?? '{}') as {
        diagrams: { update: Array<{ id: string; attrs: string | null }> }
      }
      const diagramUpdate = payload.diagrams.update.find(diagram => diagram.id === fixture.diagramId)
      expect(diagramUpdate?.attrs).not.toBeNull()

      const attrs = JSON.parse(diagramUpdate?.attrs ?? '{}') as {
        instances?: { nodes?: Array<{ modelNodeId?: string }> }
      }
      const matchingInstances =
        attrs.instances?.nodes?.filter(instance => instance.modelNodeId === fixture.nodeIds[2]) ?? []
      expect(matchingInstances).toHaveLength(1)
    } finally {
      await cleanupLazyModelFixture(page, fixture)
    }
  })

  test('navigates to a diagram search hit without opening it', async ({ page }) => {
    test.setTimeout(60000)
    const fixture = await createLazyModelFixture(page)
    const apiRequests: URL[] = []
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/v1/')) apiRequests.push(url)
    })

    try {
      await openLazyModelEditor(page, fixture)
      const searchResponse = page.waitForResponse(response => {
        const url = new URL(response.url())
        return (
          url.pathname === `/api/v1/search/models/${fixture.modelId}` &&
          response.request().method() === 'GET' &&
          response.ok()
        )
      })

      await page.locator('.search-input').fill(fixture.diagramName)
      const response = await searchResponse
      const searchUrl = new URL(response.url())
      expect(searchUrl.searchParams.get('kinds')).toBe('nodes,diagrams')

      const searchHit = page.locator(`[data-tree-search-hit-id="${fixture.diagramId}"]`)
      await expect(searchHit).toBeVisible()
      await expect(searchHit.locator('.tree-search-hit__breadcrumb')).toContainText(
        fixture.rootFolderName
      )
      await searchHit.getByRole('button').click()

      await expect(page.locator('.search-input')).toHaveValue('')
      await expect(page.locator(`[data-tree-diagram-id="${fixture.diagramId}"]`)).toBeVisible()
      await expect(page.locator(`[data-tree-diagram-id="${fixture.diagramId}"]`)).not.toHaveClass(
        /diagram-row--active/
      )
      expect(
        apiRequests.some(
          url =>
            url.pathname.includes('/diagram-locks/') && url.pathname.endsWith('/acquire')
        )
      ).toBe(false)
    } finally {
      await cleanupLazyModelFixture(page, fixture)
    }
  })
})
