import { describe, expect, it, vi } from 'vitest'
import type { ApiResult } from '@/composables/useApi'
import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
import type { ModelData } from '@/types/entities'
import { createEmptyModelEditorState, type EditorDiagram, type TreeParentScope } from '../types'
import { toEditorDiagram, toEditorLink, toEditorNode } from '../composables/modelEditorMappers'
import { ModelPartialStore } from './modelPartialStore'
import {
  createModelGranularSyncReconciler,
  type ModelGranularSyncFetchers,
} from './modelGranularSyncReconciler'

function node(
  id: string,
  overrides: Partial<NodeResponse> = {}
): NodeResponse {
  return {
    id,
    name: id,
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeTypeId: 'node-type-1',
    parentNodeId: null,
    attrs: null,
    ...overrides,
  }
}

function link(
  id: string,
  overrides: Partial<LinkResponse> = {}
): LinkResponse {
  return {
    id,
    modelId: 'model-1',
    ownerId: 'owner-1',
    linkTypeId: 'link-type-1',
    sourceId: 'node-1',
    targetId: 'node-2',
    attrs: null,
    ...overrides,
  }
}

function diagram(
  id: string,
  overrides: Partial<DiagramResponse> = {}
): DiagramResponse {
  return {
    id,
    name: id,
    version: '1.0.0',
    modelId: 'model-1',
    ownerId: 'owner-1',
    notationId: 'notation-1',
    attrs: null,
    ...overrides,
  }
}

function success<T>(data: T): ApiResult<T> {
  return { success: true, data }
}

