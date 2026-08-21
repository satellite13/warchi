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
import {
  createModelEditorLoadProgressTracker,
  type ModelEditorLoadProgress,
} from '../utils/modelEditorLoadProgress'
import type { BatchConflictItem } from './useModelBatchSave'
import { toEditorDiagram } from './modelEditorMappers'
import {
  loadModelEditorCatalog,
  loadModelEditorShell,
  type ModelEditorLoadCancellationOptions,
} from './modelEditorLoadModel'
import { discardUnsavedModelChanges } from './discardUnsavedModelChanges'
import { executeModelEditorSave } from './modelEditorSaveCoordinator'
import { useModelBatchConflictResolution } from './useModelBatchConflictResolution'
import { useModelEditorStateHelpers } from './useModelEditorStateHelpers'
import { useModelPartialStore } from './useModelPartialStore'
import { useNotationRelationsAndRulesLoader } from './useNotationRelationsAndRulesLoader'
import { resetLoadedNotationCatalogIds } from './ensureNotationImportCatalog'

type ModelEditorReturn = {
  model: Ref<ModelData | null>
  state: Ref<ModelEditorState>
  isLoading: Ref<boolean>
  loadProgress: Ref<ModelEditorLoadProgress | null>
  errorMessage: Ref<string | null>
  catalogLoadWarning: Ref<string | null>
  retryCatalogLoad: () => Promise<void>
  /** true, если менялись метаданные модели (имя/версия/attrs) без сохранения */
  modelDirty: Ref<boolean>
  modelInitialName: Ref<string>
  isSaving: Ref<boolean>
  saveError: Ref<string | null>
  saveSuccess: Ref<boolean>
  saveProgress: Ref<string>
  hasUnsavedChanges: ComputedRef<boolean>
  loadModel: () => Promise<void>
  /** Bind the scoped partial reload used by conflict/discard fallbacks. */
  assignScopedReload: (fn: (() => Promise<void>) | null) => void
  /** Discard local dirty/new/deleted edits without a full model reload. */
  discardUnsavedChanges: () => Promise<boolean>
  /** Wait until notation components/relations/types are applied (diagram open). */
  whenCatalogReady: () => Promise<void>
  /** Wait until nonblocking catalog work finished. */
  whenBackgroundReady: () => Promise<void>
  /** Becomes true once model metadata, root children and slim diagrams form a usable shell. */
  initialSnapshotReady: Ref<boolean>
  saveChanges: () => Promise<boolean>
  /** Show saving toast before heavy pre-save work (flush/validate). */
  startSave: () => void
  finishSave: () => void
  markNodeDirty: (id: string) => void
  markLinkDirty: (id: string) => void
  markDiagramDirty: (id: string) => void
  traceabilityDiagramRevision: Ref<number>
  invalidateTraceabilityDiagrams: () => void
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
  partialStore: ReturnType<typeof useModelPartialStore>
}

