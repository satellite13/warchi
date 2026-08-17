import type { Ref } from "vue"
import i18n from "@/i18n"
import type { ModelData } from "@/types/entities"
import type { BatchConflictItem } from "./useModelBatchSave"
import type { EditorDiagram, EditorLink, EditorNode, ModelEditorState } from "../types"
import { applyDiagramGarbageSanitizeToState } from "../utils/sanitizeDiagramInstances"
import {
  applyBatchRemapping,
  batchSave,
  buildBatchSaveRequest,
  findBlankNamedBatchNodes,
  hasBatchChanges,
  isValidBatchResponse,
  parseBatchSaveConflictDetails,
  refreshBatchSavedEntityTimestamps,
} from "./useModelBatchSave"
import { withoutDeleted } from "./modelEditorMappers"
import { remapNodeIds, saveDiagrams, saveLinks, saveModelMetadata, saveNodes } from "./modelEditorSavePipeline"
import { ensureDirtyPendingDiagramAttrsLoaded } from "./ensureDiagramAttrs"

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

const t = (key: string, params?: Record<string, unknown>): string =>
  String(i18n.global.t(key, params ?? {}))

/** Same dirty filters as batch/legacy pipelines — used only for guarded fallback detection. */
export function hasLegacyEntitySaveWork(
  nodes: EditorNode[],
  links: EditorLink[],
  diagrams: EditorDiagram[]
): boolean {
  const entityNeedsSave = (row: { _isNew?: boolean; _isDirty?: boolean; _isDeleted?: boolean }): boolean =>
    Boolean((row._isNew && !row._isDeleted) || (row._isDirty && !row._isDeleted && !row._isNew) || (row._isDeleted && !row._isNew))

  return nodes.some(entityNeedsSave) || links.some(entityNeedsSave) || diagrams.some(entityNeedsSave)
}

export async function executeModelEditorSave(options: ExecuteModelEditorSaveOptions): Promise<boolean> {
  const modelValue = options.model.value
  if (!modelValue) return false

  try {
    const { ownerId, modelId, nodes, links, diagrams } = options.state.value

    if (options.model.value && options.modelDirty.value) {
      options.onProgress(t("models.saveUpdatingModel", { name: options.model.value.name }))
      const { data } = await saveModelMetadata(options.model.value, options.modelCatalog.value)
      options.model.value = data
      options.modelInitialName.value = data.name
      options.modelDirty.value = false
    }

    const forceBatch = options.pendingForceBatch.value
    options.pendingForceBatch.value = false

    await ensureDirtyPendingDiagramAttrsLoaded(() => options.state.value)
    applyDiagramGarbageSanitizeToState(options.state.value)

    const blankNamedNodes = findBlankNamedBatchNodes(nodes)
    if (blankNamedNodes.length > 0) {
      options.saveError.value = t("models.batchSaveBlankNodeName", {
        count: blankNamedNodes.length,
      })
      options.scheduleSaveErrorClear()
      return false
    }

    // Batch is the primary path for node/link/diagram create/update/delete.
    // Legacy per-entity pipeline remains only as a guarded fallback for unexpected
    // dirty state that somehow was not captured by buildBatchSaveRequest.
    const batchRequest = buildBatchSaveRequest(nodes, links, diagrams, { force: forceBatch })
    if (hasBatchChanges(batchRequest)) {
      const batchResult = await batchSave(modelId, batchRequest)
      if (batchResult.success) {
        if (!isValidBatchResponse(batchResult.data)) {
          options.saveError.value = t("models.batchSaveInvalidResponse")
          options.scheduleSaveErrorClear()
          return false
        }
        applyBatchRemapping(batchResult.data, nodes, links, diagrams, batchRequest)
        await refreshBatchSavedEntityTimestamps(
          { nodes, links, diagrams },
          batchRequest,
          batchResult.data
        )
      } else if (batchResult.error.status === 409) {
        const conflicts = parseBatchSaveConflictDetails(batchResult.error.details)
        if (conflicts && conflicts.length > 0) {
          options.batchSaveConflict.value = conflicts
          return false
        }
        options.saveError.value =
          batchResult.error.message || t("models.batchSaveVersionConflict")
        options.scheduleSaveErrorClear()
        return false
      } else {
        options.saveError.value = batchResult.error.message
        options.scheduleSaveErrorClear()
        return false
      }
    } else if (hasLegacyEntitySaveWork(nodes, links, diagrams)) {
      console.warn(
        "[ModelEditorSave] Unexpected dirty entity state without batch changes; falling back to legacy save pipeline"
      )
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
    options.saveError.value =
      error instanceof Error ? error.message : t("models.saveFailedGeneric")
    options.scheduleSaveErrorClear()
    return false
  }
}
