import type { Ref } from 'vue'
import type { ModelData } from '@/types/entities'
import type { ModelEditorState, TreeParentScope } from '../types'
import { discardUnsavedModelChanges } from './discardUnsavedModelChanges'
import { loadModelEditorShell } from './modelEditorLoadModel'
import type { useModelPartialStore } from './useModelPartialStore'

export type ScopedReloadMode = 'standard' | 'lock'

export type ScopedReloadResult = { ok: true } | { ok: false; error?: string }

const treeRootNodeId = (attrs: string | null | undefined): string | null => {
  if (!attrs) return null
  try {
    const value = (JSON.parse(attrs) as Record<string, unknown>).treeRootNodeId
    return typeof value === 'string' && value.trim() ? value : null
  } catch {
    return null
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Не удалось перезагрузить модель.'

export function useModelScopedReload(options: {
  state: Ref<ModelEditorState>
  model: Ref<ModelData | null>
  modelDirty: Ref<boolean>
  modelInitialName: Ref<string>
  selectedDiagramId: Ref<string | null>
  partialStore: ReturnType<typeof useModelPartialStore>
  reopenDiagramScope: (diagramId: string) => Promise<void>
  refreshTreeScopes?: (scopes: TreeParentScope[]) => Promise<void>
}) {
  let reloadGeneration = 0

  const reloadPartialEditor = async (
    reloadOptions: { mode?: ScopedReloadMode } = {}
  ): Promise<ScopedReloadResult> => {
    const modelId = options.state.value.modelId
    if (!modelId) return { ok: false, error: 'Не удалось определить модель.' }

    const mode = reloadOptions.mode ?? 'standard'
    const openDiagramId = options.selectedDiagramId.value
    const affectedScopes =
      mode === 'lock' ? options.partialStore.materializedChildrenScopes() : []
    const generation = ++reloadGeneration
    options.partialStore.resetPartialScopes(modelId)

    try {
      const shell = await loadModelEditorShell(modelId, {
        isCancelled: () => generation !== reloadGeneration,
      })
      if (generation !== reloadGeneration) return { ok: false }

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
      options.partialStore.resetPartialScopes(modelId, {
        scope: { kind: 'root' },
        page: shell.rootChildrenPage,
        rootParentNodeId: treeRootNodeId(shell.model.attrs),
      })
      if (openDiagramId) {
        options.selectedDiagramId.value = openDiagramId
        await options.reopenDiagramScope(openDiagramId)
      }
      if (generation !== reloadGeneration) return { ok: false }
      if (mode === 'lock' && affectedScopes.length > 0) {
        await options.refreshTreeScopes?.(affectedScopes)
      }
      if (generation !== reloadGeneration) return { ok: false }
      return { ok: true }
    } catch (error) {
      if (generation !== reloadGeneration) return { ok: false }
      return { ok: false, error: errorMessage(error) }
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
    await reloadPartialEditor()
    return true
  }

  return {
    reloadPartialEditor,
    discardUnsavedOrReload,
  }
}