export const useModelEditor = (): ModelEditorReturn => {
  const route = useRoute()
  const router = useRouter()

  const model = ref<ModelData | null>(null)
  const state = ref<ModelEditorState>(createEmptyModelEditorState())
  const isLoading = ref(true)
  const loadProgress = ref<ModelEditorLoadProgress | null>(null)
  const initialSnapshotReady = ref(false)
  const errorMessage = ref<string | null>(null)
  const catalogLoadWarning = ref<string | null>(null)
  const { isSaving, saveError, saveSuccess, saveProgress, startSave, completeSave, finishSave } = useSaveState()
  const pendingForceBatch = ref(false)
  const batchSaveConflict = ref<BatchConflictItem[] | null>(null)
  const modelDirty = ref(false)
  const modelInitialName = ref('')
  const modelCatalog = ref<ModelData[]>([])
  const partialStore = useModelPartialStore(state)
  const traceabilityDiagramRevision = ref(0)
  const invalidateTraceabilityDiagrams = (): void => {
    traceabilityDiagramRevision.value += 1
  }
  let catalogReadyPromise: Promise<void> = Promise.resolve()
  let backgroundReadyPromise: Promise<void> = Promise.resolve()
  let loadGeneration = 0
  /** Guards concurrent save pipeline; separate from isSaving so UI can start early. */
  let saveOperationActive = false
  let scopedReloadFn: (() => Promise<void>) | null = null
  const assignScopedReload = (fn: (() => Promise<void>) | null): void => {
    scopedReloadFn = fn
  }

  const {
    ensureNotationRelationsAndRules,
    isNotationRelationsAndRulesLoading,
    resetLoadedNotationIds,
  } = useNotationRelationsAndRulesLoader(state)
  const {
    markNodeDirty: markNodeDirtyInState,
    markLinkDirty: markLinkDirtyInState,
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

  const markNodeDirty = (id: string): void => {
    markNodeDirtyInState(id)
    const node = state.value.nodes.find(item => item.id === id)
    if (node) partialStore.syncLocalNode(node)
  }

  const markLinkDirty = (id: string): void => {
    markLinkDirtyInState(id)
    const link = state.value.links.find(item => item.id === id)
    if (link) partialStore.syncLocalLink(link)
  }

  onScopeDispose(() => {
    disposeSaveErrorTimer()
    scopedReloadFn = null
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

  const whenCatalogReady = (): Promise<void> => catalogReadyPromise
  const whenBackgroundReady = (): Promise<void> => backgroundReadyPromise
  const isLoadSessionActive = (generation: number, modelId: string): boolean =>
    generation === loadGeneration && route.params.id === modelId
  const applyCatalog = (
    catalog: Awaited<ReturnType<typeof loadModelEditorCatalog>>,
    notationIds: string[]
  ): void => {
    modelCatalog.value = catalog.modelCatalog
    state.value = {
      ...state.value,
      notations: catalog.notations,
      nodeTypes: catalog.nodeTypes,
      linkTypes: catalog.linkTypes,
      components: catalog.components,
      relations: catalog.relations,
      relationRules: catalog.relationRules,
    }
    resetLoadedNotationIds(notationIds)
    resetLoadedNotationCatalogIds(notationIds)
  }
  const loadCatalogForSession = async (
    modelId: string,
    generation: number,
    notationIds: string[],
    cancellation?: ModelEditorLoadCancellationOptions
  ): Promise<void> => {
    catalogLoadWarning.value = null
    try {
      const catalog = await loadModelEditorCatalog(modelId, notationIds, cancellation)
      if (!isLoadSessionActive(generation, modelId)) return
      applyCatalog(catalog, notationIds)
    } catch (error) {
      if (isLoadSessionActive(generation, modelId)) {
        catalogLoadWarning.value =
          error instanceof Error ? error.message : 'Не удалось догрузить каталог модели.'
      }
    }
  }
  const retryCatalogLoad = async (): Promise<void> => {
    const modelId = route.params.id
    if (typeof modelId !== 'string') return
    const generation = loadGeneration
    const notationIds = Array.from(
      new Set(state.value.diagrams.map(diagram => diagram.notationId).filter(Boolean))
    )
    await loadCatalogForSession(modelId, generation, notationIds, {
      isCancelled: () => !isLoadSessionActive(generation, modelId),
    })
  }
  const markBackgroundReady = (
    resolve: () => void,
    generation: number,
    modelId: string
  ): void => {
    resolve()
    if (isLoadSessionActive(generation, modelId)) {
      initialSnapshotReady.value = true
    }
  }
  const modelTreeRootNodeId = (attrs: string | null | undefined): string | null => {
    if (!attrs) return null
    try {
      const value = (JSON.parse(attrs) as Record<string, unknown>).treeRootNodeId
      return typeof value === 'string' && value.trim() ? value : null
    } catch {
      return null
    }
  }

  const loadModel = async (): Promise<void> => {
    const generation = ++loadGeneration
    let resolveCatalogReady: () => void = () => undefined
    let resolveBackgroundReady: () => void = () => undefined
    catalogReadyPromise = new Promise<void>(resolve => {
      resolveCatalogReady = resolve
    })
    backgroundReadyPromise = new Promise<void>(resolve => {
      resolveBackgroundReady = resolve
    })
    const modelId = route.params.id
    if (!modelId || typeof modelId !== 'string') {
      loadProgress.value = null
      errorMessage.value = 'Не удалось определить модель.'
      isLoading.value = false
      initialSnapshotReady.value = true
      resolveCatalogReady()
      resolveBackgroundReady()
      return
    }

    isLoading.value = true
    initialSnapshotReady.value = false
    errorMessage.value = null
    catalogLoadWarning.value = null
    // Cancel child-page requests from the previous load before starting a new shell.
    partialStore.resetPartialScopes(modelId)
    const progressTracker = createModelEditorLoadProgressTracker({ generation, modelId })
    loadProgress.value = progressTracker.current()
    let notationIds: string[]
    const cancellation = {
      isCancelled: () => !isLoadSessionActive(generation, modelId),
      onProgress: (event: Parameters<typeof progressTracker.update>[0]) => {
        if (!isLoadSessionActive(generation, modelId)) return
        loadProgress.value = progressTracker.update(event)
      },
    }
    const settleStaleSession = (): void => {
      resolveCatalogReady()
      markBackgroundReady(resolveBackgroundReady, generation, modelId)
    }

    try {
      // Critical path: tree + diagram list (without heavy diagram attrs).
      const shell = await loadModelEditorShell(modelId, cancellation)
      if (!isLoadSessionActive(generation, modelId)) {
        settleStaleSession()
        return
      }

      model.value = shell.model
      modelInitialName.value = shell.model.name
      modelDirty.value = false
      modelCatalog.value = shell.modelCatalog
      notationIds = shell.loadedNotationIds
      // Relations/rules are not loaded yet — do not mark notations as ready.
      resetLoadedNotationIds([])
      resetLoadedNotationCatalogIds([])
      state.value = shell.state
      partialStore.resetPartialScopes(modelId, {
        scope: { kind: 'root' },
        page: shell.rootChildrenPage,
        rootParentNodeId: modelTreeRootNodeId(shell.model.attrs),
      })
      isLoading.value = false
      // A usable initial snapshot is model metadata + root tree page + slim diagrams.
      // Catalog is independent; graph entities are loaded only for the active diagram.
      initialSnapshotReady.value = true
      progressTracker.setBlocking(false)
      loadProgress.value = progressTracker.current()
      // Let Vue paint the tree and handle expand clicks before catalog/links work.
      await new Promise<void>(resolve => {
        setTimeout(resolve, 0)
      })
      if (!isLoadSessionActive(generation, modelId)) {
        settleStaleSession()
        return
      }
    } catch (error) {
      if (!isLoadSessionActive(generation, modelId)) {
        settleStaleSession()
        return
      }
      errorMessage.value = error instanceof Error ? error.message : 'Не удалось загрузить модель.'
      isLoading.value = false
      loadProgress.value = null
      resolveCatalogReady()
      markBackgroundReady(resolveBackgroundReady, generation, modelId)
      return
    }

    await (async (): Promise<void> => {
      try {
        await loadCatalogForSession(modelId, generation, notationIds, cancellation)
      } finally {
        resolveCatalogReady()
        markBackgroundReady(resolveBackgroundReady, generation, modelId)
      }
    })()
    if (isLoadSessionActive(generation, modelId)) {
      loadProgress.value = progressTracker.update({ kind: 'complete' })
    }
  }

  const reloadEditorState = async (): Promise<void> => {
    if (scopedReloadFn) {
      await scopedReloadFn()
      return
    }
    await loadModel()
  }

  const saveChanges = async (): Promise<boolean> => {
    if (!model.value) return false
    if (saveOperationActive) return false
    saveOperationActive = true
    if (!isSaving.value) startSave()
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
        remoteCascadeConflictLinkIds: partialStore.store.remoteCascadeConflictLinkIds,
        onProgress: (msg: string) => {
          saveProgress.value = msg
        },
        scheduleSaveErrorClear,
      })

      if (!success) {
        return false
      }

      partialStore.reconcileMaterializedRows()
      invalidateTraceabilityDiagrams()
      completeSave(2500)
      return true
    } finally {
      finishSave()
      saveOperationActive = false
    }
  }

  const discardUnsavedChanges = async (): Promise<boolean> => {
    const result = await discardUnsavedModelChanges({
      state: state.value,
      model: model.value,
      modelDirty: modelDirty.value,
      onModelRestored: restored => {
        model.value = restored
        modelInitialName.value = restored.name
        modelDirty.value = false
      },
    })
    if (result.ok) {
      partialStore.reconcileMaterializedRows()
      if (modelDirty.value) modelDirty.value = false
      return true
    }
    // Fallback for point-restore failures: scoped partial reset, not a full collection load.
    await reloadEditorState()
    return true
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
      loadModel: reloadEditorState,
      saveChanges,
    })

  return {
    model,
    state,
    isLoading,
    loadProgress,
    initialSnapshotReady,
    errorMessage,
    catalogLoadWarning,
    retryCatalogLoad,
    modelDirty,
    modelInitialName,
    isSaving,
    saveError,
    saveSuccess,
    saveProgress,
    hasUnsavedChanges,
    loadModel,
    assignScopedReload,
    discardUnsavedChanges,
    whenCatalogReady,
    whenBackgroundReady,
    saveChanges,
    startSave,
    finishSave,
    markNodeDirty,
    markLinkDirty,
    markDiagramDirty,
    traceabilityDiagramRevision,
    invalidateTraceabilityDiagrams,
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
    partialStore,
  }
}
