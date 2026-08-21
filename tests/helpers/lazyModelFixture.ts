import type { Page } from '@playwright/test'
import { apiJson, csrfFromPage, currentUser, loginViaUi } from './e2eApi'

type EntityId = { id: string }
type NodeTypePage = { content?: Array<{ id: string; name: string }> }
type ModelWithAttrs = EntityId & { attrs?: string | null }

export type LazyModelFixture = {
  modelId: string
  modelName: string
  notationId: string
  rootFolderId: string
  childFolderName: string
  diagramId: string
  diagramName: string
  directoryTypeId: string
  directoryTypeCreated: boolean
  nodeTypeId: string
  linkTypeId: string
  componentIds: string[]
  nodeIds: string[]
  linkId: string
}
export type LazyCopyTargetFixture = {
  modelId: string
  modelName: string
  rootFolderId: string
  rootFolderName: string
  childFolderId: string
  childFolderName: string
}

function requireId(result: { ok: boolean; status: number; raw: string; data: EntityId | null }, label: string): string {
  if (!result.ok || !result.data?.id) {
    throw new Error(`${label} failed: ${result.status} ${result.raw}`)
  }
  return result.data.id
}

function requireTreeRootNodeId(model: ModelWithAttrs): string {
  try {
    const attrs = JSON.parse(model.attrs ?? '{}') as { treeRootNodeId?: unknown }
    if (typeof attrs.treeRootNodeId === 'string' && attrs.treeRootNodeId) {
      return attrs.treeRootNodeId
    }
  } catch {
    // The explicit failure below gives the fixture a useful diagnosis.
  }
  throw new Error(`model ${model.id} does not have attrs.treeRootNodeId`)
}

async function deleteIfPresent(page: Page, path: string, csrf: string): Promise<void> {
  await apiJson(page.request, 'DELETE', path, { csrf })
}

export async function createLazyModelFixture(page: Page): Promise<LazyModelFixture> {
  await page.context().clearCookies()
  await loginViaUi(
    page,
    process.env.E2E_EMAIL || 'e2e-test@warchi.dev',
    process.env.E2E_PASSWORD || 'e2eTest123!'
  )
  const csrf = await csrfFromPage(page)
  const owner = await currentUser(page)
  const stamp = Date.now()
  const modelName = `E2E lazy model ${stamp}`
  const notationName = `E2E lazy notation ${stamp}`
  const childFolderName = `Child folder ${stamp}`
  const diagramName = `Lazy diagram ${stamp}`

  const directoryTypes = await apiJson<NodeTypePage>(page.request, 'GET', '/node-types?size=1000')
  if (!directoryTypes.ok) {
    throw new Error(`list node types failed: ${directoryTypes.status} ${directoryTypes.raw}`)
  }
  const existingDirectory = directoryTypes.data?.content?.find(item => item.name === 'Directory')
  const directoryTypeCreated = !existingDirectory
  const directoryTypeId =
    existingDirectory?.id ??
    requireId(
      await apiJson<EntityId>(page.request, 'POST', '/node-types', {
        csrf,
        data: { name: 'Directory', version: '1.0.0', ownerId: owner.id, attrs: null },
      }),
      'create Directory node type'
    )

  const nodeTypeId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/node-types', {
      csrf,
      data: { name: `E2E lazy node ${stamp}`, version: '1.0.0', ownerId: owner.id, attrs: null },
    }),
    'create node type'
  )
  const linkTypeId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/link-types', {
      csrf,
      data: { name: `E2E lazy link ${stamp}`, version: '1.0.0', ownerId: owner.id, attrs: null },
    }),
    'create link type'
  )
  const notationId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/notations', {
      csrf,
      data: { name: notationName, version: '1.0.0', ownerId: owner.id, attrs: null },
    }),
    'create notation'
  )
  const directoryComponentId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/components', {
      csrf,
      data: {
        name: `Directory component ${stamp}`,
        version: '1.0.0',
        notationId,
        ownerId: owner.id,
        nodeTypeId: directoryTypeId,
        attrs: null,
      },
    }),
    'create Directory component'
  )
  const nodeComponentId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/components', {
      csrf,
      data: {
        name: `Node component ${stamp}`,
        version: '1.0.0',
        notationId,
        ownerId: owner.id,
        nodeTypeId,
        attrs: null,
      },
    }),
    'create node component'
  )
  const modelId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/models', {
      csrf,
      data: { name: modelName, version: '1.0.0', ownerId: owner.id, attrs: null },
    }),
    'create model'
  )
  const createdModel = await apiJson<ModelWithAttrs>(page.request, 'GET', `/models/${modelId}`)
  if (!createdModel.ok || !createdModel.data) {
    throw new Error(`get created model failed: ${createdModel.status} ${createdModel.raw}`)
  }
  const treeRootNodeId = requireTreeRootNodeId(createdModel.data)
  const rootFolderId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/nodes', {
      csrf,
      data: {
        name: `Root folder ${stamp}`,
        modelId,
        ownerId: owner.id,
        nodeTypeId: directoryTypeId,
        parentNodeId: treeRootNodeId,
        attrs: JSON.stringify({ treeOrder: 0 }),
      },
    }),
    'create root folder'
  )
  const childFolderId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/nodes', {
      csrf,
      data: {
        name: childFolderName,
        modelId,
        ownerId: owner.id,
        nodeTypeId: directoryTypeId,
        parentNodeId: rootFolderId,
        attrs: JSON.stringify({ treeOrder: 0 }),
      },
    }),
    'create child folder'
  )
  const firstNodeId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/nodes', {
      csrf,
      data: {
        name: `Leaf A ${stamp}`,
        modelId,
        ownerId: owner.id,
        nodeTypeId,
        parentNodeId: childFolderId,
        attrs: JSON.stringify({ treeOrder: 0 }),
      },
    }),
    'create first leaf'
  )
  const secondNodeId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/nodes', {
      csrf,
      data: {
        name: `Leaf B ${stamp}`,
        modelId,
        ownerId: owner.id,
        nodeTypeId,
        parentNodeId: childFolderId,
        attrs: JSON.stringify({ treeOrder: 1 }),
      },
    }),
    'create second leaf'
  )
  const linkId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/links', {
      csrf,
      data: {
        sourceId: firstNodeId,
        targetId: secondNodeId,
        modelId,
        ownerId: owner.id,
        linkTypeId,
        attrs: null,
      },
    }),
    'create link'
  )
  const diagramId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/diagrams', {
      csrf,
      data: {
        name: diagramName,
        version: '1.0.0',
        ownerId: owner.id,
        modelId,
        notationId,
        nodeId: rootFolderId,
        attrs: JSON.stringify({
          instances: {
            nodes: [
              {
                id: `instance-a-${stamp}`,
                modelNodeId: firstNodeId,
                x: 80,
                y: 80,
                attrs: { notationComponentId: nodeComponentId },
              },
              {
                id: `instance-b-${stamp}`,
                modelNodeId: secondNodeId,
                x: 300,
                y: 80,
                attrs: { notationComponentId: nodeComponentId },
              },
            ],
            edges: [
              {
                id: `edge-${stamp}`,
                modelLinkId: linkId,
                sourceInstanceId: `instance-a-${stamp}`,
                targetInstanceId: `instance-b-${stamp}`,
              },
            ],
          },
        }),
      },
    }),
    'create diagram'
  )

  return {
    modelId,
    modelName,
    notationId,
    rootFolderId,
    childFolderName,
    diagramId,
    diagramName,
    directoryTypeId,
    directoryTypeCreated,
    nodeTypeId,
    linkTypeId,
    componentIds: [directoryComponentId, nodeComponentId],
    nodeIds: [rootFolderId, childFolderId, firstNodeId, secondNodeId],
    linkId,
  }
}

