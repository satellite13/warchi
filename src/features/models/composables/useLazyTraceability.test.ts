import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DiagramReferenceResponse,
  GraphNeighborResponse,
  LinkResponse,
  NodeResponse,
} from '@/types/api'
import type { PaginatedResponse } from '@/types/entities'
import { ModelPartialStore } from '../utils/modelPartialStore'
import { toEditorLink, toEditorNode } from './modelEditorMappers'
import { fetchDiagramReferences, fetchGraphNeighbors } from './modelScopedApi'
import {
  lazyTraceabilityBranchPageKey,
  useLazyTraceability,
  type TraceabilityBranchQuery,
} from './useLazyTraceability'

vi.mock('./modelScopedApi', () => ({
  fetchGraphNeighbors: vi.fn(),
  fetchDiagramReferences: vi.fn(),
}))

const node = (id: string, name = id): NodeResponse => ({
  id,
  name,
  modelId: 'model-1',
  ownerId: 'owner-1',
  nodeTypeId: 'node-type-1',
  attrs: null,
})

const link = (
  id: string,
  sourceId: string,
  targetId: string,
  linkTypeId = 'link-type-1'
): LinkResponse => ({
  id,
  sourceId,
  targetId,
  linkTypeId,
  modelId: 'model-1',
  ownerId: 'owner-1',
  attrs: null,
})

const neighbor = (
  linkId: string,
  sourceId: string,
  targetId: string,
  nextNodeId: string,
  linkTypeId = 'link-type-1'
): GraphNeighborResponse => ({
  link: link(linkId, sourceId, targetId, linkTypeId),
  node: node(nextNodeId),
})

const diagram = (id: string): DiagramReferenceResponse => ({
  id,
  name: id,
  version: '1.0.0',
  notationId: 'notation-1',
  nodeId: null,
})

