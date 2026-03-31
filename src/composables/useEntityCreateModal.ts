import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { apiPost } from './useApi'
import { useModalState } from './useModalState'
import { bumpMinor, compareVersions, isValidVersion } from '../utils/version'
import type { VersionedEntity, EntityGroup } from '../types/entities'
import type { EntityListConfig, SourceVersion } from './useEntityList'

export function useEntityCreateModal<T extends VersionedEntity>(
  config: EntityListConfig<T>,
  items: Ref<T[]>,
  groupedItems: ComputedRef<EntityGroup<T>[]>,
  ownerEmails: Ref<Map<string, string>>,
  selectedVersionByName: Ref<Record<string, string>>,
) {
  const modal = useModalState<T>()
  const newItemName = ref('')
  const newItemVersion = ref('1.0.0')
  const sourceVersionId = ref<string | null>(null)

  const normalizeEntityName = (name: string): string => name.trim().toLowerCase()

  const suggestNextVersion = (name: string, preferredSourceId: string | null): string | null => {
    const normalizedName = normalizeEntityName(name)
    if (!normalizedName) return null

    const sameNameGroup = groupedItems.value.find(
      (g) => normalizeEntityName(g.name) === normalizedName,
    )
    if (!sameNameGroup) return null

    if (preferredSourceId) {
      const source = sameNameGroup.versions.find((item) => item.id === preferredSourceId)
      if (source?.version) {
        return bumpMinor(source.version)
      }
    }

    const maxVersion = sameNameGroup.versions[0]?.version
    return maxVersion ? bumpMinor(maxVersion) : null
  }

  const sourceVersions = computed<SourceVersion[]>(() => {
    const name = newItemName.value.trim()
    if (!name) return []
    const group = groupedItems.value.find(
      (g) => normalizeEntityName(g.name) === normalizeEntityName(name),
    )
    if (!group) return []
    return group.versions.map((item) => ({ id: item.id, version: item.version }))
  })

  const validateCreate = (): string | null => {
    if (!newItemName.value.trim()) {
      return `Введите название ${config.entityName.toLowerCase()}`
    }
    if (!newItemVersion.value.trim()) {
      return `Введите версию ${config.entityName.toLowerCase()}`
    }
    if (!isValidVersion(newItemVersion.value.trim())) {
      return 'Версия должна быть в формате X.Y.Z (например, 1.0.0)'
    }
    const name = newItemName.value.trim()
    const version = newItemVersion.value.trim()
    const sameNameGroup = groupedItems.value.find(
      (g) => normalizeEntityName(g.name) === normalizeEntityName(name),
    )
    const hasExactVersionConflict = sameNameGroup?.versions.some(
      (item) => item.version.trim() === version,
    )
    if (hasExactVersionConflict) {
      return config.conflictMessage
    }
    const maxExisting = sameNameGroup?.versions[0]?.version
    if (maxExisting && compareVersions(version, maxExisting) < 0) {
      return `Версия не может быть меньше максимальной существующей (${maxExisting}) для данного имени`
    }
    return null
  }

  const createItem = async (ownerId: string, ownerDisplayName?: string): Promise<T | null> => {
    const validationError = validateCreate()
    if (validationError) {
      modal.error.value = validationError
      return null
    }

    if (!ownerId) {
      modal.error.value = 'Пользователь не авторизован'
      return null
    }

    modal.isProcessing.value = true
    modal.error.value = null

    try {
      const body = {
        name: newItemName.value.trim(),
        version: newItemVersion.value.trim(),
        ownerId,
      }
      const url = sourceVersionId.value
        ? `/${config.endpoint}/${sourceVersionId.value}/copy`
        : `/${config.endpoint}`
      const result = await apiPost<T>(url, body)

      if (!result.success) {
        if (result.error.status === 409) {
          throw new Error(config.conflictMessage)
        }
        if (result.error.status === 404) {
          throw new Error(
            config.createNotFoundMessage ??
              `Эндпоинт не найден (404). Убедитесь, что бэкенд поддерживает POST /api/.../${config.endpoint} и запущен.`,
          )
        }
        throw new Error(result.error.message)
      }

      const created = result.data
      modal.show.value = false

      if (created?.id) {
        const exists = items.value.some((item) => item.id === created.id)
        items.value = exists
          ? items.value.map((item) => (item.id === created.id ? created : item))
          : [created, ...items.value]
      }

      if (created?.ownerId && ownerDisplayName) {
        ownerEmails.value = new Map(ownerEmails.value)
        ownerEmails.value.set(created.ownerId, ownerDisplayName)
      }

      if (created?.name && created?.version) {
        selectedVersionByName.value = {
          ...selectedVersionByName.value,
          [created.name]: created.version,
        }
      }

      return created
    } catch (e) {
      modal.error.value =
        e instanceof Error
          ? e.message
          : `Не удалось создать ${config.entityName.toLowerCase()}`
      return null
    } finally {
      modal.isProcessing.value = false
    }
  }

  const openCreateModal = () => {
    newItemName.value = ''
    newItemVersion.value = '1.0.0'
    sourceVersionId.value = null
    modal.error.value = null
    modal.show.value = true
  }

  const openCreateModalFromVersion = (item: T) => {
    newItemName.value = item.name.trim()
    sourceVersionId.value = item.id
    newItemVersion.value = bumpMinor(item.version) ?? item.version
    modal.error.value = null
    modal.show.value = true
  }

  watch(
    () =>
      [
        newItemName.value.trim(),
        sourceVersionId.value,
        groupedItems.value,
        modal.show.value,
      ] as const,
    ([name, preferredSourceId]) => {
      if (!modal.show.value || !name) return
      const suggested = suggestNextVersion(name, preferredSourceId)
      if (suggested) {
        newItemVersion.value = suggested
      }
    },
  )

  const closeCreateModal = () => {
    modal.show.value = false
    sourceVersionId.value = null
  }

  return {
    showCreateModal: modal.show,
    newItemName,
    newItemVersion,
    sourceVersionId,
    sourceVersions,
    isCreating: modal.isProcessing,
    createError: modal.error,
    createItem,
    openCreateModal,
    openCreateModalFromVersion,
    closeCreateModal,
    validateCreate,
  }
}
