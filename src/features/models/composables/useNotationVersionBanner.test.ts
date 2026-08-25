import { computed, effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/composables/useApi'
import { ensureNotationImportCatalog } from './ensureNotationImportCatalog'
import { useNotationVersionBanner } from './useNotationVersionBanner'
import type { EditorDiagram, ModelEditorState } from '../types'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

vi.mock('./ensureNotationImportCatalog', () => ({
  ensureNotationImportCatalog: vi.fn(async () => undefined),
}))

function emptyState(): ModelEditorState {
  return {
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodes: [],
    links: [],
    diagrams: [],
    notations: [{ id: 'not-new', name: 'ArchiMate', version: '1.0.0', ownerId: 'owner-1', attrs: null }],
    nodeTypes: [],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
  }
}

function diagram(notationId: string): EditorDiagram {
  return {
    id: 'diagram-1',
    name: 'New diagram',
    version: '1.0.0',
    ownerId: 'owner-1',
    modelId: 'model-1',
    nodeId: null,
    notationId,
    createdAt: null,
    updatedAt: null,
    parsedAttrs: { instances: { nodes: [], edges: [] } },
    _isNew: true,
  }
}

describe('useNotationVersionBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiGet).mockResolvedValue({ success: true, data: [] })
  })

  it('loads notation catalog when active notation becomes set', async () => {
    const scope = effectScope()
    const state = ref(emptyState())
    const selectedDiagramId = ref<string | null>(null)
    const activeDiagram = computed(() =>
      state.value.diagrams.find(item => item.id === selectedDiagramId.value) ?? null
    )
    const activeNotationId = computed(() => activeDiagram.value?.notationId ?? null)
    const ensureNotationRelationsAndRules = vi.fn(async () => undefined)

    scope.run(() => {
      useNotationVersionBanner({
        state,
        activeDiagram,
        activeNotationId,
        selectedDiagramId,
        t: key => key,
        ensureNotationRelationsAndRules,
        setUiError: vi.fn(),
      })
    })

    state.value.diagrams.push(diagram('not-new'))
    selectedDiagramId.value = 'diagram-1'
    await nextTick()
    await Promise.resolve()

    expect(ensureNotationImportCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'model-1',
        notationId: 'not-new',
        state,
        ensureNotationRelationsAndRules,
      })
    )

    scope.stop()
  })
})
