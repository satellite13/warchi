import { describe, expect, it, vi, beforeEach } from 'vitest'
import { effectScope, ref } from 'vue'

const mocks = vi.hoisted(() => ({
  prepareValidationScriptRun: vi.fn(),
  buildDiagramScriptSnapshot: vi.fn(),
  createDiagramScriptQueryHost: vi.fn(),
  applyDiagramScriptCommands: vi.fn(),
  validateCommandQueue: vi.fn(),
  resolveModelNodes: vi.fn(),
  resolveModelLinks: vi.fn(),
  fetchGraphNeighbors: vi.fn(),
  searchModelNodes: vi.fn(),
  resolveCompatibleNotationComponents: vi.fn(),
}))

vi.mock('./prepareValidationScriptRun', () => ({
  prepareValidationScriptRun: mocks.prepareValidationScriptRun,
}))

vi.mock('@/features/validation-scripts/sandbox/buildDiagramScriptSnapshot', () => ({
  buildDiagramScriptSnapshot: mocks.buildDiagramScriptSnapshot,
}))

vi.mock('@/features/validation-scripts/sandbox/diagramScriptQueryHost', () => ({
  createDiagramScriptQueryHost: mocks.createDiagramScriptQueryHost,
}))

vi.mock('@/features/validation-scripts/sandbox/applyDiagramScriptCommands', () => ({
  applyDiagramScriptCommands: mocks.applyDiagramScriptCommands,
}))

vi.mock('@/features/validation-scripts/sandbox/diagramScriptCommands', () => ({
  validateCommandQueue: mocks.validateCommandQueue,
}))

vi.mock('./modelScopedApi', () => ({
  resolveModelNodes: mocks.resolveModelNodes,
  resolveModelLinks: mocks.resolveModelLinks,
  fetchGraphNeighbors: mocks.fetchGraphNeighbors,
  searchModelNodes: mocks.searchModelNodes,
}))

vi.mock('../modelAttrs', () => ({
  resolveCompatibleNotationComponents: mocks.resolveCompatibleNotationComponents,
}))

import { useModelEditorScriptRun } from './useModelEditorScriptRun'

describe('useModelEditorScriptRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens modal with prepared payload', () => {
    const scope = effectScope()
    scope.run(() => {
      const payload = { openDiagramId: 'd1', snapshot: true }
      mocks.prepareValidationScriptRun.mockReturnValue({ ok: true, payload })

      const api = useModelEditorScriptRun({
        model: ref({ name: 'M', version: '1.0.0' }),
        state: ref({
          modelId: 'm1',
          nodes: [],
          links: [],
          diagrams: [],
          components: [],
        } as never),
        selectedDiagramId: ref('d1'),
        activeDiagram: ref(null),
        isDiagramReadOnly: ref(false),
        t: key => key,
        setUiError: vi.fn(),
        partialStore: {
          store: { beginRequest: vi.fn() },
          mergePartialEntities: vi.fn(),
        },
        executeDiagramHistoryCommand: vi.fn(),
        markDiagramDirty: vi.fn(),
        invalidateTraceabilityDiagrams: vi.fn(),
        selectDiagram: vi.fn(),
        selectedNodeId: ref(null),
        selectedModelNodeIds: ref([]),
        selectedModelLinkId: ref(null),
        focusTreeNode: vi.fn(),
      })

      api.openValidationScriptsModal()
      expect(api.showValidationScriptsModal.value).toBe(true)
      expect(api.validationRunPayload.value).toEqual(payload)
    })
    scope.stop()
  })

  it('selects tree node from validation issue', () => {
    const scope = effectScope()
    scope.run(() => {
      const selectedNodeId = ref<string | null>(null)
      const selectedModelNodeIds = ref<string[]>([])
      const focusTreeNode = vi.fn()
      const api = useModelEditorScriptRun({
        model: ref({ name: 'M', version: '1.0.0' }),
        state: ref({ modelId: 'm1', nodes: [], links: [], diagrams: [], components: [] } as never),
        selectedDiagramId: ref('d1'),
        activeDiagram: ref(null),
        isDiagramReadOnly: ref(false),
        t: key => key,
        setUiError: vi.fn(),
        partialStore: {
          store: { beginRequest: vi.fn() },
          mergePartialEntities: vi.fn(),
        },
        executeDiagramHistoryCommand: vi.fn(),
        markDiagramDirty: vi.fn(),
        invalidateTraceabilityDiagrams: vi.fn(),
        selectDiagram: vi.fn(),
        selectedNodeId,
        selectedModelNodeIds,
        selectedModelLinkId: ref(null),
        focusTreeNode,
      })

      api.showValidationScriptsModal.value = true
      api.handleValidationIssueSelect({
        id: 'i1',
        severity: 'error',
        message: 'x',
        target: { kind: 'node', id: 'n9' },
      } as never)

      expect(api.showValidationScriptsModal.value).toBe(false)
      expect(selectedNodeId.value).toBe('n9')
      expect(selectedModelNodeIds.value).toEqual(['n9'])
      expect(focusTreeNode).toHaveBeenCalledWith('n9')
    })
    scope.stop()
  })
})
