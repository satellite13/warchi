import { ref } from "vue"
import type { ModelData } from "@/types/entities"
import type { ModelEditorState } from "@/features/models/types"
import { loadModelEditorData } from "@/features/models/composables/modelEditorLoadModel"

/**
 * Relation matrix needs diagram instance snapshots for component/relation
 * custom properties (editor writes there, not to legacy node/link attrs).
 */
export function useRelationMatrixData() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const model = ref<ModelData | null>(null)
  const state = ref<ModelEditorState | null>(null)

  const load = async (modelId: string): Promise<void> => {
    if (!modelId) return
    loading.value = true
    error.value = null
    try {
      const result = await loadModelEditorData(modelId, { diagramIncludeAttrs: true })
      model.value = result.model
      state.value = result.state
    } catch (err) {
      model.value = null
      state.value = null
      error.value = err instanceof Error ? err.message : "Ошибка загрузки матрицы"
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    model,
    state,
    load,
  }
}
