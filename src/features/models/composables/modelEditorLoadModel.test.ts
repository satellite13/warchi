import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/composables/useApi'
import { listParams } from '@/api/queryHelpers'
import { fetchAllComponentsByNotationIds } from './modelNotationComponentsApi'
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
        return ok(page([{ id: 'model-1', name: 'Model', version: '1.0.0', ownerId: 'owner-1' }]))
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
        return ok(page([{ id: 'model-1', name: 'Model', version: '1.0.0', ownerId: 'owner-1' }]))
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
