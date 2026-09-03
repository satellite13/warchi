import { describe, expect, it, vi, beforeEach } from 'vitest'
import { computed, effectScope, ref } from 'vue'
import { useModelEditorEntityDelete } from './useModelEditorEntityDelete'

describe('useModelEditorEntityDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens node delete dialog and confirms model delete', () => {
    const scope = effectScope()
    scope.run(() => {
      const markNodeDeleted = vi.fn()
      const state = ref({
        modelId: 'm1',
        nodes: [{ id: 'n1', name: 'Alpha' }],
        links: [],
        diagrams: [],
      } as never)

      const api = useModelEditorEntityDelete({
        state,
        activeDiagram: computed(() => null),
        selectedDiagramId: ref(null),
        isDiagramReadOnly: computed(() => false),
        t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
        setUiError: vi.fn(),
        discardUnsavedChanges: vi.fn(async () => true),
        applyDiagramSelection: vi.fn(),
        markNodeDeleted,
        markDiagramDeleted: vi.fn(),
        markLinkDeleted: vi.fn(),
        markDiagramDirty: vi.fn(),
        removeNodesFromCurrentDiagram: vi.fn(),
        removeNodesFromCurrentDiagramByInstances: vi.fn(),
        isDiagramOnlyEdgeModelLinkId: () => false,
        isUntypedModelLinkId: () => false,
        selectedModelNodeIds: ref([]),
        selectedInstanceIds: ref([]),
        selectedModelLinkId: ref(null),
        selectedEdgeInstanceId: ref(null),
        selectedCanvasElementId: ref(null),
        diagramInteractionManager: ref(null),
        isNoteInstance: () => false,
        isContainerInstance: () => false,
        isEdgeAnchorInstance: () => false,
        isDiagramNoteModelNodeId: () => false,
        isDiagramContainerModelNodeId: () => false,
        isEdgeAnchorModelNodeId: () => false,
        copySelectedNotesToClipboard: () => false,
        pasteCopiedNotes: () => false,
      })

      api.openNodeDeleteDialog(['n1'], 'tree')
      expect(api.showNodeDeleteModal.value).toBe(true)
      expect(api.nodeDeleteConfirmMessage.value).toContain('models.deleteNodeFromModelSingle')

      api.confirmNodeDelete()
      expect(markNodeDeleted).toHaveBeenCalledWith('n1')
      expect(api.showNodeDeleteModal.value).toBe(false)
    })
    scope.stop()
  })

  it('discards unsaved changes when switching diagram without save', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const discardUnsavedChanges = vi.fn(async () => true)
      const applyDiagramSelection = vi.fn()
      const clear = vi.fn()
      const state = ref({
        modelId: 'm1',
        nodes: [],
        links: [],
        diagrams: [{ id: 'd2', name: 'D2', _isDeleted: false }],
      } as never)
      const selectedDiagramId = ref<string | null>('d1')
      const selectedModelNodeIds = ref(['n1'])
      const selectedInstanceIds = ref(['i1'])
      const selectedModelLinkId = ref<string | null>('l1')
      const selectedEdgeInstanceId = ref<string | null>('e1')

      const api = useModelEditorEntityDelete({
        state,
        activeDiagram: computed(() => null),
        selectedDiagramId,
        isDiagramReadOnly: computed(() => false),
        t: key => key,
        setUiError: vi.fn(),
        discardUnsavedChanges,
        applyDiagramSelection,
        markNodeDeleted: vi.fn(),
        markDiagramDeleted: vi.fn(),
        markLinkDeleted: vi.fn(),
        markDiagramDirty: vi.fn(),
        removeNodesFromCurrentDiagram: vi.fn(),
        removeNodesFromCurrentDiagramByInstances: vi.fn(),
        isDiagramOnlyEdgeModelLinkId: () => false,
        isUntypedModelLinkId: () => false,
        selectedModelNodeIds,
        selectedInstanceIds,
        selectedModelLinkId,
        selectedEdgeInstanceId,
        selectedCanvasElementId: ref(null),
        diagramInteractionManager: ref({ history: { clear } }),
        isNoteInstance: () => false,
        isContainerInstance: () => false,
        isEdgeAnchorInstance: () => false,
        isDiagramNoteModelNodeId: () => false,
        isDiagramContainerModelNodeId: () => false,
        isEdgeAnchorModelNodeId: () => false,
        copySelectedNotesToClipboard: () => false,
        pasteCopiedNotes: () => false,
      })

      api.requestDiagramSwitch('switch', 'd2')
      expect(api.showDiagramSwitchModal.value).toBe(true)

      await api.switchDiagramWithoutSave()
      expect(discardUnsavedChanges).toHaveBeenCalled()
      expect(clear).toHaveBeenCalled()
      expect(applyDiagramSelection).toHaveBeenCalledWith('d2')
      expect(api.showDiagramSwitchModal.value).toBe(false)
    })
    scope.stop()
  })
})
