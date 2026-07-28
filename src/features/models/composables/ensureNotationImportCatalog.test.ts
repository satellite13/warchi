import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/composables/useApi'
import { fetchAllComponentsByNotationId } from './modelNotationComponentsApi'
import {
  ensureNotationImportCatalog,
  resetLoadedNotationCatalogIds,
} from './ensureNotationImportCatalog'
import type { ModelEditorState } from '../types'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

vi.mock('./modelNotationComponentsApi', () => ({
  fetchAllComponentsByNotationId: vi.fn(),
}))

function emptyState(): ModelEditorState {
  return {
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodes: [],
    links: [],
    diagrams: [],
    notations: [],
    nodeTypes: [],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
  }
}

function mockCatalogApis(): void {
  vi.mocked(fetchAllComponentsByNotationId).mockResolvedValue([
    {
      id: 'cmp-1',
      name: 'Business Actor',
      version: '1.0.0',
      ownerId: 'owner-1',
      notationId: 'not-archi',
      nodeTypeId: 'nt-1',
      attrs: null,
    },
  ])
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith('/node-types')) {
      return {
        success: true as const,
        data: {
          content: [
            {
              id: 'nt-1',
              name: 'Business Actor',
              ownerId: 'owner-1',
              attrs: null,
            },
          ],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 1000,
        },
      }
    }
    return {
      success: true as const,
      data: {
        content: [
          {
            id: 'lt-1',
            name: 'Serving',
            ownerId: 'owner-1',
            attrs: null,
          },
        ],
        totalElements: 1,
        totalPages: 1,
        number: 0,
        size: 1000,
      },
    }
  })
}

describe('ensureNotationImportCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetLoadedNotationCatalogIds([])
  })

  it('merges components and types for the selected notation', async () => {
    const state = emptyState()
    const ensureNotationRelationsAndRules = vi.fn(async () => {
      state.relations = [
        {
          id: 'rel-1',
          name: 'Serving',
          version: '1.0.0',
          ownerId: 'owner-1',
          notationId: 'not-archi',
          linkTypeId: 'lt-1',
          attrs: null,
        },
      ]
    })
    mockCatalogApis()

    await ensureNotationImportCatalog({
      modelId: 'model-1',
      notationId: 'not-archi',
      state,
      ensureNotationRelationsAndRules,
    })

    expect(fetchAllComponentsByNotationId).toHaveBeenCalledWith('not-archi', { modelId: 'model-1' })
    expect(ensureNotationRelationsAndRules).toHaveBeenCalledWith('not-archi')
    expect(state.components).toHaveLength(1)
    expect(state.components[0]?.name).toBe('Business Actor')
    expect(state.nodeTypes).toHaveLength(1)
    expect(state.linkTypes).toHaveLength(1)
    expect(state.relations).toHaveLength(1)
  })

  it('skips component refetch for notations already marked loaded', async () => {
    const state = emptyState()
    const ensureNotationRelationsAndRules = vi.fn(async () => undefined)
    mockCatalogApis()
    resetLoadedNotationCatalogIds(['not-archi'])

    await ensureNotationImportCatalog({
      modelId: 'model-1',
      notationId: 'not-archi',
      state,
      ensureNotationRelationsAndRules,
    })

    expect(fetchAllComponentsByNotationId).not.toHaveBeenCalled()
    expect(ensureNotationRelationsAndRules).toHaveBeenCalledWith('not-archi')
    expect(state.components).toHaveLength(0)
  })

  it('refetches components when force is set', async () => {
    const state = emptyState()
    const ensureNotationRelationsAndRules = vi.fn(async () => undefined)
    mockCatalogApis()
    resetLoadedNotationCatalogIds(['not-archi'])

    await ensureNotationImportCatalog({
      modelId: 'model-1',
      notationId: 'not-archi',
      state,
      ensureNotationRelationsAndRules,
      force: true,
    })

    expect(fetchAllComponentsByNotationId).toHaveBeenCalledWith('not-archi', { modelId: 'model-1' })
    expect(state.components).toHaveLength(1)
  })
})
