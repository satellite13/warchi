import { computed, onMounted, ref, watch, type Ref, type ComputedRef } from "vue"
import { useI18n } from "vue-i18n"
import { apiGet } from "./useApi"
import { useAuth } from "./useAuth"
import { resolveOwnerDisplayNames } from "../utils/resolveOwnerNames"
import { compareVersions } from "../utils/version"
import { pagedListParams } from "@/api/queryHelpers"
import { useEntityCreateModal } from "./useEntityCreateModal"
import { useEntityDeleteModal } from "./useEntityDeleteModal"
import { useEntityRenameModal } from "./useEntityRenameModal"
import { useEntityIconModal } from "./useEntityIconModal"
import type {
  VersionedEntity,
  EntityGroup,
  PaginatedResponse,
} from "../types/entities"

export interface EntityListConfig<T extends VersionedEntity = VersionedEntity> {
  endpoint: string
  entityName: string
  entityNamePlural: string
  conflictMessage: string
  notFoundMessage: string
  createNotFoundMessage?: string
  enterNameMessage?: string
  renameFailedMessage?: string
  buildRenameRequest?: (item: T, newName: string) => unknown
  buildUpdateAttrsRequest?: (item: T, nextAttrs: string | null) => unknown
  useGroupedEndpoint?: boolean
}

export interface SourceVersion {
  id: string
  version: string
}

export interface EntityListReturn<T extends VersionedEntity> {
  items: Ref<T[]>
  ownerEmails: Ref<Map<string, string>>
  isLoading: Ref<boolean>
  errorMessage: Ref<string | null>
  searchQuery: Ref<string>
  selectedVersionByName: Ref<Record<string, string>>
  filteredItems: ComputedRef<EntityGroup<T>[]>
  itemCount: ComputedRef<number>

  showCreateModal: Ref<boolean>
  newItemName: Ref<string>
  newItemVersion: Ref<string>
  sourceVersionId: Ref<string | null>
  sourceVersions: ComputedRef<SourceVersion[]>
  isCreating: Ref<boolean>
  createError: Ref<string | null>

  showDeleteModal: Ref<boolean>
  itemToDelete: Ref<T | null>
  isDeleting: Ref<boolean>
  deleteError: Ref<string | null>

  showRenameModal: Ref<boolean>
  itemToRename: Ref<T | null>
  renameName: Ref<string>
  renameError: Ref<string | null>
  isRenaming: Ref<boolean>

  loadItems: (options?: { silent?: boolean }) => Promise<void>
  createItem: (ownerId: string, ownerDisplayName?: string) => Promise<T | null>
  deleteItem: () => Promise<boolean>
  openCreateModal: () => void
  openCreateModalFromVersion: (item: T) => void
  closeCreateModal: () => void
  openDeleteModal: (item: T) => void
  closeDeleteModal: () => void
  openRenameModal: (item: T) => void
  closeRenameModal: () => void
  renameItem: () => Promise<void>
  getSelectedItem: (group: EntityGroup<T>) => T | null
  handleVersionChange: (groupName: string, version: string) => void
  validateCreate: () => string | null

  showIconModal: Ref<boolean>
  itemToUpdateIcon: Ref<T | null>
  iconPickerValue: Ref<string>
  isUpdatingIcon: Ref<boolean>
  iconUpdateError: Ref<string | null>
  openIconModal: (item: T) => void
  closeIconModal: () => void
  submitIconChange: () => Promise<void>
}