function model(overrides: Partial<ModelData> = {}): ModelData {
  return {
    id: 'model-1',
    name: 'Model',
    version: '1.0.0',
    ownerId: 'owner-1',
    attrs: null,
    updatedAt: 'v1',
    ...overrides,
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function loadScope(
  store: ModelPartialStore,
  scope: TreeParentScope,
  rows: NodeResponse[]
): void {
  const guard = store.beginChildrenRequest(scope)
  store.mergeNodes(
    rows.map(toEditorNode),
    {
      kind: 'childrenPage',
      scope,
      page: 0,
      total: rows.length,
      last: true,
      token: guard.token,
    },
    guard
  )
}

function harness(options: {
  nodes?: NodeResponse[]
  links?: LinkResponse[]
  diagrams?: EditorDiagram[]
  fetchers?: Partial<ModelGranularSyncFetchers>
  model?: ModelData
} = {}) {
  const store = new ModelPartialStore()
  store.setRootParentNodeId(null)
  store.mergeNodes((options.nodes ?? []).map(toEditorNode), { kind: 'partial' })
  store.mergeLinks((options.links ?? []).map(toEditorLink), { kind: 'partial' })
  const state = createEmptyModelEditorState()
  state.modelId = 'model-1'
  state.diagrams = options.diagrams ?? []
  let currentModel = options.model ?? model()
  const refreshedScopes: TreeParentScope[] = []
  const invalidatedDetached = vi.fn()
  const unknown = vi.fn()
  const fetchers: ModelGranularSyncFetchers = {
    fetchNode: vi.fn(async id => success(node(id))),
    fetchLink: vi.fn(async id => success(link(id))),
    fetchDiagram: vi.fn(async id => success(diagram(id))),
    fetchModel: vi.fn(async () => success(model({ name: 'Remote model', updatedAt: 'v2' }))),
    ...options.fetchers,
  }
  const reconciler = createModelGranularSyncReconciler({
    modelId: () => state.modelId,
    model: () => currentModel,
    replaceModel: next => {
      currentModel = next
    },
    modelDirty: () => false,
    store,
    diagrams: () => state.diagrams,
    replaceDiagrams: rows => {
      state.diagrams = rows
    },
    publishMaterializedRows: () => {
      state.nodes = store.nodes
      state.links = store.links
    },
    refreshVisibleChildrenScope: async scope => {
      refreshedScopes.push(scope)
    },
    fetchers,
    onDetachedSnapshotInvalidated: invalidatedDetached,
    onUnknownEvent: unknown,
  })
  return {
    fetchers,
    invalidatedDetached,
    reconciler,
    refreshedScopes,
    state,
    store,
    unknown,
    currentModel: () => currentModel,
  }
}

describe('modelGranularSyncReconciler', () => {
  it('point-updates only a materialized clean node and never uses an unscoped collection', async () => {
    const h = harness({
      nodes: [node('loaded', { name: 'old' })],
      fetchers: {
        fetchNode: vi.fn(async id => success(node(id, { name: 'remote' }))),
      },
    })

    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'unloaded' }])
    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'loaded' }])
    await h.reconciler.flush()

    expect(h.fetchers.fetchNode).toHaveBeenCalledTimes(1)
    expect(h.fetchers.fetchNode).toHaveBeenCalledWith('loaded', expect.any(AbortSignal))
    expect(h.store.nodeById.get('loaded')?.name).toBe('remote')
    expect(h.store.nodeById.has('unloaded')).toBe(false)
  })

  it('keeps dirty, new, and locally deleted node/link rows over remote updates', async () => {
    const dirtyNode = { ...toEditorNode(node('dirty-node')), _isDirty: true }
    const newLink = { ...toEditorLink(link('new-link')), _isNew: true }
    const deletedLink = { ...toEditorLink(link('deleted-link')), _isDeleted: true }
    const h = harness()
    h.store.replaceMaterializedRows([dirtyNode], [newLink, deletedLink])

    h.reconciler.enqueue([
      { type: 'node_updated', entity: 'node', id: 'dirty-node' },
      { type: 'link_updated', entity: 'link', id: 'new-link' },
      { type: 'link_updated', entity: 'link', id: 'deleted-link' },
    ])
    await h.reconciler.flush()

    expect(h.store.nodeById.get('dirty-node')).toBe(dirtyNode)
    expect(h.store.linkById.get('new-link')).toBe(newLink)
    expect(h.store.linkById.get('deleted-link')).toBe(deletedLink)
  })

  it('refreshes a loaded parent after create without materializing the point response', async () => {
    const h = harness({
      fetchers: {
        fetchNode: vi.fn(async id =>
          success(node(id, { parentNodeId: 'folder', name: 'created remotely' }))
        ),
      },
    })
    loadScope(h.store, { kind: 'node', nodeId: 'folder' }, [])

    h.reconciler.enqueue([{ type: 'node_created', entity: 'node', id: 'created' }])
    await h.reconciler.flush()

    expect(h.refreshedScopes).toEqual([{ kind: 'node', nodeId: 'folder' }])
    expect(h.store.nodeById.has('created')).toBe(false)
  })

  it('does not materialize a create in an unloaded branch and invalidates only a known partial parent', async () => {
    const h = harness({
      fetchers: {
        fetchNode: vi.fn(async id =>
          success(node(id, { parentNodeId: id === 'known-child' ? 'known' : 'unknown' }))
        ),
      },
    })
    const knownScope = { kind: 'node', nodeId: 'known' } as const
    const guard = h.store.beginChildrenRequest(knownScope)
    h.store.mergeNodes(
      [toEditorNode(node('existing', { parentNodeId: 'known' }))],
      {
        kind: 'childrenPage',
        scope: knownScope,
        page: 0,
        total: 2,
        last: false,
        token: guard.token,
      },
      guard
    )

    h.reconciler.enqueue([
      { type: 'node_created', entity: 'node', id: 'known-child' },
      { type: 'node_created', entity: 'node', id: 'unknown-child' },
    ])
    await h.reconciler.flush()

    expect(h.refreshedScopes).toEqual([])
    expect(h.store.childrenPages.has('node:known')).toBe(false)
    expect(h.store.nodeById.has('known-child')).toBe(false)
    expect(h.store.nodeById.has('unknown-child')).toBe(false)
  })

  it('tombstones a remote delete, removes a clean materialized row, and invalidates its known parent', async () => {
    const h = harness()
    loadScope(h.store, { kind: 'root' }, [node('deleted')])

    h.reconciler.enqueue([{ type: 'node_deleted', entity: 'node', id: 'deleted' }])
    await h.reconciler.flush()

    expect(h.store.remoteDeletedNodeIds.has('deleted')).toBe(true)
    expect(h.store.nodeById.has('deleted')).toBe(false)
    expect(h.store.loadedChildrenFor.has('root')).toBe(false)
  })

  it('cascade-deletes every materialized incident link even when it is locally dirty', async () => {
    const cleanIncident = toEditorLink(link('clean-incident', { sourceId: 'deleted' }))
    const dirtyIncident = {
      ...toEditorLink(link('dirty-incident', { targetId: 'deleted' })),
      _isDirty: true,
    }
    const unrelated = toEditorLink(
      link('unrelated', { sourceId: 'other-1', targetId: 'other-2' })
    )
    const h = harness()
    h.store.replaceMaterializedRows(
      [toEditorNode(node('deleted'))],
      [cleanIncident, dirtyIncident, unrelated]
    )

    h.reconciler.enqueue([{ type: 'node_deleted', entity: 'node', id: 'deleted' }])
    await h.reconciler.flush()

    expect(h.store.linkById.has('clean-incident')).toBe(false)
    expect(h.store.linkById.has('dirty-incident')).toBe(false)
    expect(h.store.linkById.get('unrelated')).toBe(unrelated)
    expect(h.store.remoteDeletedLinkIds).toEqual(
      new Set(['clean-incident', 'dirty-incident'])
    )
    expect(h.store.remoteCascadeConflictLinkIds).toEqual(new Set(['dirty-incident']))
    expect(h.invalidatedDetached).toHaveBeenCalledTimes(1)
  })

  it('point-refreshes model_updated metadata and records its event revision', async () => {
    const revisionApplied = vi.fn()
    const h = harness()
    let appliedModel: ModelData | null = null
    const reconciler = createModelGranularSyncReconciler({
      modelId: () => h.state.modelId,
      model: h.currentModel,
      replaceModel: next => {
        appliedModel = next
      },
      modelDirty: () => false,
      store: h.store,
      diagrams: () => h.state.diagrams,
      replaceDiagrams: rows => {
        h.state.diagrams = rows
      },
      publishMaterializedRows: vi.fn(),
      refreshVisibleChildrenScope: vi.fn(async () => undefined),
      fetchers: h.fetchers,
      onModelRevisionApplied: revisionApplied,
    })

    reconciler.enqueue([
      { type: 'model_updated', entity: 'model', id: 'model-1', revision: 42 },
    ])
    await reconciler.flush()

    expect(h.fetchers.fetchModel).toHaveBeenCalledWith('model-1', expect.any(AbortSignal))
    expect(revisionApplied).toHaveBeenCalledWith(42)
    expect(appliedModel).toMatchObject({ name: 'Remote model', updatedAt: 'v2' })
    expect(h.fetchers.fetchNode).not.toHaveBeenCalled()
    expect(h.fetchers.fetchLink).not.toHaveBeenCalled()
  })

  it('ignores a stale model_updated point response after generation reset', async () => {
    const response = deferred<ApiResult<ModelData>>()
    const h = harness({
      fetchers: {
        fetchModel: vi.fn(() => response.promise),
      },
    })

    h.reconciler.enqueue([
      { type: 'model_updated', entity: 'model', id: 'model-1', revision: 7 },
    ])
    await Promise.resolve()
    h.store.reset()
    response.resolve(success(model({ name: 'Late model', updatedAt: 'late' })))
    await h.reconciler.flush()

    expect(h.currentModel()).toMatchObject({ name: 'Model', updatedAt: 'v1' })
  })

  it('blocks a stale point GET that resolves after delete and aborts its request', async () => {
    const response = deferred<ApiResult<NodeResponse>>()
    let signal: AbortSignal | undefined
    const h = harness({
      nodes: [node('racy', { name: 'old' })],
      fetchers: {
        fetchNode: vi.fn((_, requestSignal) => {
          signal = requestSignal
          return response.promise
        }),
      },
    })

    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'racy' }])
    await Promise.resolve()
    h.reconciler.enqueue([{ type: 'node_deleted', entity: 'node', id: 'racy' }])
    await Promise.resolve()
    expect(signal?.aborted).toBe(true)

    response.resolve(success(node('racy', { name: 'stale' })))
    await h.reconciler.flush()

    expect(h.store.nodeById.has('racy')).toBe(false)
    expect(h.store.remoteDeletedNodeIds.has('racy')).toBe(true)
  })

  it('ignores a point response after the partial-store generation changes', async () => {
    const response = deferred<ApiResult<NodeResponse>>()
    const h = harness({
      nodes: [node('old-model')],
      fetchers: {
        fetchNode: vi.fn(() => response.promise),
      },
    })

    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'old-model' }])
    await Promise.resolve()
    h.store.reset()
    response.resolve(success(node('old-model', { name: 'late' })))
    await h.reconciler.flush()

    expect(h.store.nodeById.has('old-model')).toBe(false)
  })

  it('aborts point requests when disposed', async () => {
    const response = deferred<ApiResult<LinkResponse>>()
    let signal: AbortSignal | undefined
    const h = harness({
      links: [link('link-1')],
      fetchers: {
        fetchLink: vi.fn((_, requestSignal) => {
          signal = requestSignal
          return response.promise
        }),
      },
    })

    h.reconciler.enqueue([{ type: 'link_updated', entity: 'link', id: 'link-1' }])
    await Promise.resolve()
    h.reconciler.dispose()

    expect(signal?.aborted).toBe(true)
    response.resolve(success(link('link-1', { sourceId: 'late' })))
    await h.reconciler.flush()
    expect(h.store.linkById.get('link-1')?.sourceId).toBe('node-1')
  })

  it('updates slim diagram metadata while preserving hydrated attrs of the open diagram', async () => {
    const local = toEditorDiagram(
      diagram('diagram-1', {
        name: 'old',
        attrs: JSON.stringify({ instances: [{ id: 'instance-1' }] }),
      })
    )
    const h = harness({
      diagrams: [local],
      fetchers: {
        fetchDiagram: vi.fn(async id =>
          success(
            diagram(id, {
              name: 'remote',
              attrs: JSON.stringify({ instances: [{ id: 'remote-instance' }] }),
            })
          )
        ),
      },
    })
    h.reconciler.enqueue([{ type: 'diagram_updated', entity: 'diagram', id: 'diagram-1' }])
    await h.reconciler.flush()

    expect(h.state.diagrams[0]?.name).toBe('remote')
    expect(h.state.diagrams[0]?.parsedAttrs).toBe(local.parsedAttrs)
    expect(h.state.diagrams[0]?._attrsPending).toBe(false)
  })

  it('reports an unknown event and invalidates its materialized node scope without fetching', async () => {
    const h = harness()
    loadScope(h.store, { kind: 'root' }, [node('known')])

    h.reconciler.enqueue([{ type: 'node_reparented', entity: 'node', id: 'known' }])
    await h.reconciler.flush()

    expect(h.unknown).toHaveBeenCalledWith({
      type: 'node_reparented',
      entity: 'node',
      id: 'known',
    })
    expect(h.store.loadedChildrenFor.has('root')).toBe(false)
    expect(h.fetchers.fetchNode).not.toHaveBeenCalled()
    expect(h.fetchers.fetchLink).not.toHaveBeenCalled()
  })

  it('coalesces queued events by entity:id so the last event wins', async () => {
    const h = harness({ nodes: [node('same')] })

    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'same' }])
    h.reconciler.enqueue([{ type: 'node_deleted', entity: 'node', id: 'same' }])
    await h.reconciler.flush()

    expect(h.fetchers.fetchNode).not.toHaveBeenCalled()
    expect(h.store.remoteDeletedNodeIds.has('same')).toBe(true)
  })

  it('coalesces detached snapshot invalidation for a granular batch', async () => {
    const h = harness({ links: [link('link-1')] })

    h.reconciler.enqueue([
      { type: 'link_updated', entity: 'link', id: 'link-1' },
      { type: 'link_deleted', entity: 'link', id: 'link-2' },
    ])
    await h.reconciler.flush()

    expect(h.invalidatedDetached).toHaveBeenCalledTimes(1)
  })
})
