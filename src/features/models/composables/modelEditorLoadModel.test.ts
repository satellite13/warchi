import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/composables/useApi'
import { listParams, MODEL_PAGE_FETCH_CONCURRENCY } from '@/api/queryHelpers'
import { fetchAllComponentsByNotationIds } from './modelNotationComponentsApi'
import { withModelEditorPageSlot } from '../utils/modelEditorPagePool'
import {
  fetchAllRelationRulesByNotationIds,
  fetchAllRelationsByNotationId,
} from './modelNotationRelationsApi'
import { fetchAllByModelId, loadModelEditorData } from './modelEditorLoadModel'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

vi.mock('./modelNotationRelationsApi', () => ({
  fetchAllRelationRulesByNotationIds: vi.fn(),
  fetchAllRelationsByNotationId: vi.fn(),
}))

vi.mock('./modelNotationComponentsApi', () => ({
  fetchAllComponentsByNotationIds: vi.fn(),
}))

vi.mock('@/api/queryHelpers', async () => {
  const actual = await vi.importActual<typeof import('@/api/queryHelpers')>('@/api/queryHelpers')
  return {
    ...actual,
    listParams: vi.fn(() => new URLSearchParams({ size: '1000' })),
  }
})

const ok = <T>(data: T) => ({ success: true as const, data })
const fail = (status: number, message: string) => ({
  success: false as const,
  error: { status, message },
})
const page = <T>(content: T[], meta?: { last?: boolean; totalPages?: number }) => ({
  content,
  last: meta?.last ?? true,
  totalPages: meta?.totalPages ?? 1,
})
/** arepos ListResponse for GET /models (items, not Spring content). */
const listResponse = <T>(items: T[]) => ({
  items,
  total: items.length,
  page: 0,
  size: items.length,
})

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('fetchAllByModelId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches page 0 then remaining pages in parallel', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(ok(page([{ id: 'n1' }], { last: false, totalPages: 3 })))
      .mockResolvedValueOnce(ok(page([{ id: 'n2' }], { last: false, totalPages: 3 })))
      .mockResolvedValueOnce(ok(page([{ id: 'n3' }], { last: true, totalPages: 3 })))

    const result = await fetchAllByModelId<{ id: string }>('/nodes', 'model-1', 1000)

    expect(result.map(item => item.id)).toEqual(['n1', 'n2', 'n3'])
    expect(apiGet).toHaveBeenCalledTimes(3)
    const calls = vi.mocked(apiGet).mock.calls.map(call => String(call[0]))
    expect(calls[0]).toContain('page=0')
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('page=1'),
        expect.stringContaining('page=2'),
      ])
    )
  })

  it('forwards extra query params (includeAttrs=false for diagrams)', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce(ok(page([{ id: 'd1' }])))

    await fetchAllByModelId('/diagrams', 'model-1', 100, { includeAttrs: 'false' })

    expect(String(vi.mocked(apiGet).mock.calls[0]?.[0])).toContain('includeAttrs=false')
  })

  it(`fetches remaining pages with a concurrency cap of ${MODEL_PAGE_FETCH_CONCURRENCY}`, async () => {
    let inFlight = 0
    let maxInFlight = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      const pageMatch = String(path).match(/page=(\d+)/)
      const pageNum = Number(pageMatch?.[1] ?? 0)
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise<void>(resolve => {
        setTimeout(resolve, 20)
      })
      inFlight -= 1
      return ok(page([{ id: `n${pageNum}` }], { last: pageNum === 9, totalPages: 10 }))
    })

    const result = await fetchAllByModelId<{ id: string }>('/nodes', 'model-1', 1000)

    expect(result).toHaveLength(10)
    expect(maxInFlight).toBeLessThanOrEqual(MODEL_PAGE_FETCH_CONCURRENCY)
    expect(apiGet).toHaveBeenCalledTimes(10)
  })

  it('shares one global page request limit across parallel node and link loads', async () => {
    let inFlight = 0
    let maxInFlight = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      const requestPath = String(path)
      const pageNum = Number(requestPath.match(/page=(\d+)/)?.[1] ?? 0)
      const collection = requestPath.startsWith('/nodes?') ? 'node' : 'link'
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise<void>(resolve => {
        setTimeout(resolve, 20)
      })
      inFlight -= 1
      return ok(
        page([{ id: `${collection}-${pageNum}` }], {
          last: pageNum === 7,
          totalPages: 8,
        })
      )
    })

    const [nodes, links] = await Promise.all([
      fetchAllByModelId<{ id: string }>('/nodes', 'model-1', 1000),
      fetchAllByModelId<{ id: string }>('/links', 'model-1', 1000),
    ])

    expect(nodes).toHaveLength(8)
    expect(links).toHaveLength(8)
    expect(maxInFlight).toBeLessThanOrEqual(MODEL_PAGE_FETCH_CONCURRENCY)
    expect(apiGet).toHaveBeenCalledTimes(16)
  })

  it('stops scheduling new pages after an error and drains active workers', async () => {
    const firstError = new Error('page failed')
    const drainActivePages = deferred()
    const releaseFollowUps = deferred()
    const startedNodePages: number[] = []
    const startedFollowUps: string[] = []
    const expectedStartedNodePages = Array.from(
      { length: MODEL_PAGE_FETCH_CONCURRENCY + 1 },
      (_, index) => index
    )
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      const requestPath = String(path)
      const params = new URLSearchParams(requestPath.split('?')[1])
      const pageNum = Number(params.get('page') ?? 0)
      const modelId = params.get('modelId') ?? ''

      if (requestPath.startsWith('/nodes?')) {
        startedNodePages.push(pageNum)
        if (pageNum === 0) {
          return ok(page([{ id: 'node-0' }], { last: false, totalPages: 8 }))
        }
        if (pageNum === 1) throw firstError
        await drainActivePages.promise
        return ok(page([{ id: `node-${pageNum}` }], { last: false, totalPages: 8 }))
      }

      startedFollowUps.push(modelId)
      await releaseFollowUps.promise
      return ok(page([{ id: `link-${modelId}` }]))
    })

    let loadSettled = false
    const loadOutcome = fetchAllByModelId<{ id: string }>('/nodes', 'model-1', 1000)
      .then(
        value => ({ value }),
        error => ({ error })
      )
      .finally(() => {
        loadSettled = true
      })
    let followUps: Array<Promise<Array<{ id: string }>>> = []

    try {
      await vi.waitFor(() => {
        expect(startedNodePages).toEqual(expectedStartedNodePages)
      })
      expect(loadSettled).toBe(MODEL_PAGE_FETCH_CONCURRENCY === 1)

      drainActivePages.resolve()
      const outcome = await loadOutcome

      expect('error' in outcome ? outcome.error : undefined).toBe(firstError)
      expect(startedNodePages).toEqual(expectedStartedNodePages)

      followUps = Array.from({ length: MODEL_PAGE_FETCH_CONCURRENCY }, (_, index) =>
        fetchAllByModelId<{ id: string }>('/links', `model-${index}`, 1000)
      )
      await vi.waitFor(() => {
        expect(startedFollowUps).toHaveLength(MODEL_PAGE_FETCH_CONCURRENCY)
      })
    } finally {
      drainActivePages.resolve()
      releaseFollowUps.resolve()
      await loadOutcome
      await Promise.allSettled(followUps)
    }
  })

  it('does not start queued page requests after the first page error', async () => {
    const releaseSlotHolders = deferred()
    const firstError = new Error('page failed')
    const startedPages: number[] = []
    let slotHolders: Promise<void>[] = []
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      const pageNum = Number(String(path).match(/page=(\d+)/)?.[1] ?? 0)
      startedPages.push(pageNum)
      if (pageNum === 0) {
        slotHolders = Array.from({ length: MODEL_PAGE_FETCH_CONCURRENCY - 1 }, () =>
          withModelEditorPageSlot(async () => {
            await releaseSlotHolders.promise
          })
        )
        return ok(
          page([{ id: 'node-0' }], {
            last: false,
            totalPages: MODEL_PAGE_FETCH_CONCURRENCY + 1,
          })
        )
      }
      if (pageNum === 1) throw firstError
      return ok(page([{ id: `node-${pageNum}` }]))
    })

    const load = fetchAllByModelId<{ id: string }>('/nodes', 'model-1', 1000)

    try {
      await expect(load).rejects.toBe(firstError)
      expect(startedPages).toEqual([0, 1])
    } finally {
      releaseSlotHolders.resolve()
      await Promise.allSettled(slotHolders)
      await load.catch(() => undefined)
    }
  })

  it('stops scheduling pages after cancellation and drains active requests', async () => {
    const releaseActivePages = deferred()
    const startedPages: number[] = []
    const expectedStartedPages = Array.from(
      { length: MODEL_PAGE_FETCH_CONCURRENCY + 1 },
      (_, index) => index
    )
    let cancelled = false
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      const pageNum = Number(String(path).match(/page=(\d+)/)?.[1] ?? 0)
      startedPages.push(pageNum)
      if (pageNum === 0) {
        return ok(page([{ id: 'node-0' }], { last: false, totalPages: 8 }))
      }
      await releaseActivePages.promise
      if (pageNum === 2) throw new Error('active request failed after cancellation')
      return ok(page([{ id: `node-${pageNum}` }], { last: false, totalPages: 8 }))
    })

    const load = fetchAllByModelId<{ id: string }>('/nodes', 'model-1', 1000, undefined, {
      isCancelled: () => cancelled,
    })

    await vi.waitFor(() => {
      expect(startedPages).toEqual(expectedStartedPages)
    })
    cancelled = true
    releaseActivePages.resolve()

    await expect(load).resolves.toEqual([])
    expect(startedPages).toEqual(expectedStartedPages)
  })

  it('dedupes entities that appear on multiple pages', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(ok(page([{ id: 'n1' }, { id: 'n2' }], { last: false, totalPages: 2 })))
      .mockResolvedValueOnce(ok(page([{ id: 'n2' }, { id: 'n3' }], { last: true, totalPages: 2 })))

    const result = await fetchAllByModelId<{ id: string }>('/links', 'model-1', 1000)

    expect(result.map(item => item.id)).toEqual(['n1', 'n2', 'n3'])
  })
})

