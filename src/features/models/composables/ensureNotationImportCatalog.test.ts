import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
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

  it('skips component refetch when the notation is marked loaded and already has components', async () => {
    const state = emptyState()
    state.components = [
      {
        id: 'cmp-1',
        name: 'Business Actor',
        version: '1.0.0',
        ownerId: 'owner-1',
        notationId: 'not-archi',
        nodeTypeId: 'nt-1',
        attrs: null,
      },
    ]
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
    expect(state.components).toHaveLength(1)
  })

  it('refetches when the notation is marked loaded but components are missing', async () => {
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

    expect(fetchAllComponentsByNotationId).toHaveBeenCalledWith('not-archi', { modelId: 'model-1' })
    expect(state.components).toHaveLength(1)
  })

  it('writes the catalog onto the current state ref after a mid-await replacement', async () => {
    const state = ref(emptyState())
    const ensureNotationRelationsAndRules = vi.fn(async () => undefined)
    let resolveComponents!: (value: Awaited<ReturnType<typeof fetchAllComponentsByNotationId>>) => void
    vi.mocked(fetchAllComponentsByNotationId).mockReturnValue(
      new Promise(resolve => {
        resolveComponents = resolve
      })
    )
    vi.mocked(apiGet).mockResolvedValue({
      success: true as const,
      data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 1000 },
    })

    const original = state.value
    const pending = ensureNotationImportCatalog({
      modelId: 'model-1',
      notationId: 'not-archi',
      state,
      ensureNotationRelationsAndRules,
    })

    state.value = emptyState()

    resolveComponents([
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
    await pending

    expect(original.components).toHaveLength(0)
    expect(state.value.components).toHaveLength(1)
    expect(state.value.components[0]?.id).toBe('cmp-1')
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
