import { onScopeDispose, type Ref } from 'vue'
import i18n from '@/i18n'
import type { ModelData } from '@/types/entities'
import type { ModelEditorState, ModelPartialRequestGuard, TreeParentScope } from '../types'
import { discardUnsavedModelChanges } from './discardUnsavedModelChanges'
import { loadModelEditorShell } from './modelEditorLoadModel'
import type { useModelPartialStore } from './useModelPartialStore'

export type ScopedReloadMode = 'standard' | 'lock'

export type ScopedReloadFailedPhase = 'shell' | 'diagram' | 'tree'

export type ScopedReloadResult =
  | { ok: true }
  | { ok: false; error?: string; failedPhase?: ScopedReloadFailedPhase }

const SCOPED_RELOAD_REQUEST = 'scoped-reload'

const treeRootNodeId = (attrs: string | null | undefined): string | null => {
  if (!attrs) return null
  try {
    const value = (JSON.parse(attrs) as Record<string, unknown>).treeRootNodeId
    return typeof value === 'string' && value.trim() ? value : null
  } catch {
    return null
  }
}

const errorMessage = (error: unknown, t: (key: string) => string): string =>
  error instanceof Error ? error.message : t('models.scopedReloadFailed')

export function useModelScopedReload(options: {
  state: Ref<ModelEditorState>
  model: Ref<ModelData | null>
  modelDirty: Ref<boolean>
  modelInitialName: Ref<string>
  selectedDiagramId: Ref<string | null>
  partialStore: ReturnType<typeof useModelPartialStore>
  reopenDiagramScope: (diagramId: string) => Promise<void>
  refreshTreeScopes?: (scopes: TreeParentScope[]) => Promise<void>
  t?: (key: string) => string
}) {
  let reloadGeneration = 0
  const t = options.t ?? ((key: string) => String(i18n.global.t(key)))

  const isCurrent = (
    generation: number,
    requestedModelId: string,
    guard: ModelPartialRequestGuard
  ): boolean =>
    generation === reloadGeneration &&
    options.state.value.modelId === requestedModelId &&
    options.partialStore.store.isRequestCurrent(guard)

  const fail = (phase: ScopedReloadFailedPhase, error?: string): ScopedReloadResult => ({
    ok: false,
    failedPhase: phase,
    error,
  })

  const invalidate = (): void => {
    reloadGeneration += 1
    options.partialStore.abortInFlightScopes()
  }

  const reloadPartialEditor = async (
    reloadOptions: { mode?: ScopedReloadMode } = {}
  ): Promise<ScopedReloadResult> => {
    const requestedModelId = options.state.value.modelId
    if (!requestedModelId) return fail('shell', t('models.scopedReloadModelMissing'))

    const mode = reloadOptions.mode ?? 'standard'
    const openDiagramId = options.selectedDiagramId.value
    const affectedScopes =
      mode === 'lock' ? options.partialStore.materializedChildrenScopes() : []
    const generation = ++reloadGeneration
    options.partialStore.abortInFlightScopes()
    const guard = options.partialStore.store.beginRequest(SCOPED_RELOAD_REQUEST)

    try {
      const shell = await loadModelEditorShell(requestedModelId, {
        isCancelled: () => !isCurrent(generation, requestedModelId, guard),
      })
      if (!isCurrent(generation, requestedModelId, guard)) return fail('shell')

      const catalog = {
        notations: options.state.value.notations,
        nodeTypes: options.state.value.nodeTypes,
        linkTypes: options.state.value.linkTypes,
        components: options.state.value.components,
        relations: options.state.value.relations,
        relationRules: options.state.value.relationRules,
      }
      options.model.value = shell.model
      options.modelInitialName.value = shell.model.name
      options.modelDirty.value = false
      options.state.value = {
        ...shell.state,
        ...catalog,
      }
      options.partialStore.resetPartialScopes(requestedModelId, {
        scope: { kind: 'root' },
        page: shell.rootChildrenPage,
        rootParentNodeId: treeRootNodeId(shell.model.attrs),
      })
      const applyGuard = options.partialStore.store.beginRequest(SCOPED_RELOAD_REQUEST)

      if (openDiagramId) {
        options.selectedDiagramId.value = openDiagramId
        try {
          await options.reopenDiagramScope(openDiagramId)
        } catch (error) {
          if (!isCurrent(generation, requestedModelId, applyGuard)) return fail('diagram')
          return fail('diagram', errorMessage(error, t))
        }
        if (!isCurrent(generation, requestedModelId, applyGuard)) return fail('diagram')
      }
      if (mode === 'lock' && affectedScopes.length > 0) {
        try {
          await options.refreshTreeScopes?.(affectedScopes)
        } catch (error) {
          if (!isCurrent(generation, requestedModelId, applyGuard)) return fail('tree')
          return fail('tree', errorMessage(error, t))
        }
        if (!isCurrent(generation, requestedModelId, applyGuard)) return fail('tree')
      }
      return { ok: true }
    } catch (error) {
      if (!isCurrent(generation, requestedModelId, guard)) return fail('shell')
      return fail('shell', errorMessage(error, t))
    }
  }

  const discardUnsavedOrReload = async (discardOptions: {
    model: ModelData | null
    modelDirty: boolean
    onModelRestored?: (model: ModelData) => void
    loadModel?: () => Promise<void>
  }): Promise<boolean> => {
    const result = await discardUnsavedModelChanges({
      state: options.state.value,
      model: discardOptions.model,
      modelDirty: discardOptions.modelDirty,
      onModelRestored: discardOptions.onModelRestored,
    })
    if (result.ok) {
      options.partialStore.reconcileMaterializedRows()
      if (options.modelDirty.value) options.modelDirty.value = false
      return true
    }
    const reload = await reloadPartialEditor()
    return reload.ok
  }

  onScopeDispose(invalidate)

  return {
    reloadPartialEditor,
    discardUnsavedOrReload,
    invalidate,
  }
}
