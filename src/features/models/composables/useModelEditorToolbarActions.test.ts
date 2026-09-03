import { computed, effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDiagramAttrs } from '../modelAttrs'
import { createEmptyModelEditorState } from '../types'
import { useModelEditorToolbarActions } from './useModelEditorToolbarActions'

describe('useModelEditorToolbarActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('save restores selected diagram id when previous id was replaced after save', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const oldDiagram = {
        id: 'd-old',
        name: 'Context',
        version: '1.0.0',
        notationId: 'notation-1',
        modelId: 'm-1',
        ownerId: 'o-1',
        nodeId: null,
        parsedAttrs: parseDiagramAttrs(null),
      }
      const newDiagram = {
        ...oldDiagram,
        id: 'd-new',
      }
      const state = ref({
        ...createEmptyModelEditorState(),
        diagrams: [newDiagram],
      })
      const selectedDiagramId = ref<string | null>('d-old')
      const saveWithValidation = vi.fn(async () => true)

      const api = useModelEditorToolbarActions({
        isSaving: ref(false),
        activeDiagram: computed(() => oldDiagram),
        saveWithValidation,
        state,
        selectedDiagramId,
        diagramHistoryBatcher: { flush: vi.fn() },
        diagramCanvasRef: ref(null),
        isDiagramReadOnly: computed(() => false),
        layoutPreviewBefore: ref(null),
        showLayoutPreviewModal: ref(false),
        gridVisible: ref(false),
        miniMapVisible: ref(false),
        snapEnabled: ref(false),
        alignEnabled: ref(false),
        rulersEnabled: ref(false),
        attachToOutlineEnabled: ref(false),
        autoLinkInGroups: ref(false),
        lockAnchorsEnabled: ref(false),
        diagramNavigationOnlyMode: ref(false),
        exportActiveDiagramAsPng: vi.fn(),
        exportActiveDiagramAsSvg: vi.fn(),
        showDiagramImageShareModal: ref(false),
        model: ref({ id: 'm-1', name: 'Model' }),
        router: { resolve: vi.fn() } as never,
        setUiError: vi.fn(),
        t: key => key,
        canInspectDiagramJson: computed(() => true),
        oefDetachedSnapshot: { load: vi.fn(), error: ref(null) },
        showImportWizard: ref(false),
        downloadModelPackage: vi.fn(),
        openValidationScriptsModal: vi.fn(),
        hasUnsavedChanges: computed(() => false),
        requestDiagramSwitch: vi.fn(),
        selectedModelNodeIds: ref([]),
        selectedInstanceIds: ref([]),
        selectedModelLinkId: ref(null),
        selectedEdgeInstanceId: ref(null),
        checkPermission: vi.fn(async () => true),
        openDiagramJson: vi.fn(),
        modelRootDocumentFileId: computed(() => null),
        handleOpenModelDoc: vi.fn(),
        handleOpenDiagramDoc: vi.fn(),
      })

      await api.handleToolbarAction('save')

      expect(saveWithValidation).toHaveBeenCalled()
      expect(selectedDiagramId.value).toBe('d-new')
    })
    scope.stop()
  })

  it('ignores save when save is already in progress', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const saveWithValidation = vi.fn(async () => true)
      const api = useModelEditorToolbarActions({
        isSaving: ref(true),
        activeDiagram: computed(() => null),
        saveWithValidation,
        state: ref(createEmptyModelEditorState()),
        selectedDiagramId: ref(null),
        diagramHistoryBatcher: { flush: vi.fn() },
        diagramCanvasRef: ref(null),
        isDiagramReadOnly: computed(() => false),
        layoutPreviewBefore: ref(null),
        showLayoutPreviewModal: ref(false),
        gridVisible: ref(false),
        miniMapVisible: ref(false),
        snapEnabled: ref(false),
        alignEnabled: ref(false),
        rulersEnabled: ref(false),
        attachToOutlineEnabled: ref(false),
        autoLinkInGroups: ref(false),
        lockAnchorsEnabled: ref(false),
        diagramNavigationOnlyMode: ref(false),
        exportActiveDiagramAsPng: vi.fn(),
        exportActiveDiagramAsSvg: vi.fn(),
        showDiagramImageShareModal: ref(false),
        model: ref(null),
        router: { resolve: vi.fn() } as never,
        setUiError: vi.fn(),
        t: key => key,
        canInspectDiagramJson: computed(() => false),
        oefDetachedSnapshot: { load: vi.fn(), error: ref(null) },
        showImportWizard: ref(false),
        downloadModelPackage: vi.fn(),
        openValidationScriptsModal: vi.fn(),
        hasUnsavedChanges: computed(() => false),
        requestDiagramSwitch: vi.fn(),
        selectedModelNodeIds: ref([]),
        selectedInstanceIds: ref([]),
        selectedModelLinkId: ref(null),
        selectedEdgeInstanceId: ref(null),
        checkPermission: vi.fn(async () => true),
        openDiagramJson: vi.fn(),
        modelRootDocumentFileId: computed(() => null),
        handleOpenModelDoc: vi.fn(),
        handleOpenDiagramDoc: vi.fn(),
      })

      await api.handleToolbarAction('save')
      expect(saveWithValidation).not.toHaveBeenCalled()
    })
    scope.stop()
  })
})
