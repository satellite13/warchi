import { type Ref } from 'vue'
import { apiDelete } from './useApi'
import { useModalState } from './useModalState'
import type { VersionedEntity } from '../types/entities'
import type { EntityListConfig } from './useEntityList'

export function useEntityDeleteModal<T extends VersionedEntity>(
  config: EntityListConfig<T>,
  items: Ref<T[]>,
) {
  const { show, item, isProcessing, error, open, close } = useModalState<T>()

  const deleteItem = async (): Promise<boolean> => {
    if (!item.value) {
      return false
    }

    isProcessing.value = true
    error.value = null

    try {
      const result = await apiDelete<void>(`/${config.endpoint}/${item.value.id}`)

      if (!result.success) {
        if (result.error.status === 404) {
          throw new Error(config.notFoundMessage)
        }
        throw new Error(result.error.message)
      }

      items.value = items.value.filter((i) => i.id !== item.value?.id)
      close()
      return true
    } catch (e) {
      error.value =
        e instanceof Error
          ? e.message
          : `Не удалось удалить ${config.entityName.toLowerCase()}`
      return false
    } finally {
      isProcessing.value = false
    }
  }

  return {
    showDeleteModal: show,
    itemToDelete: item,
    isDeleting: isProcessing,
    deleteError: error,
    openDeleteModal: open,
    closeDeleteModal: close,
    deleteItem,
  }
}
