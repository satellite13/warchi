import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiPost } from '@/composables/useApi'
import { useSaveState } from '@/composables/useSaveState'
import type { ModelData } from '@/types/entities'
import type { DiagramResponse } from '@/types/api'
import {
  createEmptyModelEditorState,
  type EditorDiagram,
  type ModelEditorState,
} from '../types'
import type { BatchConflictItem } from './useModelBatchSave'
import { toEditorDiagram } from './modelEditorMappers'
import { loadModelEditorData } from './modelEditorLoadModel'
import { executeModelEditorSave } from './modelEditorSaveCoordinator'
import { useModelBatchConflictResolution } from './useModelBatchConflictResolution'
import { useModelEditorStateHelpers } from './useModelEditorStateHelpers'
import { useNotationRelationsAndRulesLoader } from './useNotationRelationsAndRulesLoader'

type ModelEditorReturn = {
  model: Ref<ModelData | null>
  state: Ref<ModelEditorState>
  isLoading: Ref<boolean>
  errorMessage: Ref<string | null>
  /** true, если менялись метаданные модели (имя/версия/attrs) без сохранения */
  modelDirty: Ref<boolean>
  isSaving: Ref<boolean>
  saveError: Ref<string | null>
  saveSuccess: Ref<boolean>
  saveProgress: Ref<string>
  hasUnsavedChanges: ComputedRef<boolean>
  loadModel: () => Promise<void>
  saveChanges: () => Promise<boolean>
  markNodeDirty: (id: string) => void
  markLinkDirty: (id: string) => void
  markDiagramDirty: (id: string) => void
  markModelDirty: () => void
  renameModel: (nextName: string) => string | null
  handleBack: () => void
  createDiagramBaseline: (diagramId: string) => Promise<EditorDiagram | null>
  ensureNotationRelationsAndRules: (
    notationId: string,
    options?: { force?: boolean }
  ) => Promise<void>
  isNotationRelationsAndRulesLoading: (notationId: string | null | undefined) => boolean
  /** Конфликт версий при batch-save (409); null если нет */
  batchSaveConflict: Ref<BatchConflictItem[] | null>
  /** Подтянуть модель с сервера и закрыть диалог конфликта */
  resolveBatchSaveReload: () => Promise<void>
  /** Повторить сохранение с force=true (перезаписать сервер) */
  resolveBatchSaveOverwrite: () => Promise<boolean>
  /** Закрыть диалог конфликта без действия */
  dismissBatchSaveConflict: () => void
}

export const useModelEditor = (): ModelEditorReturn => {
  const route = useRoute()
  const router = useRouter()

  const model = ref<ModelData | null>(null)
  const state = ref<ModelEditorState>(createEmptyModelEditorState())
  const isLoading = ref(true)
  const errorMessage = ref<string | null>(null)
  const { isSaving, saveError, saveSuccess, saveProgress, startSave, completeSave, finishSave } = useSaveState()
  const pendingForceBatch = ref(false)
  const batchSaveConflict = ref<BatchConflictItem[] | null>(null)
  const modelDirty = ref(false)
  const modelInitialName = ref('')
  const modelCatalog = ref<ModelData[]>([])

  const {
    ensureNotationRelationsAndRules,
    isNotationRelationsAndRulesLoading,
    resetLoadedNotationIds,
  } = useNotationRelationsAndRulesLoader(state)
  const {
    markNodeDirty,
    markLinkDirty,
    markDiagramDirty,
    markModelDirty,
    renameModel,
    scheduleSaveErrorClear,
    disposeSaveErrorTimer,
  } = useModelEditorStateHelpers({
    state,
    model,
    modelDirty,
    modelInitialName,
    modelCatalog,
    saveError,
  })

  onScopeDispose(() => {
    disposeSaveErrorTimer()
  })

  const hasUnsavedChanges = computed(() => {
    const hasDirtyNodes = state.value.nodes.some(
      item => item._isNew || item._isDirty || item._isDeleted
    )
    const hasDirtyLinks = state.value.links.some(
      item => item._isNew || item._isDirty || item._isDeleted
    )
    const hasDirtyDiagrams = state.value.diagrams.some(
      item => item._isNew || item._isDirty || item._isDeleted
    )
    return modelDirty.value || hasDirtyNodes || hasDirtyLinks || hasDirtyDiagrams
  })

  const loadModel = async (): Promise<void> => {
    const modelId = route.params.id
    if (!modelId || typeof modelId !== 'string') {
      errorMessage.value = 'Не удалось определить модель.'
      isLoading.value = false
      return
    }

    isLoading.value = true
    errorMessage.value = null

    try {
      const loaded = await loadModelEditorData(modelId)
      model.value = loaded.model
      modelInitialName.value = loaded.model.name
      modelDirty.value = false
      modelCatalog.value = loaded.modelCatalog
      resetLoadedNotationIds(loaded.loadedNotationIds)
      state.value = loaded.state
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Не удалось загрузить модель.'
    } finally {
      isLoading.value = false
    }
  }

  const saveChanges = async (): Promise<boolean> => {
    if (!model.value) return false
    if (isSaving.value) return false
    startSave()
    batchSaveConflict.value = null

    try {
      const success = await executeModelEditorSave({
        model,
        modelDirty,
        modelInitialName,
        modelCatalog,
        state,
        pendingForceBatch,
        batchSaveConflict,
        saveError,
        onProgress: (msg: string) => {
          saveProgress.value = msg
        },
        scheduleSaveErrorClear,
      })

      if (!success) {
        return false
      }

      completeSave(2500)
      return true
    } finally {
      finishSave()
    }
  }

  const handleBack = () => {
    router.push({ name: 'models' })
  }

  const createDiagramBaseline = async (diagramId: string): Promise<EditorDiagram | null> => {
    const result = await apiPost<DiagramResponse>(`/diagrams/${diagramId}/baseline`, {})
    if (!result.success) return null
    const editorDiagram = toEditorDiagram(result.data)
    state.value.diagrams = [...state.value.diagrams, editorDiagram]
    return editorDiagram
  }

  const { resolveBatchSaveReload, resolveBatchSaveOverwrite, dismissBatchSaveConflict } =
    useModelBatchConflictResolution({
      state,
      batchSaveConflict,
      errorMessage,
      pendingForceBatch,
      loadModel,
      saveChanges,
    })

  return {
    model,
    state,
    isLoading,
    errorMessage,
    modelDirty,
    isSaving,
    saveError,
    saveSuccess,
    saveProgress,
    hasUnsavedChanges,
    loadModel,
    saveChanges,
    markNodeDirty,
    markLinkDirty,
    markDiagramDirty,
    markModelDirty,
    renameModel,
    handleBack,
    createDiagramBaseline,
    ensureNotationRelationsAndRules,
    isNotationRelationsAndRulesLoading,
    batchSaveConflict,
    resolveBatchSaveReload,
    resolveBatchSaveOverwrite,
    dismissBatchSaveConflict,
  }
}