describe('loadModelEditorData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchAllRelationRulesByNotationIds).mockResolvedValue([])
    vi.mocked(fetchAllRelationsByNotationId).mockResolvedValue([
      {
        id: 'relation-1',
        name: 'Relation',
        version: '1.0.0',
        notationId: 'notation-1',
        ownerId: 'owner-1',
        linkTypeId: 'lt-1',
      },
    ])
    vi.mocked(fetchAllComponentsByNotationIds).mockResolvedValue([
      {
        id: 'component-1',
        name: 'Component',
        version: '1.0.0',
        notationId: 'notation-1',
        ownerId: 'owner-1',
        nodeTypeId: 'nt-1',
      },
    ])
  })

  it('loads model editor data and maps entities into editor state', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/models/model-1') {
        return ok({ id: 'model-1', name: 'Model', version: '1.0.0', ownerId: 'owner-1' })
      }
      if (path.startsWith('/models?')) {
        return ok(
          listResponse([{ id: 'model-1', name: 'Model', version: '1.0.0', ownerId: 'owner-1' }])
        )
      }
      if (path.startsWith('/nodes?')) {
        return ok(
          page([
            {
              id: 'node-1',
              name: 'Node',
              modelId: 'model-1',
              ownerId: 'owner-1',
              nodeTypeId: 'nt-1',
              attrs: '{"typeProperties":{"code":"A"}}',
            },
          ])
        )
      }
      if (path.startsWith('/diagrams?')) {
        expect(path).toContain('includeAttrs=false')
        return ok(
          page([
            {
              id: 'diagram-1',
              name: 'Diagram',
              version: '1.0.0',
              modelId: 'model-1',
              ownerId: 'owner-1',
              notationId: 'notation-1',
              attrs: null,
            },
          ])
        )
      }
      if (path.startsWith('/notations?')) {
        return ok(page([{ id: 'notation-1', name: 'Notation', version: '1.0.0', ownerId: 'owner-1' }]))
      }
      if (path.startsWith('/links?')) {
        return ok(
          page([
            {
              id: 'link-1',
              sourceId: 'node-1',
              targetId: 'node-2',
              modelId: 'model-1',
              ownerId: 'owner-1',
              linkTypeId: 'lt-1',
              attrs: '{}',
            },
          ])
        )
      }
      if (path.startsWith('/node-types?')) {
        return ok(page([{ id: 'nt-1', name: 'NodeType', ownerId: 'owner-1' }]))
      }
      if (path.startsWith('/link-types?')) {
        return ok(page([{ id: 'lt-1', name: 'LinkType', ownerId: 'owner-1' }]))
      }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const result = await loadModelEditorData('model-1')

    expect(listParams).toHaveBeenCalled()
    expect(result.model.id).toBe('model-1')
    expect(result.modelCatalog).toHaveLength(1)
    expect(result.loadedNotationIds).toEqual(['notation-1'])
    expect(result.state).toMatchObject({
      modelId: 'model-1',
      ownerId: 'owner-1',
      nodes: [{ id: 'node-1', parsedAttrs: { typeProperties: { code: 'A' } } }],
      links: [{ id: 'link-1' }],
      diagrams: [{ id: 'diagram-1', notationId: 'notation-1', _attrsPending: true }],
      notations: [{ id: 'notation-1' }],
      nodeTypes: [{ id: 'nt-1' }],
      linkTypes: [{ id: 'lt-1' }],
      components: [{ id: 'component-1' }],
      relations: [{ id: 'relation-1' }],
      relationRules: [],
    })
    expect(fetchAllComponentsByNotationIds).toHaveBeenCalledWith(['notation-1'], {
      modelId: 'model-1',
    })
    expect(fetchAllRelationsByNotationId).toHaveBeenCalledWith('notation-1', {
      modelId: 'model-1',
    })
    expect(fetchAllRelationRulesByNotationIds).toHaveBeenCalledWith(['notation-1'], {
      includeAttrs: false,
      modelId: 'model-1',
    })
  })

  it('throws a localized not found error for 404 model load failure', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/models/missing') return fail(404, 'Not found')
      if (path.startsWith('/models?')) return ok(page([]))
      if (path.startsWith('/nodes?')) return ok(page([]))
      if (path.startsWith('/diagrams?')) return ok(page([]))
      if (path.startsWith('/notations?')) return ok(page([]))
      if (path.startsWith('/node-types?')) return ok(page([]))
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    await expect(loadModelEditorData('missing')).rejects.toThrow('Модель не найдена')
  })

  it('throws an access error for 403 model load failure', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/models/forbidden') return fail(403, 'Forbidden')
      if (path.startsWith('/models?')) return ok(page([]))
      if (path.startsWith('/nodes?')) return ok(page([]))
      if (path.startsWith('/diagrams?')) return ok(page([]))
      if (path.startsWith('/notations?')) return ok(page([]))
      if (path.startsWith('/node-types?')) return ok(page([]))
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    await expect(loadModelEditorData('forbidden')).rejects.toThrow(
      'Доступ к модели отозван или отсутствует.'
    )
  })

  it('loads node types in the shell so Directory folders can expand before catalog', async () => {
    const { loadModelEditorShell } = await import('./modelEditorLoadModel')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/models/model-1') {
        return ok({ id: 'model-1', name: 'Model', version: '1.0.0', ownerId: 'owner-1' })
      }
      if (path.startsWith('/models?')) {
        return ok(
          listResponse([{ id: 'model-1', name: 'Model', version: '1.0.0', ownerId: 'owner-1' }])
        )
      }
      if (path.startsWith('/nodes?')) return ok(page([]))
      if (path.startsWith('/diagrams?')) return ok(page([]))
      if (path.startsWith('/notations?')) return ok(page([]))
      if (path.startsWith('/node-types?')) {
        expect(path).toContain('modelId=model-1')
        return ok(page([{ id: 'nt-dir', name: 'Directory', ownerId: 'owner-1' }]))
      }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const shell = await loadModelEditorShell('model-1')

    expect(shell.state.nodeTypes).toEqual([
      expect.objectContaining({ id: 'nt-dir', name: 'Directory' }),
    ])
    expect(shell.state.links).toEqual([])
    expect(shell.state.components).toEqual([])
  })
})
