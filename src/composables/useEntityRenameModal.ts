import { ref, type Ref } from "vue"
import { apiPut } from "./useApi"
import type { VersionedEntity } from "../types/entities"
import type { EntityListConfig } from "./useEntityList"

export function useEntityRenameModal<T extends VersionedEntity>(
  config: EntityListConfig<T>,
  items: Ref<T[]>,
  selectedVersionByName: Ref<Record<string, string>>
) {
  const showRenameModal = ref(false)
  const itemToRename = ref<T | null>(null) as Ref<T | null>
  const renameName = ref("")
  const renameError = ref<string | null>(null)
  const isRenaming = ref(false)

  const openRenameModal = (item: T) => {
    itemToRename.value = item
    renameName.value = item.name
    renameError.value = null
    showRenameModal.value = true
  }

  const closeRenameModal = () => {
    showRenameModal.value = false
    itemToRename.value = null
    renameName.value = ""
    renameError.value = null
    isRenaming.value = false
  }

  const renameItem = async () => {
    if (!itemToRename.value || !config.buildRenameRequest) return
    const trimmedName = renameName.value.trim()
    if (!trimmedName) {
      renameError.value = config.enterNameMessage ?? "Введите название"
      return
    }
    const current = itemToRename.value
    if (trimmedName === current.name) {
      closeRenameModal()
      return
    }
    const hasConflict = items.value.some(
      (item) =>
        item.id !== current.id &&
        item.version === current.version &&
        item.name.trim().toLowerCase() === trimmedName.toLowerCase()
    )
    if (hasConflict) {
      renameError.value = config.conflictMessage
      return
    }

    isRenaming.value = true
    renameError.value = null
    try {
      const body = config.buildRenameRequest(current, trimmedName)
      const result = await apiPut<T>(`/${config.endpoint}/${current.id}`, body)
      if (!result.success) {
        if (result.error.status === 409) {
          throw new Error(config.conflictMessage)
        }
        throw new Error(result.error.message)
      }

      const previousName = current.name
      items.value = items.value.map((item) =>
        item.id === current.id ? result.data : item
      )
      if (selectedVersionByName.value[previousName] === current.version) {
        const nextSelection = { ...selectedVersionByName.value }
        delete nextSelection[previousName]
        nextSelection[result.data.name] = result.data.version
        selectedVersionByName.value = nextSelection
      }
      closeRenameModal()
    } catch (error) {
      renameError.value =
        error instanceof Error
          ? error.message
          : (config.renameFailedMessage ?? "Не удалось переименовать")
    } finally {
      isRenaming.value = false
    }
  }

  return {
    showRenameModal,
    itemToRename,
    renameName,
    renameError,
    isRenaming,
    openRenameModal,
    closeRenameModal,
    renameItem,
  }
}
