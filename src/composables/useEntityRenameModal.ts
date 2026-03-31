import { ref, type Ref } from 'vue'
import { apiPut } from './useApi'
import { useModalState } from './useModalState'
import type { VersionedEntity } from '../types/entities'
import type { EntityListConfig } from './useEntityList'

export function useEntityRenameModal<T extends VersionedEntity>(
  config: EntityListConfig<T>,
  items: Ref<T[]>,
  selectedVersionByName: Ref<Record<string, string>>,
) {
  const modal = useModalState<T>()
  const renameName = ref('')

  const openRenameModal = (item: T) => {
    modal.open(item)
    renameName.value = item.name
  }

  const closeRenameModal = () => {
    modal.close()
    renameName.value = ''
  }

  const renameItem = async () => {
    if (!modal.item.value || !config.buildRenameRequest) return
    const trimmedName = renameName.value.trim()
    if (!trimmedName) {
      modal.error.value = config.enterNameMessage ?? 'Введите название'
      return
    }
    const current = modal.item.value
    if (trimmedName === current.name) {
      closeRenameModal()
      return
    }
    const hasConflict = items.value.some(
      (item) =>
        item.id !== current.id &&
        item.version === current.version &&
        item.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    )
    if (hasConflict) {
      modal.error.value = config.conflictMessage
      return
    }

    modal.isProcessing.value = true
    modal.error.value = null
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
      items.value = items.value.map((item) => (item.id === current.id ? result.data : item))
      if (selectedVersionByName.value[previousName] === current.version) {
        const nextSelection = { ...selectedVersionByName.value }
        delete nextSelection[previousName]
        nextSelection[result.data.name] = result.data.version
        selectedVersionByName.value = nextSelection
      }
      closeRenameModal()
    } catch (e) {
      modal.error.value =
        e instanceof Error
          ? e.message
          : (config.renameFailedMessage ?? 'Не удалось переименовать')
    } finally {
      modal.isProcessing.value = false
    }
  }

  return {
    showRenameModal: modal.show,
    itemToRename: modal.item,
    renameName,
    renameError: modal.error,
    isRenaming: modal.isProcessing,
    openRenameModal,
    closeRenameModal,
    renameItem,
  }
}
