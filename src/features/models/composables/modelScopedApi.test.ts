import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { apiFetch, type ApiResult } from '@/composables/useApi'
import { MODEL_RESOLVE_CHUNK_SIZE, MODEL_TREE_PAGE_SIZE, chunkUniqueIds } from '@/api/queryHelpers'
import type { DiagramReferenceResponse } from '@/types/api'
import type { PaginatedResponse } from '@/types/entities'
import {
  fetchDiagramReferences,
  fetchGraphNeighbors,
  fetchNodeAncestors,
  fetchNodeChildren,
  resolveModelLinks,
  resolveModelNodes,
  searchModelNodes,
} from './modelScopedApi'

vi.mock('@/composables/useApi', () => ({
  apiFetch: vi.fn(),
}))

const ok = <T>(data: T) => ({ success: true as const, data })

describe('modelScopedApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defines bounded tree and resolve sizes and chunks unique ids stably', () => {
    expect(MODEL_TREE_PAGE_SIZE).toBe(500)
    expect(MODEL_RESOLVE_CHUNK_SIZE).toBe(2000)
    expect(chunkUniqueIds(['b', 'a', 'b', 'c'], 2)).toEqual([['b', 'a'], ['c']])
  })

  it('builds root and folder-only child queries with paging and AbortSignal', async () => {
    vi.mocked(apiFetch).mockResolvedValue(ok({ content: [] }))
    const controller = new AbortController()

    await fetchNodeChildren(
      'model / 1',
      { kind: 'root' },
      { page: 2, foldersOnly: true, excludeSystem: false, signal: controller.signal }
    )

    expect(apiFetch).toHaveBeenCalledWith(
      '/nodes?modelId=model+%2F+1&parentId=root&excludeSystem=false&foldersOnly=true&page=2&size=500',
      { method: 'GET', signal: controller.signal }
    )
  })

  it('builds a node parent query with default visibility options', async () => {
    vi.mocked(apiFetch).mockResolvedValue(ok({ content: [] }))

    await fetchNodeChildren('m', { kind: 'node', nodeId: 'parent / 1' })

    expect(apiFetch).toHaveBeenCalledWith(
      '/nodes?modelId=m&parentId=parent+%2F+1&excludeSystem=true&foldersOnly=false&page=0&size=500',
      { method: 'GET', signal: undefined }
    )
  })

  it('resolves 4001 stable-deduplicated node ids as 2000/2000/remainder', async () => {
    vi.mocked(apiFetch).mockImplementation(async (_path, options) => {
      const body = JSON.parse(String(options?.body)) as { nodeIds: string[] }
      return ok({
        nodes: body.nodeIds.map(id => ({ id })),
        missingIds: [],
      })
    })
    const ids = Array.from({ length: 4001 }, (_, index) => `n-${index}`)
    ids.splice(2001, 0, 'n-0')

    const result = await resolveModelNodes('m', ids)

    expect(
      vi.mocked(apiFetch).mock.calls.map(([, options]) => {
        const body = JSON.parse(String(options?.body)) as { nodeIds: string[] }
        return body.nodeIds.length
      })
    ).toEqual([2000, 2000, 1])
    expect(result.success && result.data.nodes.map(node => node.id)).toEqual(
      Array.from({ length: 4001 }, (_, index) => `n-${index}`)
    )
  })

  it('forwards scoped navigation and traceability contracts with AbortSignal', async () => {
    vi.mocked(apiFetch).mockImplementation(async path => {
      if (path.endsWith('/links:resolve')) {
        return ok({ links: [], missingLinkIds: [] })
      }
      return ok({ hits: [], content: [] })
    })
    const controller = new AbortController()

    await resolveModelLinks('m', { linkIds: ['l1'], endpointNodeIds: ['n1'] }, controller.signal)
    await fetchNodeAncestors('m', 'n1', controller.signal)
    await searchModelNodes('m', 'two words', { limit: 25, signal: controller.signal })
    await fetchGraphNeighbors('m', 'n1', {
      direction: 'incoming',
      linkTypeId: 'lt1',
      page: 3,
      size: 40,
      signal: controller.signal,
    })
    await fetchDiagramReferences('m', 'n1', {
      page: 1,
      size: 20,
      signal: controller.signal,
    })

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/models/m/links:resolve', {
      method: 'POST',
      body: JSON.stringify({ linkIds: ['l1'], endpointNodeIds: ['n1'] }),
      signal: controller.signal,
    })
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/models/m/nodes/n1/ancestors', {
      method: 'GET',
      signal: controller.signal,
    })
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      '/search/models/m?q=two+words&kinds=nodes&limit=25',
      { method: 'GET', signal: controller.signal }
    )
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      '/models/m/graph/neighbors?nodeId=n1&direction=incoming&linkTypeId=lt1&page=3&size=40',
      { method: 'GET', signal: controller.signal }
    )
    expect(apiFetch).toHaveBeenNthCalledWith(
      5,
      '/models/m/diagram-references?nodeId=n1&page=1&size=20',
      { method: 'GET', signal: controller.signal }
    )
    expectTypeOf<ReturnType<typeof fetchDiagramReferences>>().toEqualTypeOf<
      Promise<ApiResult<PaginatedResponse<DiagramReferenceResponse>>>
    >()
  })

  it('requests node and diagram hits with extended search contract fields', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      ok({
        modelId: 'model-1',
        q: 'BPMN',
        limit: 50,
        totalEstimate: 1,
        hits: [
          {
            kind: 'diagram',
            id: 'diagram-1',
            name: 'Simple BPMN',
            parentId: 'folder-1',
            pathNames: ['Diagrams', 'Simple BPMN'],
          },
          {
            kind: 'node',
            id: 'node-1',
            name: 'Service',
            nodeTypeId: 'type-1',
            parentId: 'folder-1',
            pathNames: ['Apps', 'Service'],
          },
        ],
      })
    )

    const result = await searchModelNodes('model-1', 'BPMN', {
      kinds: ['nodes', 'diagrams'],
    })

    expect(apiFetch).toHaveBeenCalledWith(
      '/search/models/model-1?q=BPMN&kinds=nodes%2Cdiagrams&limit=50',
      { method: 'GET', signal: undefined }
    )
    expect(result.success && result.data.hits[0]?.pathNames).toEqual(['Diagrams', 'Simple BPMN'])
    expect(result.success && result.data.hits[1]?.nodeTypeId).toBe('type-1')
  })
})