const page = <T>(
  content: T[],
  pageNumber: number,
  totalPages: number,
  totalElements = content.length
): PaginatedResponse<T> => ({
  content,
  page: {
    number: pageNumber,
    size: 50,
    totalElements,
    totalPages,
  },
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

const outgoing = (nodeId: string, linkTypeId: string | null = null): TraceabilityBranchQuery => ({
  nodeId,
  direction: 'outgoing',
  linkTypeId,
})

function setup(
  modelId = ref<string | null>('model-1'),
  diagramRevision = ref(0),
  resolveDiagramReferences = (rows: readonly DiagramReferenceResponse[]) => [...rows]
) {
  const store = new ModelPartialStore()
  const authoritativeRevision = ref(0)
  const scope = effectScope()
  const traceability = scope.run(() =>
    useLazyTraceability({
      modelId,
      authoritativeRevision,
      diagramRevision,
      beginRequest: requestKey => store.beginRequest(requestKey),
      isRequestCurrent: guard => store.isRequestCurrent(guard),
      mergePartialEntities: (nodes, links, guard) => {
        const nodesAccepted = store.mergeNodes(nodes.map(toEditorNode), { kind: 'partial' }, guard)
        const linksAccepted = store.mergeLinks(links.map(toEditorLink), { kind: 'partial' }, guard)
        if (nodesAccepted && linksAccepted) authoritativeRevision.value += 1
        return nodesAccepted && linksAccepted
      },
      resolveBranchRows: (rowIds, query) => store.resolveTraceabilityRows(rowIds, query),
      resolveDiagramReferences,
    })
  )!
  return { authoritativeRevision, diagramRevision, modelId, scope, store, traceability }
}

describe('useLazyTraceability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads root page zero and diagram references without scanning materialized links', async () => {
    const rootPage = page(
      [neighbor('link-1', 'root', 'child', 'child', 'link-type-filter')],
      0,
      2,
      2
    )
    vi.mocked(fetchGraphNeighbors).mockResolvedValue({ success: true, data: rootPage })
    vi.mocked(fetchDiagramReferences).mockResolvedValue({
      success: true,
      data: page([diagram('diagram-1')], 0, 1),
    })
    const { traceability, store } = setup()

    await traceability.selectRoot(outgoing('root', 'link-type-filter'))

    expect(fetchGraphNeighbors).toHaveBeenCalledWith('model-1', 'root', {
      direction: 'outgoing',
      linkTypeId: 'link-type-filter',
      page: 0,
      size: 50,
      signal: expect.any(AbortSignal),
    })
    expect(fetchDiagramReferences).toHaveBeenCalledWith('model-1', 'root', {
      page: 0,
      size: 50,
      signal: expect.any(AbortSignal),
    })
    expect(traceability.getBranchState(outgoing('root', 'link-type-filter'))).toMatchObject({
      loading: false,
      error: null,
      nextPage: 1,
      totalElements: 2,
    })
    expect(
      traceability
        .getBranchState(outgoing('root', 'link-type-filter'))
        .rows.map(row => [row.link.id, row.node.id])
    ).toEqual([['link-1', 'child']])
    expect(traceability.diagramReferences.value.map(row => row.id)).toEqual(['diagram-1'])
    expect(store.nodeById.has('child')).toBe(true)
    expect(store.linkById.has('link-1')).toBe(true)
  })

  it('keys each page by node, direction, link type, and page', () => {
    expect(lazyTraceabilityBranchPageKey(outgoing('node:1', 'type:1'), 3)).toBe(
      'node%3A1|outgoing|type%3A1|3'
    )
    expect(
      lazyTraceabilityBranchPageKey(
        { nodeId: 'node:1', direction: 'incoming', linkTypeId: null },
        3
      )
    ).toBe('node%3A1|incoming|*|3')
  })

  it('keeps sibling branch rows and failures independent during retry and load more', async () => {
    vi.mocked(fetchDiagramReferences).mockResolvedValue({
      success: true,
      data: page([], 0, 1),
    })
    vi.mocked(fetchGraphNeighbors).mockImplementation(async (_modelId, nodeId, options) => {
      if (nodeId === 'root') return { success: true, data: page([], 0, 1) }
      if (nodeId === 'branch-a' && options.page === 0) {
        return {
          success: true,
          data: page([neighbor('a-1', 'branch-a', 'a-child-1', 'a-child-1')], 0, 2, 2),
        }
      }
      if (nodeId === 'branch-a') {
        return {
          success: true,
          data: page([neighbor('a-2', 'branch-a', 'a-child-2', 'a-child-2')], 1, 2, 2),
        }
      }
      if (nodeId === 'branch-b' && vi.mocked(fetchGraphNeighbors).mock.calls.length < 5) {
        return {
          success: false,
          error: { message: 'branch b failed' },
        } as never
      }
      return {
        success: true,
        data: page([neighbor('b-1', 'branch-b', 'b-child', 'b-child')], 0, 1),
      }
    })
    const { traceability } = setup()
    await traceability.selectRoot(outgoing('root'))

    await traceability.loadBranch(outgoing('branch-a'), new Set(['root']))
    await traceability.loadBranch(outgoing('branch-b'), new Set(['root']))

    expect(traceability.getBranchState(outgoing('branch-a')).rows.map(row => row.link.id)).toEqual([
      'a-1',
    ])
    expect(traceability.getBranchState(outgoing('branch-b')).error).toBe('branch b failed')

    await traceability.loadMore(outgoing('branch-a'))
    expect(traceability.getBranchState(outgoing('branch-a')).rows.map(row => row.link.id)).toEqual([
      'a-1',
      'a-2',
    ])
    expect(traceability.getBranchState(outgoing('branch-b')).error).toBe('branch b failed')

    await traceability.retry(outgoing('branch-b'))
    expect(traceability.getBranchState(outgoing('branch-b')).rows.map(row => row.link.id)).toEqual([
      'b-1',
    ])
    expect(traceability.getBranchState(outgoing('branch-a')).rows.map(row => row.link.id)).toEqual([
      'a-1',
      'a-2',
    ])
  })

  it('does not request a branch whose node is already in the current path', async () => {
    const { traceability } = setup()

    const loaded = await traceability.loadBranch(outgoing('root'), new Set(['root', 'child']))

    expect(loaded).toBe(false)
    expect(fetchGraphNeighbors).not.toHaveBeenCalled()
  })

  it('reloads only root neighbors when direction or type changes', async () => {
    vi.mocked(fetchGraphNeighbors).mockResolvedValue({
      success: true,
      data: page([], 0, 1),
    })
    vi.mocked(fetchDiagramReferences).mockResolvedValue({
      success: true,
      data: page([diagram('diagram-1')], 0, 1),
    })
    const { traceability } = setup()
    await traceability.selectRoot(outgoing('root'))

    await traceability.loadRootBranch({
      nodeId: 'root',
      direction: 'incoming',
      linkTypeId: 'type-2',
    })

    expect(fetchGraphNeighbors).toHaveBeenLastCalledWith('model-1', 'root', {
      direction: 'incoming',
      linkTypeId: 'type-2',
      page: 0,
      size: 50,
      signal: expect.any(AbortSignal),
    })
    expect(fetchDiagramReferences).toHaveBeenCalledTimes(1)
    expect(traceability.diagramReferences.value.map(row => row.id)).toEqual(['diagram-1'])
  })

  it('cancels every old branch request when the direction or link type changes', async () => {
    const childRequest = deferred<Awaited<ReturnType<typeof fetchGraphNeighbors>>>()
    const oldRootRequest = deferred<Awaited<ReturnType<typeof fetchGraphNeighbors>>>()
    vi.mocked(fetchGraphNeighbors)
      .mockResolvedValueOnce({ success: true, data: page([], 0, 1) })
      .mockReturnValueOnce(childRequest.promise)
      .mockReturnValueOnce(oldRootRequest.promise)
      .mockResolvedValueOnce({
        success: true,
        data: page(
          [neighbor('fresh-link', 'fresh-child', 'root', 'fresh-child', 'type-new')],
          0,
          1
        ),
      })
    vi.mocked(fetchDiagramReferences).mockResolvedValue({
      success: true,
      data: page([], 0, 1),
    })
    const { traceability, store } = setup()
    await traceability.selectRoot(outgoing('root'))

    const childLoad = traceability.loadBranch(outgoing('child'), new Set(['root']))
    const childSignal = vi.mocked(fetchGraphNeighbors).mock.calls[1]?.[2].signal
    const oldFilterLoad = traceability.changeFilter(outgoing('root', 'type-old'))
    const oldRootSignal = vi.mocked(fetchGraphNeighbors).mock.calls[2]?.[2].signal
    const freshQuery: TraceabilityBranchQuery = {
      nodeId: 'root',
      direction: 'incoming',
      linkTypeId: 'type-new',
    }
    const freshFilterLoad = traceability.changeFilter(freshQuery)

    expect(childSignal?.aborted).toBe(true)
    expect(oldRootSignal?.aborted).toBe(true)
    childRequest.resolve({
      success: true,
      data: page([neighbor('stale-child-link', 'child', 'stale-child', 'stale-child')], 0, 1),
    })
    oldRootRequest.resolve({
      success: true,
      data: page(
        [neighbor('stale-root-link', 'root', 'stale-root-child', 'stale-root-child')],
        0,
        1
      ),
    })
    await Promise.all([childLoad, oldFilterLoad, freshFilterLoad])

    expect(store.linkById.has('stale-child-link')).toBe(false)
    expect(store.linkById.has('stale-root-link')).toBe(false)
    expect(traceability.getBranchState(outgoing('child')).rows).toEqual([])
    expect(traceability.getBranchState(outgoing('root', 'type-old')).rows).toEqual([])
    expect(traceability.getBranchState(freshQuery).rows.map(row => row.link.id)).toEqual([
      'fresh-link',
    ])
  })

  it('preserves dirty local entities when neighbor pages merge into the partial store', async () => {
    vi.mocked(fetchGraphNeighbors).mockResolvedValue({
      success: true,
      data: page([neighbor('link-1', 'root', 'child', 'child')], 0, 1),
    })
    vi.mocked(fetchDiagramReferences).mockResolvedValue({
      success: true,
      data: page([], 0, 1),
    })
    const { authoritativeRevision, traceability, store } = setup()
    store.mergeNodes([{ ...toEditorNode(node('child', 'local child')), _isDirty: true }], {
      kind: 'partial',
    })
    store.mergeLinks([{ ...toEditorLink(link('link-1', 'root', 'child')), _isDirty: true }], {
      kind: 'partial',
    })

    await traceability.selectRoot(outgoing('root'))

    expect(store.nodeById.get('child')?.name).toBe('local child')
    expect(store.nodeById.get('child')?._isDirty).toBe(true)
    expect(store.linkById.get('link-1')?._isDirty).toBe(true)
    authoritativeRevision.value += 1
    expect(traceability.getBranchState(outgoing('root')).rows[0]?.node.name).toBe('local child')
  })

  it('keeps loaded diagram references visible when the next page fails and retries locally', async () => {
    vi.mocked(fetchGraphNeighbors).mockResolvedValue({
      success: true,
      data: page([], 0, 1),
    })
    vi.mocked(fetchDiagramReferences)
      .mockResolvedValueOnce({
        success: true,
        data: page([diagram('diagram-1')], 0, 2, 2),
      })
      .mockResolvedValueOnce({
        success: false,
        error: { message: 'diagram page failed' },
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: page([diagram('diagram-2')], 1, 2, 2),
      })
    const { traceability } = setup()
    await traceability.selectRoot(outgoing('root'))

    await traceability.loadMoreDiagrams()

    expect(traceability.diagramReferences.value.map(row => row.id)).toEqual(['diagram-1'])
    expect(traceability.diagramsError.value).toBe('diagram page failed')
    expect(traceability.diagramsNextPage.value).toBe(1)

    await traceability.retryDiagrams()

    expect(traceability.diagramReferences.value.map(row => row.id)).toEqual([
      'diagram-1',
      'diagram-2',
    ])
    expect(traceability.diagramsError.value).toBeNull()
  })

  it('preserves loaded diagram references when an explicit refresh fails', async () => {
    vi.mocked(fetchGraphNeighbors).mockResolvedValue({
      success: true,
      data: page([], 0, 1),
    })
    vi.mocked(fetchDiagramReferences)
      .mockResolvedValueOnce({
        success: true,
        data: page([diagram('diagram-1')], 0, 2, 2),
      })
      .mockResolvedValueOnce({
        success: true,
        data: page([diagram('diagram-2')], 1, 2, 2),
      })
      .mockResolvedValueOnce({
        success: false,
        error: { message: 'refresh failed' },
      } as never)
    const { diagramRevision, traceability } = setup()
    await traceability.selectRoot(outgoing('root'))
    await traceability.loadMoreDiagrams()

    diagramRevision.value += 1
    await nextTick()
    await traceability.waitForDiagramRefresh()

    expect(traceability.diagramReferences.value.map(row => row.id)).toEqual([
      'diagram-1',
      'diagram-2',
    ])
    expect(traceability.diagramsError.value).toBe('refresh failed')
  })

  it('coalesces diagram invalidations into one active request and one trailing refresh', async () => {
    const activeRefresh = deferred<Awaited<ReturnType<typeof fetchDiagramReferences>>>()
    const trailingRefresh = deferred<Awaited<ReturnType<typeof fetchDiagramReferences>>>()
    vi.mocked(fetchGraphNeighbors).mockResolvedValue({
      success: true,
      data: page([], 0, 1),
    })
    vi.mocked(fetchDiagramReferences)
      .mockResolvedValueOnce({
        success: true,
        data: page([diagram('diagram-1')], 0, 1),
      })
      .mockReturnValueOnce(activeRefresh.promise)
      .mockReturnValueOnce(trailingRefresh.promise)
    const { diagramRevision, traceability } = setup()
    await traceability.selectRoot(outgoing('root'))

    diagramRevision.value += 1
    await nextTick()
    diagramRevision.value += 1
    diagramRevision.value += 1
    await nextTick()

    expect(fetchDiagramReferences).toHaveBeenCalledTimes(2)
    activeRefresh.resolve({
      success: true,
      data: page([diagram('diagram-stale-refresh')], 0, 1),
    })
    await vi.waitFor(() => expect(fetchDiagramReferences).toHaveBeenCalledTimes(3))
    trailingRefresh.resolve({
      success: true,
      data: page([diagram('diagram-latest')], 0, 1),
    })
    await traceability.waitForDiagramRefresh()

    expect(traceability.diagramReferences.value.map(row => row.id)).toEqual(['diagram-latest'])
  })

  it('cancels selection, model, and scope requests and ignores stale responses', async () => {
    const oldNeighbors = deferred<Awaited<ReturnType<typeof fetchGraphNeighbors>>>()
    const oldDiagrams = deferred<Awaited<ReturnType<typeof fetchDiagramReferences>>>()
    const modelNeighbors = deferred<Awaited<ReturnType<typeof fetchGraphNeighbors>>>()
    const modelDiagrams = deferred<Awaited<ReturnType<typeof fetchDiagramReferences>>>()
    const scopeNeighbors = deferred<Awaited<ReturnType<typeof fetchGraphNeighbors>>>()
    const scopeDiagrams = deferred<Awaited<ReturnType<typeof fetchDiagramReferences>>>()
    vi.mocked(fetchGraphNeighbors)
      .mockReturnValueOnce(oldNeighbors.promise)
      .mockResolvedValueOnce({
        success: true,
        data: page([neighbor('fresh-link', 'fresh-root', 'fresh-child', 'fresh-child')], 0, 1),
      })
      .mockReturnValueOnce(modelNeighbors.promise)
      .mockReturnValueOnce(scopeNeighbors.promise)
    vi.mocked(fetchDiagramReferences)
      .mockReturnValueOnce(oldDiagrams.promise)
      .mockResolvedValueOnce({ success: true, data: page([diagram('fresh-diagram')], 0, 1) })
      .mockReturnValueOnce(modelDiagrams.promise)
      .mockReturnValueOnce(scopeDiagrams.promise)
    const { modelId, scope, store, traceability } = setup()

    const oldSelection = traceability.selectRoot(outgoing('old-root'))
    const oldNeighborSignal = vi.mocked(fetchGraphNeighbors).mock.calls[0]?.[2].signal
    const freshSelection = traceability.selectRoot(outgoing('fresh-root'))
    expect(oldNeighborSignal?.aborted).toBe(true)
    oldNeighbors.resolve({
      success: true,
      data: page([neighbor('stale-link', 'old-root', 'stale-child', 'stale-child')], 0, 1),
    })
    oldDiagrams.resolve({ success: true, data: page([diagram('stale-diagram')], 0, 1) })
    await Promise.all([oldSelection, freshSelection])

    expect(store.linkById.has('stale-link')).toBe(false)
    expect(traceability.diagramReferences.value.map(row => row.id)).toEqual(['fresh-diagram'])

    const modelRequest = traceability.selectRoot(outgoing('model-root'))
    const modelSignal = vi.mocked(fetchGraphNeighbors).mock.calls[2]?.[2].signal
    modelId.value = 'model-2'
    await Promise.resolve()
    expect(modelSignal?.aborted).toBe(true)

    const scopeRequest = traceability.selectRoot(outgoing('scope-root'))
    const scopeSignal = vi.mocked(fetchGraphNeighbors).mock.calls[3]?.[2].signal
    scope.stop()
    expect(scopeSignal?.aborted).toBe(true)
    modelNeighbors.resolve({ success: true, data: page([], 0, 1) })
    modelDiagrams.resolve({ success: true, data: page([], 0, 1) })
    scopeNeighbors.resolve({ success: true, data: page([], 0, 1) })
    scopeDiagrams.resolve({ success: true, data: page([], 0, 1) })
    await Promise.all([modelRequest, scopeRequest])
  })
})
