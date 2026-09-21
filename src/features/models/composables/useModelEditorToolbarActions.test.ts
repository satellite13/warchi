import { computed, effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDiagramAttrs } from '../modelAttrs'
import { createEmptyModelEditorState } from '../types'
import { useModelEditorToolbarActions } from './useModelEditorToolbarActions'

const grantsState = vi.hoisted(() => ({
  hasGrant: vi.fn((_key: string) => true),
}))

vi.mock('@/composables/useFeatureGrants', () => ({
  useFeatureGrants: () => ({
    hasGrant: grantsState.hasGrant,
  }),
}))

function buildOptions(overrides: Record<string, unknown> = {}) {
  return {
    isSaving: ref(false),
    activeDiagram: computed(() => null),
    saveWithValidation: vi.fn(async () => true),
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
    model: ref({ id: 'm-1', name: 'Model' }),
    router: { resolve: vi.fn() } as never,
    setUiError: vi.fn(),
    t: (key: string) => key,
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
    commentsVisible: ref(false),
    openDiagramJson: vi.fn(),
    modelRootDocumentFileId: computed(() => null),
    handleOpenModelDoc: vi.fn(),
    handleOpenDiagramDoc: vi.fn(),
    ...overrides,
  }
}

describe('useModelEditorToolbarActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    grantsState.hasGrant.mockReset()
    grantsState.hasGrant.mockImplementation(() => true)
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

      const api = useModelEditorToolbarActions(
        buildOptions({
          activeDiagram: computed(() => oldDiagram),
          saveWithValidation,
          state,
          selectedDiagramId,
          canInspectDiagramJson: computed(() => true),
        }) as never
      )

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
      const api = useModelEditorToolbarActions(
        buildOptions({
          isSaving: ref(true),
          model: ref(null),
          saveWithValidation,
        }) as never
      )

      await api.handleToolbarAction('save')
      expect(saveWithValidation).not.toHaveBeenCalled()
    })
    scope.stop()
  })

  it('blocks export-model-package without model.export grant', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      grantsState.hasGrant.mockImplementation((key: string) => key !== 'model.export')
      const downloadModelPackage = vi.fn()
      const api = useModelEditorToolbarActions(buildOptions({ downloadModelPackage }) as never)

      await api.handleToolbarAction('export-model-package')

      expect(downloadModelPackage).not.toHaveBeenCalled()
    })
    scope.stop()
  })

  it('exports model package when model.export grant is present', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const downloadModelPackage = vi.fn(async () => undefined)
      const api = useModelEditorToolbarActions(buildOptions({ downloadModelPackage }) as never)

      await api.handleToolbarAction('export-model-package')

      expect(downloadModelPackage).toHaveBeenCalledWith('m-1', 'model.zip')
    })
    scope.stop()
  })

  it('blocks export-diagram-png without model.exportDiagramImage grant', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      grantsState.hasGrant.mockImplementation((key: string) => key !== 'model.exportDiagramImage')
      const exportActiveDiagramAsPng = vi.fn()
      const api = useModelEditorToolbarActions(buildOptions({ exportActiveDiagramAsPng }) as never)

      await api.handleToolbarAction('export-diagram-png')

      expect(exportActiveDiagramAsPng).not.toHaveBeenCalled()
    })
    scope.stop()
  })

  it('blocks import-oef without model.importOef grant', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      grantsState.hasGrant.mockImplementation((key: string) => key !== 'model.importOef')
      const load = vi.fn(async () => ({ ok: true }))
      const showImportWizard = ref(false)
      const api = useModelEditorToolbarActions(
        buildOptions({
          canInspectDiagramJson: computed(() => true),
          oefDetachedSnapshot: { load, error: ref(null) },
          showImportWizard,
        }) as never
      )

      await api.handleToolbarAction('import-oef')

      expect(load).not.toHaveBeenCalled()
      expect(showImportWizard.value).toBe(false)
    })
    scope.stop()
  })

  it('blocks run-validation-script without model.runValidationScripts grant', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      grantsState.hasGrant.mockImplementation(
        (key: string) => key !== 'model.runValidationScripts'
      )
      const openValidationScriptsModal = vi.fn()
      const api = useModelEditorToolbarActions(
        buildOptions({ openValidationScriptsModal }) as never
      )

      await api.handleToolbarAction('run-validation-script')

      expect(openValidationScriptsModal).not.toHaveBeenCalled()
    })
    scope.stop()
  })

  it('blocks show-diagram-json without model.inspectJson grant', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      grantsState.hasGrant.mockImplementation((key: string) => key !== 'model.inspectJson')
      const openDiagramJson = vi.fn()
      const checkPermission = vi.fn(async () => true)
      const api = useModelEditorToolbarActions(
        buildOptions({ openDiagramJson, checkPermission }) as never
      )

      await api.handleToolbarAction('show-diagram-json')

      expect(checkPermission).not.toHaveBeenCalled()
      expect(openDiagramJson).not.toHaveBeenCalled()
    })
    scope.stop()
  })
})
