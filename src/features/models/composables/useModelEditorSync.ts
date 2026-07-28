import { computed, watch, type Ref } from 'vue'
import type { DiagramRenderer } from '@ngroznykh/papirus'
import type { ModelData } from '@/types/entities'
import type { ModelEditorState } from '../types'
import { useDiagramEditLock } from './useDiagramEditLock'
import { useDiagramRealtimeCollab } from './useDiagramRealtimeCollab'
import { useModelLiveSync } from './useModelLiveSync'

export function useModelEditorSync(options: {
  modelId: Ref<string | null | undefined>
  state: Ref<ModelEditorState>
  model: Ref<ModelData | null>
  enabled: Ref<boolean>
  isLoading: Ref<boolean>
  isSaving: Ref<boolean>
  modelDirty: Ref<boolean>
  selectedDiagramId: Ref<string | null>
  activeDiagramUpdatedAt: Ref<string | null | undefined>
  isActiveDiagramLatest: Ref<boolean>
  isDiagramReadOnlyBaseline: Ref<boolean>
  canEditModel: Ref<boolean>
  canInspectDiagramJson: Ref<boolean>
  isSelectedDiagramPersistedOnServer: Ref<boolean>
  currentUserId: Ref<string | null | undefined>
  getDiagramRenderer: () => DiagramRenderer | null
  ensureNotationRelationsAndRules: (notationId: string) => Promise<void>
  onModelUnavailable?: (status: number) => void
}) {
  const diagramEditLock = useDiagramEditLock({
    modelId: options.modelId,
    selectedDiagramId: options.selectedDiagramId,
    isActiveDiagramLatest: options.isActiveDiagramLatest,
    canEditModel: options.canEditModel,
    isSelectedDiagramPersistedOnServer: options.isSelectedDiagramPersistedOnServer,
  })

  watch(
    [
      () => diagramEditLock.isBlockedByOther.value,
      () => options.activeDiagramUpdatedAt.value,
      () => diagramEditLock.remoteDiagramUpdatedAt.value,
    ],
    () => {
      if (diagramEditLock.isBlockedByOther.value) {
        diagramEditLock.evaluateServerNewer(options.activeDiagramUpdatedAt.value ?? null)
      }
    }
  )

  const diagramLocksForTree = computed(() => diagramEditLock.locksList.value)
  const diagramLockBlockedByOther = computed(() => diagramEditLock.isBlockedByOther.value)
  const diagramLockHolderName = computed(() => diagramEditLock.lockHolderDisplay.value ?? '—')
  const diagramLockServerNewerWhileBlocked = computed(
    () => diagramEditLock.serverNewerWhileBlocked.value
  )

  const activeDiagram = computed(() =>
    options.selectedDiagramId.value
      ? (options.state.value.diagrams.find(
          (diagram) => diagram.id === options.selectedDiagramId.value && !diagram._isDeleted
        ) ?? null)
      : null
  )

  const isDiagramLockHolder = computed(
    () =>
      options.canEditModel.value &&
      !!activeDiagram.value &&
      options.isActiveDiagramLatest.value &&
      options.isSelectedDiagramPersistedOnServer.value &&
      diagramEditLock.isLockHeld.value &&
      !diagramEditLock.isBlockedByOther.value
  )

  const isDiagramReadOnly = computed(
    () =>
      !options.canInspectDiagramJson.value ||
      options.isDiagramReadOnlyBaseline.value ||
      diagramEditLock.isBlockedByOther.value
  )

  const collab = useDiagramRealtimeCollab({
    state: options.state,
    selectedDiagramId: options.selectedDiagramId,
    currentUserId: options.currentUserId,
    getDiagramRenderer: options.getDiagramRenderer,
    isLockHolder: isDiagramLockHolder,
    isSpectator: diagramLockBlockedByOther,
  })

  useModelLiveSync({
    modelId: options.modelId,
    state: options.state,
    model: options.model,
    enabled: options.enabled,
    isLoading: options.isLoading,
    isSaving: options.isSaving,
    modelDirty: options.modelDirty,
    ensureNotationRelationsAndRules: options.ensureNotationRelationsAndRules,
    openDiagramId: options.selectedDiagramId,
    currentUserId: options.currentUserId,
    preserveOpenDiagramCanvasInstances: computed(() => !diagramEditLock.isBlockedByOther.value),
    onModelTopicBroadcast: collab.handleModelTopicBroadcast,
    onModelUnavailable: options.onModelUnavailable,
  })

  async function handleReloadModelForDiagramLock(loadModel: () => Promise<void>): Promise<void> {
    await diagramEditLock.reloadAfterRemoteChange(loadModel)
  }

  return {
    diagramEditLock,
    diagramLocksForTree,
    diagramLockBlockedByOther,
    diagramLockHolderName,
    diagramLockServerNewerWhileBlocked,
    isDiagramLockHolder,
    isDiagramReadOnly,
    remoteEditorPointer: collab.remoteEditorPointer,
    diagramSpectators: collab.diagramSpectators,
    onLiveCollaborationGesture: collab.onLiveCollaborationGesture,
    scheduleDebouncedLivePush: collab.scheduleDebouncedLivePush,
    onCanvasMouseMoveForPointer: collab.onCanvasMouseMoveForPointer,
    onCanvasMouseLeaveForPointer: collab.onCanvasMouseLeaveForPointer,
    handleReloadModelForDiagramLock,
    verifyLockBeforeSave: diagramEditLock.verifyLockBeforeSave,
    dismissForceRevoked: diagramEditLock.dismissForceRevoked,
  }
}
