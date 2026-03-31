import type { Ref } from "vue"
import type { ModelData } from "@/types/entities"
import type { BatchConflictItem } from "./useModelBatchSave"
import type { ModelEditorState } from "../types"
import { applyDiagramGarbageSanitizeToState } from "../utils/sanitizeDiagramInstances"
import {
  applyBatchRemapping,
  batchSave,
  buildBatchSaveRequest,
  hasBatchChanges,
  isValidBatchResponse,
  parseBatchSaveConflictDetails,
  refreshBatchSavedEntityTimestamps,
} from "./useModelBatchSave"
import { withoutDeleted } from "./modelEditorMappers"
import { remapNodeIds, saveDiagrams, saveLinks, saveModelMetadata, saveNodes } from "./modelEditorSavePipeline"

type ExecuteModelEditorSaveOptions = {
  model: Ref<ModelData | null>
  modelDirty: Ref<boolean>
  modelInitialName: Ref<string>
  modelCatalog: Ref<ModelData[]>
  state: Ref<ModelEditorState>
  pendingForceBatch: Ref<boolean>
  batchSaveConflict: Ref<BatchConflictItem[] | null>
  saveError: Ref<string | null>
  onProgress: (msg: string) => void
  scheduleSaveErrorClear: () => void
}

export async function executeModelEditorSave(options: ExecuteModelEditorSaveOptions): Promise<boolean> {
  const modelValue = options.model.value
  if (!modelValue) return false

  try {
    const { ownerId, modelId, nodes, links, diagrams } = options.state.value

    if (options.model.value && options.modelDirty.value) {
      options.onProgress(`Обновление модели: ${options.model.value.name}`)
      const { data } = await saveModelMetadata(options.model.value, options.modelCatalog.value)
      options.model.value = data
      options.modelInitialName.value = data.name
      options.modelDirty.value = false
    }

    let usedBatch = false
    const forceBatch = options.pendingForceBatch.value
    options.pendingForceBatch.value = false

    applyDiagramGarbageSanitizeToState(options.state.value)

    const batchRequest = buildBatchSaveRequest(nodes, links, diagrams, { force: forceBatch })
    if (hasBatchChanges(batchRequest)) {
      const batchResult = await batchSave(modelId, batchRequest)
      if (batchResult.success) {
        if (!isValidBatchResponse(batchResult.data)) {
          options.saveError.value = "Некорректный ответ сервера при пакетном сохранении."
          options.scheduleSaveErrorClear()
          return false
        }
        applyBatchRemapping(batchResult.data, nodes, links, diagrams, batchRequest)
        await refreshBatchSavedEntityTimestamps(
          { nodes, links, diagrams },
          batchRequest,
          batchResult.data
        )
        usedBatch = true
      } else if (batchResult.error.status === 409) {
        const conflicts = parseBatchSaveConflictDetails(batchResult.error.details)
        if (conflicts && conflicts.length > 0) {
          options.batchSaveConflict.value = conflicts
          return false
        }
        options.saveError.value =
          batchResult.error.message || "Конфликт версий при сохранении (данные изменены на сервере)."
        options.scheduleSaveErrorClear()
        return false
      } else {
        options.saveError.value = batchResult.error.message
        options.scheduleSaveErrorClear()
        return false
      }
    }

    if (!usedBatch) {
      const newNodeIdMap = await saveNodes(nodes, modelId, ownerId, options.onProgress)
      remapNodeIds(newNodeIdMap, links, diagrams)
      await saveLinks(links, diagrams, modelId, ownerId, options.onProgress)
      await saveDiagrams(diagrams, ownerId, modelId, options.onProgress)
    }

    options.state.value.nodes = withoutDeleted(options.state.value.nodes)
    options.state.value.links = withoutDeleted(options.state.value.links)
    options.state.value.diagrams = withoutDeleted(options.state.value.diagrams)
    return true
  } catch (error) {
    options.saveError.value = error instanceof Error ? error.message : "Не удалось сохранить изменения."
    options.scheduleSaveErrorClear()
    return false
  }
}
