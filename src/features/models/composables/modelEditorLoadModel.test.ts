import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/composables/useApi'
import { listParams } from '@/api/queryHelpers'
import { fetchAllRelationRulesByNotationIds } from './modelNotationRelationsApi'
import { loadModelEditorData } from './modelEditorLoadModel'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

vi.mock('./modelNotationRelationsApi', () => ({
  fetchAllRelationRulesByNotationIds: vi.fn(),
}))

vi.mock('@/api/queryHelpers', () => ({
  listParams: vi.fn(() => new URLSearchParams({ size: '1000' })),
}))

const ok = <T>(data: T) => ({ success: true as const, data })
const fail = (status: number, message: string) => ({
  success: false as const,
  error: { status, message },
})
const page = <T>(content: T[]) => ({ content })

describe('loadModelEditorData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchAllRelationRulesByNotationIds).mockResolvedValue([])
  })

  it('loads model editor data and maps entities into editor state', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(ok({ id: 'model-1', name: 'Model', version: '1.0.0', ownerId: 'owner-1' }))
      .mockResolvedValueOnce(ok(page([{ id: 'model-1', name: 'Model', version: '1.0.0', ownerId: 'owner-1' }])))
      .mockResolvedValueOnce(
        ok(page([{ id: 'node-1', name: 'Node', modelId: 'model-1', ownerId: 'owner-1', nodeTypeId: 'nt-1', attrs: '{"typeProperties":{"code":"A"}}' }]))
      )
      .mockResolvedValueOnce(
        ok(page([{ id: 'link-1', sourceId: 'node-1', targetId: 'node-2', modelId: 'model-1', ownerId: 'owner-1', linkTypeId: 'lt-1', attrs: '{}' }]))
      )
      .mockResolvedValueOnce(
        ok(page([{ id: 'diagram-1', name: 'Diagram', version: '1.0.0', modelId: 'model-1', ownerId: 'owner-1', notationId: 'notation-1', attrs: '{"instances":{"nodes":[],"edges":[]}}' }]))
      )
      .mockResolvedValueOnce(ok(page([{ id: 'notation-1', name: 'Notation', version: '1.0.0', ownerId: 'owner-1' }])))
      .mockResolvedValueOnce(ok(page([{ id: 'component-1', name: 'Component', version: '1.0.0', notationId: 'notation-1', ownerId: 'owner-1', nodeTypeId: 'nt-1' }])))
      .mockResolvedValueOnce(ok(page([{ id: 'relation-1', name: 'Relation', version: '1.0.0', notationId: 'notation-1', ownerId: 'owner-1', linkTypeId: 'lt-1' }])))
      .mockResolvedValueOnce(ok(page([{ id: 'nt-1', name: 'NodeType', ownerId: 'owner-1' }])))
      .mockResolvedValueOnce(ok(page([{ id: 'lt-1', name: 'LinkType', ownerId: 'owner-1' }])))

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
      diagrams: [{ id: 'diagram-1', notationId: 'notation-1' }],
      notations: [{ id: 'notation-1' }],
      nodeTypes: [{ id: 'nt-1' }],
      linkTypes: [{ id: 'lt-1' }],
      components: [{ id: 'component-1' }],
      relations: [{ id: 'relation-1' }],
      relationRules: [],
    })
    expect(fetchAllRelationRulesByNotationIds).toHaveBeenCalledWith(['notation-1'], {
      includeAttrs: false,
      modelId: 'model-1',
    })
  })

  it('throws a localized not found error for 404 model load failure', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(fail(404, 'Not found'))
      .mockResolvedValueOnce(ok(page([])))
      .mockResolvedValueOnce(ok(page([])))
      .mockResolvedValueOnce(ok(page([])))
      .mockResolvedValueOnce(ok(page([])))
      .mockResolvedValueOnce(ok(page([])))

    await expect(loadModelEditorData('missing')).rejects.toThrow('Модель не найдена')
  })

  it('throws an access error for 403 model load failure', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(fail(403, 'Forbidden'))
      .mockResolvedValueOnce(ok(page([])))
      .mockResolvedValueOnce(ok(page([])))
      .mockResolvedValueOnce(ok(page([])))
      .mockResolvedValueOnce(ok(page([])))
      .mockResolvedValueOnce(ok(page([])))

    await expect(loadModelEditorData('forbidden')).rejects.toThrow('Доступ к модели отозван или отсутствует.')
  })
})
