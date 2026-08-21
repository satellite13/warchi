import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeResponse } from '@/types/api'
import type { PaginatedResponse } from '@/types/entities'
import { createEmptyModelEditorState } from '../types'
import { fetchNodeChildren } from './modelScopedApi'
import { toEditorNode } from './modelEditorMappers'
import { useModelPartialStore } from './useModelPartialStore'

vi.mock('./modelScopedApi', () => ({
  fetchNodeChildren: vi.fn(),
}))

const node = (id: string, parentNodeId: string | null = null): NodeResponse => ({
  id,
  name: id,
  modelId: 'model-a',
  ownerId: 'owner-1',
  nodeTypeId: 'type-1',
  parentNodeId,
  attrs: null,
  hasChildren: false,
})

const page = (
  content: NodeResponse[],
  number = 0,
  totalElements = content.length,
  totalPages = 1
): PaginatedResponse<NodeResponse> => ({
  content,
  page: { number, size: 500, totalElements, totalPages },
})

const deferred = <T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useModelPartialStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deduplicates concurrent loads for the same parent scope', async () => {
    const response = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren).mockReturnValue(response.promise)
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')

    const first = partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })
    const second = partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })

    expect(fetchNodeChildren).toHaveBeenCalledTimes(1)
    response.resolve({ success: true, data: page([node('child-1', 'parent-1')]) })
    await Promise.all([first, second])
    expect(state.value.nodes.map(row => row.id)).toEqual(['child-1'])
    scope.stop()
  })

  it('lists only explicitly materialized parent scopes for bounded reconciliation', async () => {
    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({ success: true, data: page([node('root-leaf')]) })
      .mockResolvedValueOnce({
        success: true,
        data: page([node('nested-leaf', 'parent-1')]),
      })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')

    await partial.loadChildren({ kind: 'root' })
    await partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })

    expect(partial.materializedChildrenScopes()).toEqual([
      { kind: 'root' },
      { kind: 'node', nodeId: 'parent-1' },
    ])
    expect(partial.materializedChildrenScopes()).not.toContainEqual({
      kind: 'node',
      nodeId: 'root-leaf',
    })
    scope.stop()
  })

  it('ignores an old model response after the generation changes', async () => {
    const response = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren).mockReturnValue(response.promise)
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')
    const oldLoad = partial.loadChildren({ kind: 'root' })

    partial.resetPartialScopes('model-b')
    response.resolve({ success: true, data: page([node('stale-a')]) })
    await oldLoad

    expect(state.value.nodes).toEqual([])
    expect(state.value.modelId).toBe('model-b')
    scope.stop()
  })

  it('keeps a failed child error local and retries only that scope', async () => {
    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({
        success: false,
        error: { status: 503, message: 'branch unavailable' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: page([node('child-1', 'parent-1')]),
      })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')

    await partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })
    expect(partial.childrenErrors.value.get('node:parent-1')).toBe('branch unavailable')
    expect(partial.childrenErrors.value.has('node:parent-2')).toBe(false)

    await partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })
    expect(fetchNodeChildren).toHaveBeenCalledTimes(2)
    expect(partial.childrenErrors.value.has('node:parent-1')).toBe(false)
    expect(state.value.nodes.map(row => row.id)).toEqual(['child-1'])
    scope.stop()
  })

  it('keeps local materialized rows when a remote child page is merged', async () => {
    vi.mocked(fetchNodeChildren).mockResolvedValue({
      success: true,
      data: page([node('remote-child', 'parent-1')]),
    })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')
    state.value.nodes = [
      {
        ...node('local-new', 'parent-1'),
        parsedAttrs: {
          treeOrder: 0,
          notationComponents: {},
          componentProperties: {},
          typeProperties: {},
        },
        _isNew: true,
      },
    ]

    await partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })

    expect(state.value.nodes.map(row => row.id).sort()).toEqual(['local-new', 'remote-child'])
    scope.stop()
  })

  it('reconciles save-style removals before the next remote merge without resurrection', async () => {
    vi.mocked(fetchNodeChildren).mockResolvedValue({
      success: true,
      data: page([node('other-child', 'other-parent')]),
    })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('saved-delete'), node('kept')]),
    })

    state.value.nodes = [toEditorNode(node('kept'))]
    partial.reconcileMaterializedRows()
    await partial.loadChildren({ kind: 'node', nodeId: 'other-parent' })

    expect(state.value.nodes.map(row => row.id).sort()).toEqual(['kept', 'other-child'])
    expect(partial.store.nodeById.has('saved-delete')).toBe(false)
    expect(partial.store.childrenByParent.get('root')).toEqual(['kept'])
    scope.stop()
  })

  it('reconciles live-sync-style replacements to one ID and exact link indexes', async () => {
    vi.mocked(fetchNodeChildren).mockResolvedValue({
      success: true,
      data: page([node('other-child', 'other-parent')]),
    })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('synced')]),
    })
    partial.mergeFullLinks([
      {
        id: 'removed-link',
        modelId: 'model-a',
        ownerId: 'owner-1',
        linkTypeId: 'link-type-1',
        sourceId: 'synced',
        targetId: 'synced',
        parsedAttrs: { notationRelations: {}, relationProperties: {}, typeProperties: {} },
      },
    ])
    const updated = toEditorNode({ ...node('synced'), name: 'Synced update' })

    state.value.nodes = [updated, updated]
    state.value.links = []
    partial.reconcileMaterializedRows()
    await partial.loadChildren({ kind: 'node', nodeId: 'other-parent' })

    expect(state.value.nodes.filter(row => row.id === 'synced')).toEqual([updated])
    expect(partial.store.nodeById.get('synced')?.name).toBe('Synced update')
    expect(state.value.links).toEqual([])
    expect(partial.store.linkById.has('removed-link')).toBe(false)
    scope.stop()
  })

  it('rebuilds complete scopes and invalidates incomplete paging after exact reconciliation', async () => {
    vi.mocked(fetchNodeChildren).mockResolvedValue({
      success: true,
      data: page([node('partial-child', 'parent-1')], 0, 501, 2),
    })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('removed-root'), node('kept-root')]),
    })
    await partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })
    expect(partial.store.childrenPages.has('node:parent-1')).toBe(true)

    state.value.nodes = state.value.nodes.filter(row => row.id !== 'removed-root')
    partial.reconcileMaterializedRows()

    expect(partial.store.nodeById.has('removed-root')).toBe(false)
    expect(partial.store.loadedChildrenFor.has('root')).toBe(true)
    expect(partial.store.childrenPages.get('root')?.totalElements).toBe(1)
    expect(partial.store.childrenPages.has('node:parent-1')).toBe(false)
    scope.stop()
  })

  it('rebuilds parent indexes when an in-place move changes node scope', () => {
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('moving', 'hidden-root')]),
    })

    state.value.nodes[0]!.parentNodeId = 'destination'
    partial.reconcileMaterializedRows()

    expect(partial.store.childrenByParent.get('root')).toEqual([])
    expect(partial.store.childrenByParent.get('node:destination')).toEqual(['moving'])
    scope.stop()
  })

  it('keeps explicit root provenance when the initial root page is empty', () => {
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([]),
      rootParentNodeId: 'hidden-root',
    })

    state.value.nodes.push(toEditorNode(node('local-root', 'hidden-root')))
    partial.reconcileMaterializedRows()

    expect(partial.store.childrenByParent.get('root')).toEqual(['local-root'])
    expect(partial.store.childrenByParent.has('node:hidden-root')).toBe(false)
    scope.stop()
  })

  it('preserves unrelated paged root metadata while reconciling a complete child scope', async () => {
    vi.mocked(fetchNodeChildren).mockImplementation(async (_modelId, targetScope, options) => {
      if (targetScope.kind === 'node' && targetScope.nodeId === 'folder') {
        return { success: true, data: page([node('existing-child', 'folder')]) }
      }
      if (targetScope.kind === 'root' && options?.page === 1) {
        return { success: true, data: page([node('root-page-2')], 1, 3, 2) }
      }
      throw new Error(`Unexpected page request: ${targetScope.kind}/${options?.page}`)
    })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page(
        [
          { ...node('folder'), hasChildren: true },
          node('root-page-1'),
        ],
        0,
        3,
        2
      ),
    })
    await partial.loadChildren({ kind: 'node', nodeId: 'folder' })
    expect(partial.store.loadedChildrenFor.has('node:folder')).toBe(true)
    expect(partial.store.childrenPages.get('root')?.nextPage).toBe(1)

    state.value.nodes.push(toEditorNode(node('new-child', 'folder')))
    partial.reconcileMaterializedRows([{ kind: 'node', nodeId: 'folder' }])

    expect(partial.store.childrenPages.get('root')).toMatchObject({
      nextPage: 1,
      totalElements: 3,
    })
    expect(partial.store.childrenPages.get('root')?.loadedPages).toEqual(new Set([0]))

    await partial.loadNextChildrenPage({ kind: 'root' })

    expect(fetchNodeChildren).toHaveBeenLastCalledWith(
      'model-a',
      { kind: 'root' },
      expect.objectContaining({ page: 1 })
    )
    expect(partial.store.loadedChildrenFor.has('root')).toBe(true)
    expect(state.value.nodes.map(row => row.id)).toEqual(
      expect.arrayContaining(['folder', 'root-page-1', 'root-page-2', 'new-child'])
    )
    scope.stop()
  })

  it('materializes hasChildren=false as a complete empty child scope', () => {
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!

    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('empty-folder')]),
    })

    expect(partial.store.loadedChildrenFor.has('node:empty-folder')).toBe(true)
    expect(partial.store.childrenPages.get('node:empty-folder')).toMatchObject({
      nextPage: null,
      totalElements: 0,
    })
    scope.stop()
  })

  it('atomically refreshes page zero through the previously visible page', async () => {
    vi.mocked(fetchNodeChildren).mockResolvedValueOnce({
      success: true,
      data: page([node('old-page-1')], 1, 1500, 3),
    })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('old-page-0')], 0, 1500, 3),
    })
    await partial.loadNextChildrenPage({ kind: 'root' })

    const secondPage = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({
        success: true,
        data: page([node('new-page-0')], 0, 1500, 3),
      })
      .mockReturnValueOnce(secondPage.promise)

    const refreshing = partial.refreshVisibleChildrenScope({ kind: 'root' })
    await Promise.resolve()
    await Promise.resolve()

    expect(state.value.nodes.map(row => row.id)).toEqual(['old-page-0', 'old-page-1'])
    secondPage.resolve({
      success: true,
      data: page([node('new-page-1')], 1, 1500, 3),
    })
    await refreshing

    expect(
      vi.mocked(fetchNodeChildren).mock.calls.slice(-2).map(([, , options]) => options?.page)
    ).toEqual([0, 1])
    expect(state.value.nodes.map(row => row.id)).toEqual(['new-page-0', 'new-page-1'])
    expect(partial.store.childrenPages.get('root')?.nextPage).toBe(2)
    scope.stop()
  })

  it('refreshes a previously complete parent through the new last page', async () => {
    vi.mocked(fetchNodeChildren).mockResolvedValueOnce({
      success: true,
      data: page([node('old-page-1')], 1, 2, 2),
    })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('old-page-0')], 0, 2, 2),
    })
    await partial.loadNextChildrenPage({ kind: 'root' })
    expect(partial.store.loadedChildrenFor.has('root')).toBe(true)

    vi.mocked(fetchNodeChildren).mockImplementation(async (_modelId, _scope, options) => {
      const pageNumber = options?.page ?? 0
      return {
        success: true,
        data: page([node(`new-page-${pageNumber}`)], pageNumber, 3, 3),
      }
    })

    await partial.refreshVisibleChildrenScope({ kind: 'root' })

    expect(
      vi.mocked(fetchNodeChildren).mock.calls.slice(-3).map(([, , options]) => options?.page)
    ).toEqual([0, 1, 2])
    expect(state.value.nodes.map(row => row.id)).toEqual([
      'new-page-0',
      'new-page-1',
      'new-page-2',
    ])
    expect(partial.store.loadedChildrenFor.has('root')).toBe(true)
    scope.stop()
  })

  it('retries a failed bounded refresh with prior rows and visible metadata intact', async () => {
    vi.mocked(fetchNodeChildren).mockResolvedValueOnce({
      success: true,
      data: page([node('old-page-1')], 1, 2, 2),
    })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('old-page-0')], 0, 2, 2),
    })
    await partial.loadNextChildrenPage({ kind: 'root' })

    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({
        success: true,
        data: page([node('failed-new-page-0')], 0, 2, 2),
      })
      .mockResolvedValueOnce({
        success: false,
        error: { status: 503, message: 'refresh failed' },
      })

    await expect(
      partial.refreshVisibleChildrenScope({ kind: 'root' }, new AbortController().signal)
    ).rejects.toThrow('refresh failed')

    expect(state.value.nodes.map(row => row.id)).toEqual(['old-page-0', 'old-page-1'])
    expect(partial.store.loadedChildrenFor.has('root')).toBe(true)
    expect(partial.store.childrenPages.get('root')?.loadedPages).toEqual(new Set([0, 1]))
    expect(partial.childrenErrors.value.get('root')).toBe('refresh failed')
    const failedRefreshSignal = vi.mocked(fetchNodeChildren).mock.calls.at(-2)?.[2]?.signal

    vi.mocked(fetchNodeChildren).mockImplementation(async (_modelId, _scope, options) => {
      const pageNumber = options?.page ?? 0
      return {
        success: true,
        data: page([node(`retried-page-${pageNumber}`)], pageNumber, 2, 2),
      }
    })
    await partial.loadChildren({ kind: 'root' })

    expect(
      vi.mocked(fetchNodeChildren).mock.calls.slice(-2).map(([, , options]) => options?.page)
    ).toEqual([0, 1])
    expect(vi.mocked(fetchNodeChildren).mock.calls.at(-2)?.[2]?.signal).not.toBe(
      failedRefreshSignal
    )
    expect(state.value.nodes.map(row => row.id)).toEqual(['retried-page-0', 'retried-page-1'])
    expect(partial.childrenErrors.value.has('root')).toBe(false)
    scope.stop()
  })

  it('queues one follow-up bounded refresh requested during an in-flight refresh', async () => {
    const first = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    const followUp = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(followUp.promise)
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('old')]),
    })

    const refreshing = partial.refreshVisibleChildrenScope({ kind: 'root' })
    const queued = partial.refreshVisibleChildrenScope({ kind: 'root' })
    const coalesced = partial.refreshVisibleChildrenScope({ kind: 'root' })
    expect(fetchNodeChildren).toHaveBeenCalledTimes(1)

    first.resolve({ success: true, data: page([node('first-read')]) })
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchNodeChildren).toHaveBeenCalledTimes(2)

    followUp.resolve({ success: true, data: page([node('follow-up-read')]) })
    await Promise.all([refreshing, queued, coalesced])

    expect(fetchNodeChildren).toHaveBeenCalledTimes(2)
    expect(state.value.nodes.map(row => row.id)).toEqual(['follow-up-read'])
    scope.stop()
  })

  it('aborts a visible scope refresh and rejects its late result after reset', async () => {
    const response = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren).mockReturnValue(response.promise)
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('old')]),
    })

    const refreshing = partial.refreshVisibleChildrenScope({ kind: 'root' })
    const signal = vi.mocked(fetchNodeChildren).mock.calls[0]?.[2]?.signal
    partial.resetPartialScopes('model-b')
    expect(signal?.aborted).toBe(true)

    response.resolve({ success: true, data: page([node('stale')]) })
    await refreshing
    expect(state.value.modelId).toBe('model-b')
    expect(state.value.nodes).toEqual([])
    scope.stop()
  })

  it('threads an external abort through every bounded refresh page and ignores late rows', async () => {
    const secondPage = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({
        success: true,
        data: page([node('new-page-0')], 0, 2, 2),
      })
      .mockReturnValueOnce(secondPage.promise)
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a', {
      scope: { kind: 'root' },
      page: page([node('old')]),
    })
    const controller = new AbortController()

    const refreshing = partial.refreshVisibleChildrenScope({ kind: 'root' }, controller.signal)
    await vi.waitFor(() => expect(fetchNodeChildren).toHaveBeenCalledTimes(2))
    const requestSignals = vi
      .mocked(fetchNodeChildren)
      .mock.calls.map(([, , options]) => options?.signal)

    controller.abort()
    expect(requestSignals.every(signal => signal?.aborted)).toBe(true)
    secondPage.resolve({
      success: true,
      data: page([node('late-page-1')], 1, 2, 2),
    })
    await refreshing

    expect(state.value.nodes.map(row => row.id)).toEqual(['old'])
    expect(partial.childrenErrors.value.has('root')).toBe(false)
    scope.stop()
  })

  it('aborts paging and rejects its stale result on reset', async () => {
    const response = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren).mockReturnValue(response.promise)
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')
    const loading = partial.loadNextChildrenPage({ kind: 'node', nodeId: 'parent-1' })
    const signal = vi.mocked(fetchNodeChildren).mock.calls[0]?.[2]?.signal

    partial.resetPartialScopes('model-a')
    expect(signal?.aborted).toBe(true)
    response.resolve({ success: true, data: page([node('stale-child', 'parent-1')], 0) })
    await loading

    expect(state.value.nodes).toEqual([])
    expect(partial.childrenLoading.value.size).toBe(0)
    scope.stop()
  })
})
