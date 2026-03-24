import type { Ref } from "vue"
import type { ModelData } from "../../../types/entities"
import type { ModelEditorState } from "../types"

type UseModelEditorStateHelpersOptions = {
  state: Ref<ModelEditorState>
  model: Ref<ModelData | null>
  modelDirty: Ref<boolean>
  modelInitialName: Ref<string>
  modelCatalog: Ref<ModelData[]>
  saveError: Ref<string | null>
}

export function useModelEditorStateHelpers(options: UseModelEditorStateHelpersOptions): {
  markNodeDirty: (id: string) => void
  markLinkDirty: (id: string) => void
  markDiagramDirty: (id: string) => void
  markModelDirty: () => void
  renameModel: (nextName: string) => string | null
  scheduleSaveErrorClear: () => void
  disposeSaveErrorTimer: () => void
} {
  let saveErrorTimer: ReturnType<typeof setTimeout> | null = null

  const markNodeDirty = (id: string): void => {
    const row = options.state.value.nodes.find(item => item.id === id)
    if (row && !row._isNew) row._isDirty = true
  }

  const markLinkDirty = (id: string): void => {
    const row = options.state.value.links.find(item => item.id === id)
    if (row && !row._isNew) row._isDirty = true
  }

  const markDiagramDirty = (id: string): void => {
    const row = options.state.value.diagrams.find(item => item.id === id)
    if (row && !row._isNew) row._isDirty = true
  }

  const markModelDirty = (): void => {
    options.modelDirty.value = true
  }

  const hasModelNameVersionConflict = (name: string, version: string): boolean => {
    if (!options.model.value) return false
    const normalizedName = name.trim().toLowerCase()
    const normalizedVersion = version.trim()
    if (!normalizedName || !normalizedVersion) return false
    return options.modelCatalog.value.some(
      item =>
        item.id !== options.model.value!.id &&
        item.name.trim().toLowerCase() === normalizedName &&
        item.version.trim() === normalizedVersion
    )
  }

  const renameModel = (nextName: string): string | null => {
    if (!options.model.value) return "Модель не загружена."
    const trimmed = nextName.trim()
    if (!trimmed) return "Название модели не может быть пустым."
    if (hasModelNameVersionConflict(trimmed, options.model.value.version)) {
      return "Модель с таким именем и версией уже существует."
    }
    if (trimmed === options.model.value.name) return null
    options.model.value.name = trimmed
    options.modelDirty.value = trimmed !== options.modelInitialName.value
    return null
  }

  const scheduleSaveErrorClear = (): void => {
    if (saveErrorTimer) clearTimeout(saveErrorTimer)
    saveErrorTimer = setTimeout(() => {
      options.saveError.value = null
      saveErrorTimer = null
    }, 5000)
  }

  const disposeSaveErrorTimer = (): void => {
    if (saveErrorTimer) {
      clearTimeout(saveErrorTimer)
      saveErrorTimer = null
    }
  }

  return {
    markNodeDirty,
    markLinkDirty,
    markDiagramDirty,
    markModelDirty,
    renameModel,
    scheduleSaveErrorClear,
    disposeSaveErrorTimer,
  }
}
