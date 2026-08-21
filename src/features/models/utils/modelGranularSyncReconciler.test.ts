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
  openDiagramId?: string | null
  refreshVisibleChildrenScope?: (scope: TreeParentScope) => Promise<void>
  acceptModelMetadata?: (remote: ModelData) => boolean
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
  const errors = vi.fn()
  const recovered = vi.fn()
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
    openDiagramId: () => options.openDiagramId ?? null,
    replaceDiagrams: rows => {
      state.diagrams = rows
    },
    publishMaterializedRows: () => {
      state.nodes = store.nodes
      state.links = store.links
    },
    refreshVisibleChildrenScope:
      options.refreshVisibleChildrenScope ??
      (async scope => {
        refreshedScopes.push(scope)
      }),
    fetchers,
    onDetachedSnapshotInvalidated: invalidatedDetached,
    onUnknownEvent: unknown,
    onError: errors,
    onRecovered: recovered,
    acceptModelMetadata: options.acceptModelMetadata,
  })
  return {
    fetchers,
    errors,
    recovered,
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
  it('does not apply model metadata rejected by the central monotonic revision owner', async () => {
    const acceptModelMetadata = vi.fn(() => false)
    const h = harness({
      acceptModelMetadata,
      fetchers: {
        fetchModel: vi.fn(async () => success(model({ name: 'stale remote', updatedAt: 'v1' }))),
      },
    })

    h.reconciler.enqueue([
      { type: 'model_updated', entity: 'model', id: 'model-1', revision: 2 },
    ])
    await h.reconciler.flush()

    expect(acceptModelMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: 'v1' })
    )
    expect(h.currentModel().name).toBe('Model')
  })

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

  it('retries a transient point error once and applies the successful response', async () => {
    const fetchNode = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: { status: 503, message: 'temporary' },
      })
      .mockResolvedValueOnce(success(node('loaded', { name: 'recovered' })))
    const h = harness({ nodes: [node('loaded')], fetchers: { fetchNode } })

    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'loaded' }])
    await h.reconciler.flush()

    expect(fetchNode).toHaveBeenCalledTimes(2)
    expect(h.store.nodeById.get('loaded')?.name).toBe('recovered')
    expect(h.errors).not.toHaveBeenCalled()
  })

  it('surfaces an exhausted point exception and invalidates only its known scope', async () => {
    const fetchNode = vi.fn(async () => {
      throw new Error('network down')
    })
    const h = harness({ fetchers: { fetchNode } })
    loadScope(h.store, { kind: 'root' }, [node('loaded')])

    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'loaded' }])
    await h.reconciler.flush()

    expect(fetchNode).toHaveBeenCalledTimes(2)
    expect(h.errors).toHaveBeenCalledWith(
      { type: 'node_updated', entity: 'node', id: 'loaded' },
      expect.any(Error),
      expect.any(Function)
    )
    expect(h.store.loadedChildrenFor.has('root')).toBe(false)
  })

  it('keeps 404 point responses as immediate delete semantics without retry', async () => {
    const fetchNode = vi.fn(async () => ({
      success: false as const,
      error: { status: 404, message: 'gone' },
    }))
    const h = harness({ nodes: [node('loaded')], fetchers: { fetchNode } })

    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'loaded' }])
    await h.reconciler.flush()

    expect(fetchNode).toHaveBeenCalledTimes(1)
    expect(h.store.remoteDeletedNodeIds.has('loaded')).toBe(true)
    expect(h.errors).not.toHaveBeenCalled()
  })

  it('marks an exhausted link stale and recovers it through the local retry queue', async () => {
    const fetchLink = vi.fn<
      (id: string, signal: AbortSignal) => Promise<ApiResult<LinkResponse>>
    >(async () => {
      throw new Error('offline')
    })
    const h = harness({ links: [link('loaded')], fetchers: { fetchLink } })

    h.reconciler.enqueue([{ type: 'link_updated', entity: 'link', id: 'loaded' }])
    await h.reconciler.flush()

    expect(h.store.staleLinkIds.has('loaded')).toBe(true)
    const retry = h.errors.mock.calls[0]?.[2] as (() => void) | undefined
    expect(retry).toEqual(expect.any(Function))

    fetchLink.mockImplementation(async () => success(link('loaded', { sourceId: 'fresh' })))
    retry?.()
    await h.reconciler.flush()

    expect(h.store.staleLinkIds.has('loaded')).toBe(false)
    expect(h.store.linkById.get('loaded')?.sourceId).toBe('fresh')
    expect(h.recovered).toHaveBeenCalledWith({
      type: 'link_updated',
      entity: 'link',
      id: 'loaded',
    })
  })

  it('surfaces diagram and model failures and clears them after explicit retries', async () => {
    const fetchDiagram = vi.fn<
      (id: string, signal: AbortSignal) => Promise<ApiResult<DiagramResponse>>
    >(async () => {
      throw new Error('diagram offline')
    })
    const fetchModel = vi.fn<
      (id: string, signal: AbortSignal) => Promise<ApiResult<ModelData>>
    >(async () => {
      throw new Error('model offline')
    })
    const h = harness({
      diagrams: [toEditorDiagram(diagram('diagram-1'), { attrsPending: false })],
      fetchers: { fetchDiagram, fetchModel },
    })

    h.reconciler.enqueue([
      { type: 'diagram_updated', entity: 'diagram', id: 'diagram-1' },
      { type: 'model_updated', entity: 'model', id: 'model-1' },
    ])
    await h.reconciler.flush()

    expect(h.state.diagrams[0]?._attrsPending).toBe(true)
    expect(h.errors).toHaveBeenCalledTimes(2)
    const retries = h.errors.mock.calls.map(call => call[2] as () => void)

    fetchDiagram.mockImplementation(async () =>
      success(diagram('diagram-1', { name: 'recovered diagram' }))
    )
    fetchModel.mockImplementation(async () => success(model({ name: 'recovered model' })))
    retries.forEach(retry => retry())
    await h.reconciler.flush()

    expect(h.recovered).toHaveBeenCalledWith({
      type: 'diagram_updated',
      entity: 'diagram',
      id: 'diagram-1',
    })
    expect(h.recovered).toHaveBeenCalledWith({
      type: 'model_updated',
      entity: 'model',
      id: 'model-1',
    })
  })

  it('turns a raced materialized create 404 into delete semantics', async () => {
    const fetchLink = vi.fn(async () => ({
      success: false as const,
      error: { status: 404, message: 'gone' },
    }))
    const h = harness({ links: [link('loaded')], fetchers: { fetchLink } })

    h.reconciler.enqueue([{ type: 'link_created', entity: 'link', id: 'loaded' }])
    await h.reconciler.flush()

    expect(fetchLink).toHaveBeenCalledTimes(1)
    expect(h.store.remoteDeletedLinkIds.has('loaded')).toBe(true)
    expect(h.store.linkById.has('loaded')).toBe(false)
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

  it('point-refreshes materialized node/link creates while protected local rows win', async () => {
    const dirtyNode = {
      ...toEditorNode(node('dirty-node', { name: 'local dirty node', parentNodeId: 'folder' })),
      _isDirty: true,
    }
    const dirtyLink = {
      ...toEditorLink(link('dirty-link', { sourceId: 'local-source' })),
      _isDirty: true,
    }
    const h = harness({
      nodes: [node('known-node', { name: 'local node', parentNodeId: 'folder' })],
      links: [link('known-link', { sourceId: 'local-source' })],
      fetchers: {
        fetchNode: vi.fn(async id =>
          success(node(id, { name: 'remote node', parentNodeId: 'folder' }))
        ),
        fetchLink: vi.fn(async id =>
          success(link(id, { sourceId: 'remote-source' }))
        ),
      },
    })
    h.store.replaceMaterializedRows(
      [...h.store.nodes, dirtyNode],
      [...h.store.links, dirtyLink]
    )
    loadScope(
      h.store,
      { kind: 'node', nodeId: 'folder' },
      [node('known-node', { name: 'local node', parentNodeId: 'folder' })]
    )

    h.reconciler.enqueue([
      { type: 'node_created', entity: 'node', id: 'known-node' },
      { type: 'node_created', entity: 'node', id: 'dirty-node' },
      { type: 'link_created', entity: 'link', id: 'known-link' },
      { type: 'link_created', entity: 'link', id: 'dirty-link' },
      { type: 'link_created', entity: 'link', id: 'unloaded-link' },
    ])
    await h.reconciler.flush()

    expect(h.store.nodeById.get('known-node')?.name).toBe('remote node')
    expect(h.store.nodeById.get('dirty-node')).toBe(dirtyNode)
    expect(h.store.linkById.get('known-link')?.sourceId).toBe('remote-source')
    expect(h.store.linkById.get('dirty-link')).toBe(dirtyLink)
    expect(h.store.linkById.has('unloaded-link')).toBe(false)
    expect(h.fetchers.fetchLink).toHaveBeenCalledTimes(2)
    expect(h.fetchers.fetchNode).toHaveBeenCalledTimes(2)
    expect(h.refreshedScopes).toEqual([
      { kind: 'node', nodeId: 'folder' },
      { kind: 'node', nodeId: 'folder' },
    ])
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

  it('cascade-deletes clean incident links but preserves protected links as conflicts', async () => {
    const cleanIncident = toEditorLink(link('clean-incident', { sourceId: 'deleted' }))
    const dirtyIncident = {
      ...toEditorLink(link('dirty-incident', { targetId: 'deleted' })),
      _isDirty: true,
    }
    const newIncident = {
      ...toEditorLink(link('new-incident', { sourceId: 'deleted' })),
      _isNew: true,
    }
    const unrelated = toEditorLink(
      link('unrelated', { sourceId: 'other-1', targetId: 'other-2' })
    )
    const h = harness()
    h.store.replaceMaterializedRows(
      [toEditorNode(node('deleted'))],
      [cleanIncident, dirtyIncident, newIncident, unrelated]
    )

    h.reconciler.enqueue([{ type: 'node_deleted', entity: 'node', id: 'deleted' }])
    await h.reconciler.flush()

    expect(h.store.linkById.has('clean-incident')).toBe(false)
    expect(h.store.linkById.get('dirty-incident')).toBe(dirtyIncident)
    expect(h.store.linkById.get('new-incident')).toBe(newIncident)
    expect(h.store.linkById.get('unrelated')).toBe(unrelated)
    expect(h.store.remoteDeletedLinkIds).toEqual(
      new Set(['clean-incident', 'dirty-incident', 'new-incident'])
    )
    expect(h.store.remoteCascadeConflictLinkIds).toEqual(
      new Set(['dirty-incident', 'new-incident'])
    )
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
      openDiagramId: 'diagram-1',
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

  it('marks a closed diagram attrs pending after its metadata update', async () => {
    const local = toEditorDiagram(
      diagram('diagram-1', {
        name: 'local',
        attrs: JSON.stringify({ instances: [{ id: 'hydrated' }] }),
      }),
      { attrsPending: false }
    )
    const h = harness({
      diagrams: [local],
      openDiagramId: 'other-diagram',
      fetchers: {
        fetchDiagram: vi.fn(async () =>
          success(diagram('diagram-1', { name: 'remote', attrs: null }))
        ),
      },
    })

    h.reconciler.enqueue([{ type: 'diagram_updated', entity: 'diagram', id: 'diagram-1' }])
    await h.reconciler.flush()

    expect(h.state.diagrams[0]?.name).toBe('remote')
    expect(h.state.diagrams[0]?._attrsPending).toBe(true)
    expect(h.state.diagrams[0]?.parsedAttrs.instances).toEqual({ nodes: [], edges: [] })
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

  it('retains create intent when an update is enqueued before the same drain', async () => {
    const h = harness({
      fetchers: {
        fetchNode: vi.fn(async id =>
          success(node(id, { parentNodeId: 'folder', name: 'latest' }))
        ),
      },
    })
    loadScope(h.store, { kind: 'node', nodeId: 'folder' }, [])

    h.reconciler.enqueue([{ type: 'node_created', entity: 'node', id: 'created' }])
    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'created' }])
    await h.reconciler.flush()

    expect(h.fetchers.fetchNode).toHaveBeenCalledTimes(1)
    expect(h.refreshedScopes).toEqual([{ kind: 'node', nodeId: 'folder' }])
  })

  it('serializes an update arriving during an active create without aborting materialization', async () => {
    const first = deferred<ApiResult<NodeResponse>>()
    let firstSignal: AbortSignal | undefined
    const fetchNode = vi
      .fn()
      .mockImplementationOnce((_id, signal: AbortSignal) => {
        firstSignal = signal
        return first.promise
      })
      .mockResolvedValueOnce(success(node('same', { name: 'follow-up' })))
    const h = harness({ nodes: [node('same', { name: 'local' })], fetchers: { fetchNode } })

    h.reconciler.enqueue([{ type: 'node_created', entity: 'node', id: 'same' }])
    await Promise.resolve()
    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'same' }])

    expect(firstSignal?.aborted).toBe(false)
    first.resolve(success(node('same', { name: 'first' })))
    await h.reconciler.flush()

    expect(fetchNode).toHaveBeenCalledTimes(2)
    expect(h.store.nodeById.get('same')?.name).toBe('follow-up')
  })

  it('limits concurrent point operations to four', async () => {
    const requests = Array.from({ length: 6 }, () => deferred<ApiResult<NodeResponse>>())
    let active = 0
    let maxActive = 0
    const fetchNode = vi.fn((id: string) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      const index = Number(id.slice('node-'.length))
      return requests[index]!.promise.finally(() => {
        active -= 1
      })
    })
    const h = harness({
      nodes: Array.from({ length: 6 }, (_, index) => node(`node-${index}`)),
      fetchers: { fetchNode },
    })

    h.reconciler.enqueue(
      Array.from({ length: 6 }, (_, index) => ({
        type: 'node_updated',
        entity: 'node',
        id: `node-${index}`,
      }))
    )
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchNode).toHaveBeenCalledTimes(4)
    requests.slice(0, 4).forEach((request, index) =>
      request.resolve(success(node(`node-${index}`, { name: `done-${index}` })))
    )
    await vi.waitFor(() => expect(fetchNode).toHaveBeenCalledTimes(6))
    requests.slice(4).forEach((request, offset) =>
      request.resolve(success(node(`node-${offset + 4}`)))
    )
    await h.reconciler.flush()
    expect(maxActive).toBe(4)
  })

  it('backs off before the bounded transient point retry', async () => {
    vi.useFakeTimers()
    const fetchNode = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: { status: 503, message: 'temporary' },
      })
      .mockResolvedValueOnce(success(node('loaded', { name: 'recovered' })))
    const h = harness({ nodes: [node('loaded')], fetchers: { fetchNode } })

    h.reconciler.enqueue([{ type: 'node_updated', entity: 'node', id: 'loaded' }])
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchNode).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(99)
    expect(fetchNode).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await h.reconciler.flush()

    expect(fetchNode).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('observes rejected granular handlers instead of dropping allSettled results', async () => {
    const handlerError = new Error('bounded refresh failed')
    const h = harness({
      fetchers: {
        fetchNode: vi.fn(async id => success(node(id, { parentNodeId: 'folder' }))),
      },
      refreshVisibleChildrenScope: vi.fn(async () => {
        throw handlerError
      }),
    })
    loadScope(h.store, { kind: 'node', nodeId: 'folder' }, [])

    h.reconciler.enqueue([{ type: 'node_created', entity: 'node', id: 'created' }])
    await h.reconciler.flush()

    expect(h.errors).toHaveBeenCalledWith(
      { type: 'node_created', entity: 'node', id: 'created' },
      handlerError,
      expect.any(Function)
    )
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