export async function cleanupLazyModelFixture(page: Page, fixture: LazyModelFixture): Promise<void> {
  const csrf = await csrfFromPage(page).catch(() => null)
  if (!csrf) return

  await deleteIfPresent(page, `/diagrams/${fixture.diagramId}`, csrf)
  await deleteIfPresent(page, `/links/${fixture.linkId}`, csrf)
  await Promise.all(fixture.nodeIds.slice().reverse().map(id => deleteIfPresent(page, `/nodes/${id}`, csrf)))
  await Promise.all(fixture.componentIds.map(id => deleteIfPresent(page, `/components/${id}`, csrf)))
  await deleteIfPresent(page, `/models/${fixture.modelId}`, csrf)
  await deleteIfPresent(page, `/notations/${fixture.notationId}`, csrf)
  await deleteIfPresent(page, `/node-types/${fixture.nodeTypeId}`, csrf)
  await deleteIfPresent(page, `/link-types/${fixture.linkTypeId}`, csrf)
  if (fixture.directoryTypeCreated) {
    await deleteIfPresent(page, `/node-types/${fixture.directoryTypeId}`, csrf)
  }
}

export async function createLazyCopyTargetFixture(
  page: Page,
  source: LazyModelFixture
): Promise<LazyCopyTargetFixture> {
  const csrf = await csrfFromPage(page)
  const owner = await currentUser(page)
  const stamp = Date.now()
  const modelName = `E2E copy target ${stamp}`
  const rootFolderName = `Target folder ${stamp}`
  const childFolderName = `Target child ${stamp}`
  const modelId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/models', {
      csrf,
      data: { name: modelName, version: '1.0.0', ownerId: owner.id, attrs: null },
    }),
    'create copy target model'
  )
  const model = await apiJson<ModelWithAttrs>(page.request, 'GET', `/models/${modelId}`)
  if (!model.ok || !model.data) throw new Error(`get copy target model failed: ${model.status} ${model.raw}`)
  const rootFolderId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/nodes', {
      csrf,
      data: { name: rootFolderName, modelId, ownerId: owner.id, nodeTypeId: source.directoryTypeId, parentNodeId: requireTreeRootNodeId(model.data), attrs: JSON.stringify({ treeOrder: 0 }) },
    }),
    'create copy target root folder'
  )
  const childFolderId = requireId(
    await apiJson<EntityId>(page.request, 'POST', '/nodes', {
      csrf,
      data: { name: childFolderName, modelId, ownerId: owner.id, nodeTypeId: source.directoryTypeId, parentNodeId: rootFolderId, attrs: JSON.stringify({ treeOrder: 0 }) },
    }),
    'create copy target child folder'
  )
  return { modelId, modelName, rootFolderId, rootFolderName, childFolderId, childFolderName }
}

export async function cleanupLazyCopyTargetFixture(page: Page, fixture: LazyCopyTargetFixture): Promise<void> {
  const csrf = await csrfFromPage(page).catch(() => null)
  if (!csrf) return
  await deleteIfPresent(page, `/nodes/${fixture.childFolderId}`, csrf)
  await deleteIfPresent(page, `/nodes/${fixture.rootFolderId}`, csrf)
  await deleteIfPresent(page, `/models/${fixture.modelId}`, csrf)
}

export async function openLazyModelEditor(page: Page, fixture: LazyModelFixture): Promise<void> {
  await page.goto(`/models/${fixture.modelId}`)
  await page.getByRole('heading', { name: fixture.modelName }).waitFor({
    state: 'visible',
    timeout: 20000,
  })
}
