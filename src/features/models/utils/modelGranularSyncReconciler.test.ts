import { describe, expect, it, vi } from 'vitest'
import type { ApiResult } from '@/composables/useApi'
import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
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
} = {}) {
  const store = new ModelPartialStore()
  store.setRootParentNodeId(null)
  store.mergeNodes((options.nodes ?? []).map(toEditorNode), { kind: 'partial' })
  store.mergeLinks((options.links ?? []).map(toEditorLink), { kind: 'partial' })
  const state = createEmptyModelEditorState()
  state.modelId = 'model-1'
  state.diagrams = options.diagrams ?? []
  const refreshedScopes: TreeParentScope[] = []
  const invalidatedDetached = vi.fn()
  const unknown = vi.fn()
  const fetchers: ModelGranularSyncFetchers = {
    fetchNode: vi.fn(async id => success(node(id))),
    fetchLink: vi.fn(async id => success(link(id))),
    fetchDiagram: vi.fn(async id => success(diagram(id))),
    ...options.fetchers,
  }
  const reconciler = createModelGranularSyncReconciler({
    modelId: () => state.modelId,
    store,
    diagrams: () => state.diagrams,
    replaceDiagrams: rows => {
      state.diagrams = rows
    },
    publishMaterializedRows: () => {
      state.nodes = store.nodes
      state.links = store.links
    },
    refreshChildrenScope: async scope => {
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
