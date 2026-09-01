import type { ComputedRef, Ref } from 'vue'
import type { Router } from 'vue-router'
import type { PermissionAction, PermissionResourceType } from '@/types/api'
import { isSaveLockedToolbarEvent } from '../utils/modelEditorToolbarLock'
import { clonePlainDeep } from '@/utils/clonePlainDeep'
import { sanitizeFileName } from '@/utils/sanitizeFileName'
import { modelEditorDiagramHref } from '../utils/modelEditorDiagramLink'
import type { DiagramAttrs } from '../modelAttrs'
import type { EditorDiagram, ModelEditorState } from '../types'
import type ModelDiagramCanvas from '../components/ModelDiagramCanvas.vue'

type Translate = (key: string, params?: Record<string, unknown>) => string

export function useModelEditorToolbarActions(options: {
  activeDiagram: ComputedRef<EditorDiagram | null>
  alignEnabled: Ref<boolean>
  attachToOutlineEnabled: Ref<boolean>
  autoLinkInGroups: Ref<boolean>
  canInspectDiagramJson: ComputedRef<boolean>
  checkPermission: (input: {
    resourceType: PermissionResourceType
    resourceId: string
    action: PermissionAction
  }) => Promise<boolean>
  diagramCanvasRef: Ref<InstanceType<typeof ModelDiagramCanvas> | null>
  diagramHistoryBatcher: { flush: () => void }
  diagramNavigationOnlyMode: Ref<boolean>
  downloadModelPackage: (modelId: string, fileName: string) => Promise<void>
  exportActiveDiagramAsPng: () => Promise<void>
  exportActiveDiagramAsSvg: () => void
  gridVisible: Ref<boolean>
  handleOpenDiagramDoc: () => void
  handleOpenModelDoc: () => void
  hasUnsavedChanges: ComputedRef<boolean>
  isDiagramReadOnly: ComputedRef<boolean>
  isSaving: Ref<boolean>
  layoutPreviewBefore: Ref<DiagramAttrs | null>
  lockAnchorsEnabled: Ref<boolean>
  miniMapVisible: Ref<boolean>
  model: Ref<{ id: string; name: string } | null>
  modelRootDocumentFileId: ComputedRef<string | null>
  oefDetachedSnapshot: {
    load: () => Promise<unknown>
    error: Ref<string | null>
  }
  openDiagramJson: () => void
  openValidationScriptsModal: () => void
  requestDiagramSwitch: (action: 'close' | 'switch', diagramId?: string) => void
  router: Router
  rulersEnabled: Ref<boolean>
  saveWithValidation: () => Promise<boolean>
  selectedDiagramId: Ref<string | null>
  selectedEdgeInstanceId: Ref<string | null>
  selectedInstanceIds: Ref<string[]>
  selectedModelLinkId: Ref<string | null>
  selectedModelNodeIds: Ref<string[]>
  setUiError: (message: string) => void
  showDiagramImageShareModal: Ref<boolean>
  showImportWizard: Ref<boolean>
  showLayoutPreviewModal: Ref<boolean>
  snapEnabled: Ref<boolean>
  state: Ref<ModelEditorState>
  t: Translate
}) {
  const handleToolbarAction = async (event: string) => {
    if (isSaveLockedToolbarEvent(event, options.isSaving.value)) return
    switch (event) {
      case 'save': {
        const openedBeforeSave = options.activeDiagram.value
          ? {
              name: options.activeDiagram.value.name,
              version: options.activeDiagram.value.version,
              nodeId: options.activeDiagram.value.nodeId ?? null,
              notationId: options.activeDiagram.value.notationId,
            }
          : null
        const ok = await options.saveWithValidation()
        if (!ok || !openedBeforeSave) break
        const stillOpened = options.state.value.diagrams.some(
          diagram => diagram.id === options.selectedDiagramId.value && !diagram._isDeleted
        )
        if (stillOpened) break
        const restored = options.state.value.diagrams.find(
          diagram =>
            !diagram._isDeleted &&
            diagram.name === openedBeforeSave.name &&
            diagram.version === openedBeforeSave.version &&
            (diagram.nodeId ?? null) === openedBeforeSave.nodeId &&
            diagram.notationId === openedBeforeSave.notationId
        )
        if (restored) {
          options.selectedDiagramId.value = restored.id
        }
        break
      }
      case 'undo':
        options.diagramHistoryBatcher.flush()
        options.diagramCanvasRef.value?.undo()
        break
      case 'redo':
        options.diagramHistoryBatcher.flush()
        options.diagramCanvasRef.value?.redo()
        break
      case 'zoom-in':
        options.diagramCanvasRef.value?.zoomIn()
        break
      case 'zoom-out':
        options.diagramCanvasRef.value?.zoomOut()
        break
      case 'fit-screen':
        options.diagramCanvasRef.value?.fitToView()
        break
      case 'zoom-selection':
        options.diagramCanvasRef.value?.zoomToSelection()
        break
      case 'auto-layout-nodes': {
        const d = options.activeDiagram.value
        if (!d || options.isDiagramReadOnly.value) break
        options.layoutPreviewBefore.value = clonePlainDeep(d.parsedAttrs)
        options.showLayoutPreviewModal.value = true
        break
      }
      case 'reset-view':
        options.diagramCanvasRef.value?.resetView()
        break
      case 'toggle-grid': {
        const next = options.diagramCanvasRef.value?.toggleGrid()
        if (typeof next === 'boolean') {
          options.gridVisible.value = next
        }
        break
      }
      case 'toggle-minimap': {
        const next = options.diagramCanvasRef.value?.toggleMiniMap()
        if (typeof next === 'boolean') {
          options.miniMapVisible.value = next
        }
        break
      }
      case 'toggle-snap': {
        const next = options.diagramCanvasRef.value?.toggleSnap()
        if (typeof next === 'boolean') {
          options.snapEnabled.value = next
        }
        break
      }
      case 'toggle-align': {
        const next = options.diagramCanvasRef.value?.toggleAlign()
        if (typeof next === 'boolean') {
          options.alignEnabled.value = next
        }
        break
      }
      case 'toggle-rulers': {
        const next = options.diagramCanvasRef.value?.toggleRulers()
        if (typeof next === 'boolean') {
          options.rulersEnabled.value = next
        }
        break
      }
      case 'toggle-outline': {
        options.attachToOutlineEnabled.value = !options.attachToOutlineEnabled.value
        break
      }
      case 'toggle-auto-link-in-groups': {
        options.autoLinkInGroups.value = !options.autoLinkInGroups.value
        break
      }
      case 'toggle-lock-anchors': {
        const next = options.diagramCanvasRef.value?.toggleLockAnchors()
        if (typeof next === 'boolean') options.lockAnchorsEnabled.value = next
        break
      }
      case 'toggle-navigation-mode':
        options.diagramNavigationOnlyMode.value = !options.diagramNavigationOnlyMode.value
        break
      case 'export-diagram-png':
        await options.exportActiveDiagramAsPng()
        break
      case 'export-diagram-svg':
        options.exportActiveDiagramAsSvg()
        break
      case 'share-diagram-image':
        options.showDiagramImageShareModal.value = true
        break
      case 'copy-diagram-link': {
        const modelId = options.model.value?.id
        const diagramId = options.activeDiagram.value?.id
        if (!modelId || !diagramId) break
        const href = modelEditorDiagramHref(
          to => options.router.resolve(to),
          window.location.origin,
          modelId,
          diagramId
        )
        try {
          await navigator.clipboard.writeText(href)
        } catch {
          options.setUiError(options.t('models.copyDiagramLinkFailed'))
        }
        break
      }
      case 'import-oef':
        if (options.canInspectDiagramJson.value) {
          const loadedSnapshot = await options.oefDetachedSnapshot.load()
          if (!loadedSnapshot) {
            options.setUiError(options.oefDetachedSnapshot.error.value ?? options.t('common.error'))
            break
          }
          options.showImportWizard.value = true
        }
        break
      case 'export-model-package': {
        const modelId = options.model.value?.id
        if (!modelId) break
        try {
          const fileName = `${sanitizeFileName(options.model.value?.name ?? '') || 'model'}.zip`
          await options.downloadModelPackage(modelId, fileName)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          options.setUiError(options.t('models.packageExportFailed', { message }))
        }
        break
      }
      case 'run-validation-script':
        options.openValidationScriptsModal()
        break
      case 'close-diagram':
        if (options.activeDiagram.value && options.hasUnsavedChanges.value) {
          options.requestDiagramSwitch('close')
          break
        }
        options.selectedDiagramId.value = null
        options.selectedModelNodeIds.value = []
        options.selectedInstanceIds.value = []
        options.selectedModelLinkId.value = null
        options.selectedEdgeInstanceId.value = null
        break
      case 'show-diagram-json':
        if (
          options.model.value?.id &&
          (await options.checkPermission({
            resourceType: 'MODEL',
            resourceId: options.model.value.id,
            action: 'EDIT',
          }))
        ) {
          options.openDiagramJson()
        }
        break
      case 'open-model-doc': {
        const hasModelDoc = !!options.modelRootDocumentFileId.value
        if (!options.canInspectDiagramJson.value && !hasModelDoc) break
        options.handleOpenModelDoc()
        break
      }
      case 'open-diagram-doc': {
        const d = options.activeDiagram.value
        if (!d) break
        const hasDiagramDoc =
          typeof d.parsedAttrs?.documentFileId === 'string' &&
          d.parsedAttrs.documentFileId.trim().length > 0
        if (!options.canInspectDiagramJson.value && !hasDiagramDoc) break
        options.handleOpenDiagramDoc()
        break
      }
    }
  }

  return {
    handleToolbarAction,
  }
}