export function useEntityList<T extends VersionedEntity>(
  config: EntityListConfig<T>
): EntityListReturn<T> {
  const { t } = useI18n()
  const { currentUser } = useAuth()

  const items = ref<T[]>([]) as Ref<T[]>
  const ownerEmails = ref<Map<string, string>>(new Map())
  const isLoading = ref(true)
  const errorMessage = ref<string | null>(null)
  const searchQuery = ref("")
  const selectedVersionByName = ref<Record<string, string>>({})

  /** Инкремент отбрасывает ответ устаревшего GET после локальных мутаций (создание и т.д.). */
  let itemsLoadGeneration = 0

  const normalizeEntityName = (name: string): string => name.trim().toLowerCase()

  const activeItems = computed(() =>
    items.value.filter(
      (item) =>
        !(item && "deleted" in item && (item as VersionedEntity & { deleted?: boolean }).deleted)
    )
  )

  const groupedItems = computed(() => {
    const groups = new Map<string, { displayName: string; versions: T[] }>()
    activeItems.value.forEach((item) => {
      const normalizedName = normalizeEntityName(item.name)
      const trimmedName = item.name.trim()
      if (!groups.has(normalizedName)) {
        groups.set(normalizedName, {
          displayName: trimmedName || item.name,
          versions: [],
        })
      }
      groups.get(normalizedName)?.versions.push(item)
    })

    return Array.from(groups.values()).map((group) => {
      const sorted = [...group.versions].sort((a, b) =>
        compareVersions(b.version, a.version)
      )
      return {
        name: sorted[0]?.name?.trim() || group.displayName,
        versions: sorted,
      } satisfies EntityGroup<T>
    })
  })

  watch(
    groupedItems,
    (groups) => {
      const updates: Record<string, string> = {}
      let hasUpdates = false
      for (const group of groups) {
        const currentSelection = selectedVersionByName.value[group.name]
        const latest = group.versions[0]?.version || ""
        const exists = group.versions.some((item) => item.version === currentSelection)
        if (!currentSelection || !exists) {
          updates[group.name] = latest
          hasUpdates = true
        }
      }
      if (hasUpdates) {
        selectedVersionByName.value = {
          ...selectedVersionByName.value,
          ...updates,
        }
      }
    },
    { immediate: true }
  )

  const filteredItems = computed(() => {
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) return groupedItems.value
    return groupedItems.value.filter((group) => group.name.toLowerCase().includes(query))
  })

  const itemCount = computed(() => filteredItems.value.length)

  const loadOwnerEmails = async (ownerIds: string[], fallback: string) => {
    ownerEmails.value = await resolveOwnerDisplayNames(
      ownerIds,
      ownerEmails.value,
      currentUser.value,
      fallback
    )
  }

  const fetchItemsPayload = async (): Promise<T[]> => {
    if (config.useGroupedEndpoint) {
      const groupedResult = await apiGet<{ groups: EntityGroup<T>[] }>(
        `/${config.endpoint}/grouped`
      )
      if (!groupedResult.success) {
        throw new Error(groupedResult.error.message)
      }
      if (!groupedResult.data.groups) {
        throw new Error(`Не удалось загрузить ${config.entityNamePlural}.`)
      }
      return groupedResult.data.groups.flatMap((g) => g.versions)
    }

    const query = pagedListParams(0)
    const result = await apiGet<PaginatedResponse<T>>(
      `/${config.endpoint}?${query.toString()}`
    )
    if (!result.success) {
      throw new Error(result.error.message)
    }
    return Array.isArray(result.data.content) ? result.data.content : []
  }

  const loadItems = async (options?: { silent?: boolean }) => {
    const myGen = ++itemsLoadGeneration
    const silent = options?.silent ?? false
    if (!silent) {
      isLoading.value = true
    }
    errorMessage.value = null

    try {
      const nextItems = await fetchItemsPayload()
      if (myGen !== itemsLoadGeneration) {
        return
      }
      items.value = nextItems

      const ownerIds = items.value.map((item) => item.ownerId)
      await loadOwnerEmails(ownerIds, t("common.unknownUser"))
    } catch (error) {
      if (myGen !== itemsLoadGeneration) {
        return
      }
      errorMessage.value =
        error instanceof Error
          ? error.message
          : `Не удалось загрузить ${config.entityNamePlural}.`
    } finally {
      if (myGen === itemsLoadGeneration && !silent) {
        isLoading.value = false
      }
    }
  }

  const getSelectedItem = (group: EntityGroup<T>): T | null => {
    const selectedVersion = selectedVersionByName.value[group.name]
    const selected =
      group.versions.find((item) => item.version === selectedVersion) ||
      group.versions[0] ||
      null
    if (selected && selectedVersion !== selected.version) {
      selectedVersionByName.value = {
        ...selectedVersionByName.value,
        [group.name]: selected.version,
      }
    }
    return selected
  }

  const handleVersionChange = (groupName: string, version: string) => {
    selectedVersionByName.value = {
      ...selectedVersionByName.value,
      [groupName]: version,
    }
  }

  const createModal = useEntityCreateModal(config, items, groupedItems, ownerEmails, selectedVersionByName)
  const { createItem: createItemBase, ...createModalRest } = createModal
  const deleteModal = useEntityDeleteModal(config, items)
  const renameModal = useEntityRenameModal(config, items, selectedVersionByName)
  const iconModal = useEntityIconModal(config, items)

  const createItem = async (ownerId: string, ownerDisplayName?: string): Promise<T | null> => {
    const created = await createItemBase(ownerId, ownerDisplayName)
    if (created) {
      itemsLoadGeneration++
      await loadItems({ silent: true })
    }
    return created
  }

  onMounted(() => {
    loadItems()
  })

  return {
    items,
    ownerEmails,
    isLoading,
    errorMessage,
    searchQuery,
    selectedVersionByName,
    filteredItems,
    itemCount,

    ...createModalRest,
    createItem,
    ...deleteModal,
    ...renameModal,

    loadItems,
    getSelectedItem,
    handleVersionChange,

    ...iconModal,
  }
}
