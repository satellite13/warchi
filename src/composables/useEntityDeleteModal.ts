import { ref, type Ref } from "vue"
import { apiDelete } from "./useApi"
import type { VersionedEntity } from "../types/entities"
import type { EntityListConfig } from "./useEntityList"

export function useEntityDeleteModal<T extends VersionedEntity>(
  config: EntityListConfig<T>,
  items: Ref<T[]>
) {
  const showDeleteModal = ref(false)
  const itemToDelete = ref<T | null>(null) as Ref<T | null>
  const isDeleting = ref(false)
  const deleteError = ref<string | null>(null)

  const openDeleteModal = (item: T) => {
    itemToDelete.value = item
    deleteError.value = null
    showDeleteModal.value = true
  }

  const closeDeleteModal = () => {
    showDeleteModal.value = false
    itemToDelete.value = null
    deleteError.value = null
  }

  const deleteItem = async (): Promise<boolean> => {
    if (!itemToDelete.value) {
      return false
    }

    isDeleting.value = true
    deleteError.value = null

    try {
      const result = await apiDelete<void>(
        `/${config.endpoint}/${itemToDelete.value.id}`
      )

      if (!result.success) {
        if (result.error.status === 404) {
          throw new Error(config.notFoundMessage)
        }
        throw new Error(result.error.message)
      }

      items.value = items.value.filter(
        (item) => item.id !== itemToDelete.value?.id
      )
      closeDeleteModal()
      return true
    } catch (error) {
      deleteError.value =
        error instanceof Error
          ? error.message
          : `Не удалось удалить ${config.entityName.toLowerCase()}`
      return false
    } finally {
      isDeleting.value = false
    }
  }

  return {
    showDeleteModal,
    itemToDelete,
    isDeleting,
    deleteError,
    openDeleteModal,
    closeDeleteModal,
    deleteItem,
  }
}
