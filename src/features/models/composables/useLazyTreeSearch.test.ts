import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelSearchResponse, NodeResponse } from '@/types/api'
import { fetchNodeAncestors, resolveModelNodes, searchModelNodes } from './modelScopedApi'
import { useLazyTreeSearch } from './useLazyTreeSearch'

vi.mock('./modelScopedApi', () => ({
  fetchNodeAncestors: vi.fn(),
  resolveModelNodes: vi.fn(),
  searchModelNodes: vi.fn(),
}))

const searchModelNodesMock = vi.mocked(searchModelNodes)
const fetchNodeAncestorsMock = vi.mocked(fetchNodeAncestors)
const resolveModelNodesMock = vi.mocked(resolveModelNodes)

const ok = <T>(data: T) => ({ success: true as const, data })
const searchResponse = (q: string, ids: string[]): ModelSearchResponse => ({
  modelId: 'model-1',
  q,
  limit: 50,
  totalEstimate: ids.length,
  hits: ids.map(id => ({ kind: 'node', id, name: id, parentId: 'folder' })),
})
const node = (id: string, parentNodeId: string | null): NodeResponse => ({
  id,
  name: id,
  modelId: 'model-1',
  ownerId: 'owner-1',
  nodeTypeId: 'type-1',
  parentNodeId,
})

describe('useLazyTreeSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces server-only node search for 200 ms with the fixed limit', async () => {
    searchModelNodesMock.mockResolvedValue(ok(searchResponse('special', ['hit'])))
    const query = ref('')
    const scope = effectScope()
    const search = scope.run(() =>
      useLazyTreeSearch({
        modelId: ref('model-1'),
        treeRootNodeId: ref('hidden-root'),
        query,
        mergeNodes: vi.fn(() => true),
        beginRequest: () => ({ generation: 1, requestKey: 'search', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    query.value = 'special'
    await nextTick()
    await vi.advanceTimersByTimeAsync(199)
    expect(searchModelNodesMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(searchModelNodesMock).toHaveBeenCalledWith('model-1', 'special', {
      limit: 50,
      signal: expect.any(AbortSignal),
    })
    expect(search.hits.value.map(hit => hit.id)).toEqual(['hit'])
    scope.stop()
  })

  it('ignores a stale response even when abort does not settle the old request', async () => {
    let resolveOld!: (value: ReturnType<typeof ok<ModelSearchResponse>>) => void
    searchModelNodesMock
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve
          })
      )
      .mockResolvedValueOnce(ok(searchResponse('new', ['new-hit'])))
    const query = ref('')
    const scope = effectScope()
    const search = scope.run(() =>
      useLazyTreeSearch({
        modelId: ref('model-1'),
        treeRootNodeId: ref(null),
        query,
        mergeNodes: vi.fn(() => true),
        beginRequest: () => ({ generation: 1, requestKey: 'search', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    query.value = 'old'
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    query.value = 'new'
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    expect(search.hits.value.map(hit => hit.id)).toEqual(['new-hit'])

    resolveOld(ok(searchResponse('old', ['old-hit'])))
    await Promise.resolve()

    expect(search.hits.value.map(hit => hit.id)).toEqual(['new-hit'])
    scope.stop()
  })

  it('loads ordered ancestors before the selected node and merges them as partial rows', async () => {
    const ancestors = [node('folder-a', 'hidden-root'), node('folder-b', 'folder-a')]
    const selected = node('hit', 'folder-b')
    fetchNodeAncestorsMock.mockResolvedValue(ok(ancestors))
    resolveModelNodesMock.mockResolvedValue(ok({ nodes: [selected], missingIds: [] }))
    const mergeNodes = vi.fn(() => true)
    const guard = { generation: 7, requestKey: 'tree-search-select', token: 3 }
    const scope = effectScope()
    const search = scope.run(() =>
      useLazyTreeSearch({
        modelId: ref('model-1'),
        treeRootNodeId: ref('hidden-root'),
        query: ref('hit'),
        mergeNodes,
        beginRequest: () => guard,
        isRequestCurrent: request => request === guard,
      })
    )!

    const path = await search.selectHit('hit')

    expect(fetchNodeAncestorsMock).toHaveBeenCalledWith(
      'model-1',
      'hit',
      expect.any(AbortSignal)
    )
    expect(resolveModelNodesMock).toHaveBeenCalledWith(
      'model-1',
      ['hit'],
      expect.any(AbortSignal)
    )
    expect(fetchNodeAncestorsMock.mock.invocationCallOrder[0]).toBeLessThan(
      resolveModelNodesMock.mock.invocationCallOrder[0]!
    )
    expect(mergeNodes).toHaveBeenCalledWith([...ancestors, selected], guard)
    expect(path).toEqual(['folder-a', 'folder-b', 'hit'])
    scope.stop()
  })

  it('omits a hidden root from an ancestor response before partial merge', async () => {
    const hiddenRoot = node('hidden-root', null)
    const folder = node('folder', 'hidden-root')
    const selected = node('hit', 'folder')
    fetchNodeAncestorsMock.mockResolvedValue(ok([hiddenRoot, folder]))
    resolveModelNodesMock.mockResolvedValue(ok({ nodes: [selected], missingIds: [] }))
    const mergeNodes = vi.fn(() => true)
    const scope = effectScope()
    const search = scope.run(() =>
      useLazyTreeSearch({
        modelId: ref('model-1'),
        treeRootNodeId: ref('hidden-root'),
        query: ref('hit'),
        mergeNodes,
        beginRequest: () => ({ generation: 1, requestKey: 'select', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    expect(await search.selectHit('hit')).toEqual(['folder', 'hit'])
    const mergedRows = mergeNodes.mock.calls[0] as unknown as [NodeResponse[]]
    expect(mergedRows[0].map(row => row.id)).toEqual(['folder', 'hit'])
    scope.stop()
  })

  it('keeps search errors local, retries, and treats cancellation as silent', async () => {
    searchModelNodesMock
      .mockResolvedValueOnce({
        success: false,
        error: { status: 503, message: 'search failed' },
      })
      .mockResolvedValueOnce(ok(searchResponse('retry', ['hit'])))
    const query = ref('')
    const scope = effectScope()
    const search = scope.run(() =>
      useLazyTreeSearch({
        modelId: ref('model-1'),
        treeRootNodeId: ref(null),
        query,
        mergeNodes: vi.fn(() => true),
        beginRequest: () => ({ generation: 1, requestKey: 'search', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    query.value = 'retry'
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    expect(search.error.value).toBe('search failed')

    await search.retry()
    expect(search.error.value).toBeNull()
    expect(search.hits.value.map(hit => hit.id)).toEqual(['hit'])

    query.value = 'cancelled'
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    query.value = ''
    await nextTick()
    expect(search.error.value).toBeNull()
    expect(search.loading.value).toBe(false)
    expect(search.hits.value).toEqual([])
    scope.stop()
  })

  it('keeps selected-hit errors local and retries the same node', async () => {
    fetchNodeAncestorsMock
      .mockResolvedValueOnce({
        success: false,
        error: { status: 503, message: 'ancestors failed' },
      })
      .mockResolvedValueOnce(ok([node('folder', 'hidden-root')]))
    resolveModelNodesMock.mockResolvedValue(
      ok({ nodes: [node('hit', 'folder')], missingIds: [] })
    )
    const mergeNodes = vi.fn(() => true)
    const scope = effectScope()
    const search = scope.run(() =>
      useLazyTreeSearch({
        modelId: ref('model-1'),
        treeRootNodeId: ref('hidden-root'),
        query: ref('hit'),
        mergeNodes,
        beginRequest: () => ({ generation: 1, requestKey: 'select', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    expect(await search.selectHit('hit')).toEqual([])
    expect(search.selectionError.value).toBe('ancestors failed')

    expect(await search.retrySelection()).toEqual(['folder', 'hit'])
    expect(search.selectionError.value).toBeNull()
    expect(mergeNodes).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('aborts selected-path loading when the model generation changes', async () => {
    let finishAncestors!: (value: ReturnType<typeof ok<NodeResponse[]>>) => void
    fetchNodeAncestorsMock.mockImplementation(
      () =>
        new Promise(resolve => {
          finishAncestors = resolve
        })
    )
    const modelId = ref('model-1')
    const mergeNodes = vi.fn(() => true)
    const scope = effectScope()
    const search = scope.run(() =>
      useLazyTreeSearch({
        modelId,
        treeRootNodeId: ref(null),
        query: ref('hit'),
        mergeNodes,
        beginRequest: () => ({ generation: 1, requestKey: 'select', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    const selecting = search.selectHit('hit')
    const signal = fetchNodeAncestorsMock.mock.calls[0]?.[2]
    modelId.value = 'model-2'
    await nextTick()

    expect(signal?.aborted).toBe(true)
    finishAncestors(ok([]))
    await expect(selecting).resolves.toEqual([])
    expect(resolveModelNodesMock).not.toHaveBeenCalled()
    expect(mergeNodes).not.toHaveBeenCalled()
    scope.stop()
  })

  it('invalidates an in-flight selected path when the query changes', async () => {
    fetchNodeAncestorsMock.mockResolvedValue(ok([node('folder', 'hidden-root')]))
    let finishResolve!: (
      value: ReturnType<typeof ok<{ nodes: NodeResponse[]; missingIds: string[] }>>
    ) => void
    resolveModelNodesMock.mockImplementation(
      () =>
        new Promise(resolve => {
          finishResolve = resolve
        })
    )
    const query = ref('old query')
    const mergeNodes = vi.fn(() => true)
    const scope = effectScope()
    const search = scope.run(() =>
      useLazyTreeSearch({
        modelId: ref('model-1'),
        treeRootNodeId: ref('hidden-root'),
        query,
        mergeNodes,
        beginRequest: () => ({ generation: 1, requestKey: 'select', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    const selecting = search.selectHit('hit')
    await Promise.resolve()
    const resolveSignal = resolveModelNodesMock.mock.calls[0]?.[2]
    query.value = 'new query'
    await nextTick()

    expect(resolveSignal?.aborted).toBe(true)
    finishResolve(ok({ nodes: [node('hit', 'folder')], missingIds: [] }))
    await expect(selecting).resolves.toEqual([])
    expect(mergeNodes).not.toHaveBeenCalled()
    expect(search.selectionLoading.value).toBe(false)
    expect(search.selectionError.value).toBeNull()
    scope.stop()
  })

  it('cancels search and selected-path work through one explicit cancel operation', async () => {
    let finishAncestors!: (value: ReturnType<typeof ok<NodeResponse[]>>) => void
    fetchNodeAncestorsMock.mockImplementation(
      () =>
        new Promise(resolve => {
          finishAncestors = resolve
        })
    )
    const mergeNodes = vi.fn(() => true)
    const scope = effectScope()
    const search = scope.run(() =>
      useLazyTreeSearch({
        modelId: ref('model-1'),
        treeRootNodeId: ref(null),
        query: ref('hit'),
        mergeNodes,
        beginRequest: () => ({ generation: 1, requestKey: 'select', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    const selecting = search.selectHit('hit')
    const signal = fetchNodeAncestorsMock.mock.calls[0]?.[2]
    search.cancel()

    expect(signal?.aborted).toBe(true)
    finishAncestors(ok([]))
    await expect(selecting).resolves.toEqual([])
    expect(await search.retrySelection()).toEqual([])
    expect(mergeNodes).not.toHaveBeenCalled()
    scope.stop()
  })

  it('rechecks an external route generation after each selected-path await', async () => {
    fetchNodeAncestorsMock.mockResolvedValue(ok([node('folder', 'hidden-root')]))
    let finishResolve!: (
      value: ReturnType<typeof ok<{ nodes: NodeResponse[]; missingIds: string[] }>>
    ) => void
    resolveModelNodesMock.mockImplementation(
      () =>
        new Promise(resolve => {
          finishResolve = resolve
        })
    )
    let routeCurrent = true
    const mergeNodes = vi.fn(() => true)
    const scope = effectScope()
    const search = scope.run(() =>
      useLazyTreeSearch({
        modelId: ref('model-1'),
        treeRootNodeId: ref('hidden-root'),
        query: ref('hit'),
        mergeNodes,
        beginRequest: () => ({ generation: 1, requestKey: 'select', token: 1 }),
        isRequestCurrent: () => true,
      })
    )!

    const selecting = search.selectHit('hit', () => routeCurrent)
    await Promise.resolve()
    routeCurrent = false
    finishResolve(ok({ nodes: [node('hit', 'folder')], missingIds: [] }))

    await expect(selecting).resolves.toEqual([])
    expect(mergeNodes).not.toHaveBeenCalled()
    scope.stop()
  })
})
