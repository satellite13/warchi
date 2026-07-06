import { ref, computed, watch, type Ref } from "vue"
import { useI18n } from "vue-i18n"
import { apiGet, apiPost, apiPut, apiDelete } from "@/composables/useApi"
import { listParams } from '@/api/queryHelpers'
import { useAuth } from "@/composables/useAuth"
import {
  normalizeOwnerId,
  resolveOwnerDisplayNames,
  resolveOwnerLabel,
} from "@/utils/resolveOwnerNames"
import { parseTypeAttrs, serializeTypeAttrs, createId } from "../../notations/notationAttrs"
import type { TypeParsedAttrs } from "../../notations/types"
import type {
  NodeTypeResponse,
  NodeTypeRequest,
  NodeTypeUpdateRequest,
  LinkTypeResponse,
  LinkTypeRequest,
  LinkTypeUpdateRequest,
  ComponentResponse,
  RelationResponse
} from "@/types/api"
import type { AccessPermission, PaginatedResponse, NotationData } from "@/types/entities"
import { paginatedContent } from "@/utils/paginatedResponse"

export type TypeKind = "node" | "link"

export interface TypeItem {
  id: string
  name: string
  ownerId: string
  ownerEmail?: string | null
  ownerDisplayName?: string | null
  accessPermission?: AccessPermission | null
  kind: TypeKind
  parsedAttrs: TypeParsedAttrs
  _isNew?: boolean
}

function toTypeItem(resp: NodeTypeResponse | LinkTypeResponse, kind: TypeKind): TypeItem {
  return {
    id: resp.id,
    name: resp.name,
    ownerId: resp.ownerId,
    ownerEmail: resp.ownerEmail ?? null,
    ownerDisplayName: resp.ownerDisplayName ?? null,
    accessPermission: resp.accessPermission ?? null,
    kind,
    parsedAttrs: parseTypeAttrs(resp.attrs ?? null)
  }
}

export function useTypeEditor() {
  const { t } = useI18n()
  const { currentUser } = useAuth()
  const currentUserId = computed(() => currentUser.value?.id ?? null)

  function formatTypeOperationError(
    operation: "save" | "delete",
    status: number,
    message: string
  ): string {
    if (status === 401 || status === 403) {
      return t("types.errorInsufficientPermissions")
    }
    return operation === "save"
      ? t("types.errorSaveType", { message })
      : t("types.errorDeleteType", { message })
  }

  const nodeTypes: Ref<TypeItem[]> = ref([])
  const linkTypes: Ref<TypeItem[]> = ref([])
  const selectedTypeId = ref<string | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)
  const ownerDisplayNames: Ref<Map<string, string>> = ref(new Map())

  const selectedType = computed(() => {
    if (!selectedTypeId.value) return null
    return (
      nodeTypes.value.find((t) => t.id === selectedTypeId.value) ??
      linkTypes.value.find((t) => t.id === selectedTypeId.value) ??
      null
    )
  })

  // --- Dirty tracking ---
  const savedSnapshot = ref<string | null>(null)

  function takeSnapshot(item: TypeItem): string {
    return JSON.stringify({
      name: item.name,
      attrs: serializeTypeAttrs(item.parsedAttrs)
    })
  }

  function updateSnapshot() {
    const item = selectedType.value
    if (item) {
      savedSnapshot.value = item._isNew ? null : takeSnapshot(item)
    } else {
      savedSnapshot.value = null
    }
  }

  function refreshSnapshot() {
    updateSnapshot()
  }

  const isDirty = computed(() => {
    const item = selectedType.value
    if (!item) return false
    if (item._isNew) return true
    if (savedSnapshot.value === null) return false
    return takeSnapshot(item) !== savedSnapshot.value
  })

  function collectOwnerIds(extraOwnerId?: string | null): string[] {
    const ids = [...nodeTypes.value, ...linkTypes.value].map((item) => item.ownerId)
    if (extraOwnerId) ids.push(extraOwnerId)
    return ids
  }

  watch(
    () => selectedType.value?.ownerId,
    async (ownerId) => {
      if (!ownerId) return
      const fallback = t("common.unknownUser")
      const key = normalizeOwnerId(ownerId)
      const cached = ownerDisplayNames.value.get(key)
      if (cached && cached !== fallback) return
      await loadOwnerDisplayNames([ownerId])
    }
  )

  watch(
    () => [
      currentUser.value?.id,
      currentUser.value?.email,
      currentUser.value?.firstName,
      currentUser.value?.lastName,
    ],
    async () => {
      const ids = collectOwnerIds(selectedType.value?.ownerId)
      if (ids.length === 0) return
      await loadOwnerDisplayNames(ids)
    }
  )

  async function loadAll() {
    isLoading.value = true
    saveError.value = null
    try {
      const query = listParams()

      const [nodeResult, linkResult] = await Promise.all([
        apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${query.toString()}`),
        apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${query.toString()}`)
      ])

      if (nodeResult.success) {
        nodeTypes.value = paginatedContent(nodeResult.data).map((r) => toTypeItem(r, "node"))
      }
      if (linkResult.success) {
        linkTypes.value = paginatedContent(linkResult.data).map((r) => toTypeItem(r, "link"))
      }

      const allTypes = [...nodeTypes.value, ...linkTypes.value]
      await loadOwnerDisplayNames(allTypes.map((item) => item.ownerId))
    } finally {
      isLoading.value = false
    }
  }

  async function loadOwnerDisplayNames(ownerIds: string[]): Promise<void> {
    ownerDisplayNames.value = await resolveOwnerDisplayNames(
      ownerIds,
      ownerDisplayNames.value,
      currentUser.value,
      t("common.unknownUser")
    )
  }

  const selectedTypeOwnerName = computed(() => {
    const type = selectedType.value
    const fallback = t("common.unknownUser")
    if (!type?.ownerId) return fallback
    return resolveOwnerLabel(
      ownerDisplayNames.value,
      type.ownerId,
      currentUser.value,
      fallback,
      type.ownerEmail,
      type.ownerDisplayName
    )
  })

  function selectType(id: string | null) {
    selectedTypeId.value = id
    updateSnapshot()
  }

  function addType(kind: TypeKind) {
    const item: TypeItem = {
      id: createId(),
      name: "",
      ownerId: currentUser.value?.id ?? "",
      kind,
      parsedAttrs: { customProperties: [] },
      _isNew: true
    }
    if (kind === "node") {
      nodeTypes.value.push(item)
    } else {
      linkTypes.value.push(item)
    }
    selectedTypeId.value = item.id
  }

  async function saveType(item: TypeItem): Promise<boolean> {
    isSaving.value = true
    saveError.value = null

    const attrs = serializeTypeAttrs(item.parsedAttrs)
    const requestOwnerId = item.ownerId || undefined

    try {
      if (item._isNew) {
        if (item.kind === "node") {
          const body: NodeTypeRequest = {
            name: item.name,
            ownerId: requestOwnerId,
            attrs
          }
          const result = await apiPost<NodeTypeResponse>("/node-types", body)
          if (!result.success) {
            saveError.value = formatTypeOperationError(
              "save",
              result.error.status,
              result.error.message
            )
            return false
          }
          const idx = nodeTypes.value.findIndex((t) => t.id === item.id)
          if (idx !== -1) {
            const updated = toTypeItem(result.data, "node")
            nodeTypes.value[idx] = updated
            if (selectedTypeId.value === item.id) {
              selectedTypeId.value = updated.id
            }
          }
        } else {
          const body: LinkTypeRequest = {
            name: item.name,
            ownerId: requestOwnerId,
            attrs
          }
          const result = await apiPost<LinkTypeResponse>("/link-types", body)
          if (!result.success) {
            saveError.value = formatTypeOperationError(
              "save",
              result.error.status,
              result.error.message
            )
            return false
          }
          const idx = linkTypes.value.findIndex((t) => t.id === item.id)
          if (idx !== -1) {
            const updated = toTypeItem(result.data, "link")
            linkTypes.value[idx] = updated
            if (selectedTypeId.value === item.id) {
              selectedTypeId.value = updated.id
            }
          }
        }
      } else {
        if (item.kind === "node") {
          const body: NodeTypeUpdateRequest = { name: item.name, attrs }
          const result = await apiPut<NodeTypeResponse>(`/node-types/${item.id}`, body)
          if (!result.success) {
            saveError.value = formatTypeOperationError(
              "save",
              result.error.status,
              result.error.message
            )
            return false
          }
          const idx = nodeTypes.value.findIndex((t) => t.id === item.id)
          if (idx !== -1) {
            nodeTypes.value[idx] = toTypeItem(result.data, "node")
          }
        } else {
          const body: LinkTypeUpdateRequest = { name: item.name, attrs }
          const result = await apiPut<LinkTypeResponse>(`/link-types/${item.id}`, body)
          if (!result.success) {
            saveError.value = formatTypeOperationError(
              "save",
              result.error.status,
              result.error.message
            )
            return false
          }
          const idx = linkTypes.value.findIndex((t) => t.id === item.id)
          if (idx !== -1) {
            linkTypes.value[idx] = toTypeItem(result.data, "link")
          }
        }
      }
      updateSnapshot()
      return true
    } finally {
      isSaving.value = false
    }
  }

  async function deleteType(item: TypeItem): Promise<boolean> {
    if (item._isNew) {
      removeLocal(item)
      return true
    }

    isSaving.value = true
    saveError.value = null

    try {
      const path = item.kind === "node" ? `/node-types/${item.id}` : `/link-types/${item.id}`
      const result = await apiDelete<void>(path)
      if (!result.success) {
        saveError.value = formatTypeOperationError(
          "delete",
          result.error.status,
          result.error.message
        )
        return false
      }
      removeLocal(item)
      return true
    } finally {
      isSaving.value = false
    }
  }

  function removeLocal(item: TypeItem) {
    if (item.kind === "node") {
      nodeTypes.value = nodeTypes.value.filter((t) => t.id !== item.id)
    } else {
      linkTypes.value = linkTypes.value.filter((t) => t.id !== item.id)
    }
    if (selectedTypeId.value === item.id) {
      selectedTypeId.value = null
    }
  }

  function addCustomProperty(item: TypeItem) {
    if (!item.parsedAttrs.customProperties) {
      item.parsedAttrs.customProperties = []
    }
    item.parsedAttrs.customProperties.push({
      id: createId(),
      name: "",
      type: "string",
      required: false,
      regex: "",
      min: null,
      max: null,
      enumValues: [],
      defaultValue: undefined
    })
  }

  function removeCustomProperty(item: TypeItem, propertyId: string) {
    if (!item.parsedAttrs.customProperties) return
    item.parsedAttrs.customProperties = item.parsedAttrs.customProperties.filter(
      (p) => p.id !== propertyId
    )
  }

  // --- Type usages ---

  function parseIconFromAttrs(attrs: string | null | undefined): string | undefined {
    if (attrs == null) return undefined
    try {
      const parsed = JSON.parse(attrs) as { icon?: string }
      const v = parsed?.icon
      return typeof v === "string" && v.trim() ? v.trim() : undefined
    } catch {
      return undefined
    }
  }

  /** Иконка для палитры: diagramStyle.iconName ?? paletteMaterialIcon ?? widgets */
  function parsePaletteIconFromAttrs(attrs: string | null | undefined): string {
    if (attrs == null) return "widgets"
    try {
      const parsed = JSON.parse(attrs) as {
        diagramStyle?: { iconName?: string }
        paletteMaterialIcon?: string
      }
      const fromStyle =
        typeof parsed?.diagramStyle?.iconName === "string" && parsed.diagramStyle.iconName.trim()
          ? parsed.diagramStyle.iconName.trim()
          : undefined
      const fromPalette =
        typeof parsed?.paletteMaterialIcon === "string" && parsed.paletteMaterialIcon.trim()
          ? parsed.paletteMaterialIcon.trim()
          : undefined
      return fromStyle ?? fromPalette ?? "widgets"
    } catch {
      return "widgets"
    }
  }

  interface UsageElement {
    id: string
    name: string
    version: string
    /** Иконка для палитры (diagramStyle.iconName ?? paletteMaterialIcon ?? widgets) */
    icon: string
  }

  interface UsageGroup {
    notationId: string
    notationName: string
    notationIcon?: string
    elements: UsageElement[]
  }

  const typeUsages: Ref<UsageGroup[]> = ref([])
  const isLoadingUsages = ref(false)

  async function loadUsages(item: TypeItem) {
    if (item._isNew) {
      typeUsages.value = []
      return
    }

    isLoadingUsages.value = true
    try {
      const query = listParams()

      const [notationsResult, elementsResult] = await Promise.all([
        apiGet<PaginatedResponse<NotationData>>(`/notations?${query.toString()}`),
        item.kind === "node"
          ? apiGet<PaginatedResponse<ComponentResponse>>(`/components?${query.toString()}`)
          : apiGet<PaginatedResponse<RelationResponse>>(`/relations?${query.toString()}`)
      ])

      const notationsMap = new Map<string, { name: string; icon?: string }>()
      if (notationsResult.success) {
        for (const n of notationsResult.data.content ?? []) {
          notationsMap.set(n.id, {
            name: `${n.name} (${n.version})`,
            icon: parseIconFromAttrs(n.attrs)
          })
        }
      }

      if (!elementsResult.success) {
        typeUsages.value = []
        return
      }

      const allElements = elementsResult.data.content ?? []
      const matched = allElements.filter((el) => {
        if (item.kind === "node") {
          return (el as ComponentResponse).nodeTypeId === item.id
        }
        return (el as RelationResponse).linkTypeId === item.id
      })

      const grouped = new Map<string, UsageElement[]>()
      for (const el of matched) {
        const notId = (el as ComponentResponse).notationId ?? (el as RelationResponse).notationId
        if (!grouped.has(notId)) {
          grouped.set(notId, [])
        }
        grouped.get(notId)!.push({
          id: el.id,
          name: el.name,
          version: el.version,
          icon: parsePaletteIconFromAttrs(el.attrs)
        })
      }

      typeUsages.value = Array.from(grouped.entries()).map(([notationId, elements]) => {
        const notation = notationsMap.get(notationId)
        return {
          notationId,
          notationName: notation?.name ?? notationId,
          notationIcon: notation?.icon,
          elements
        }
      })
    } finally {
      isLoadingUsages.value = false
    }
  }

watch(selectedTypeId, () => {
  const item = selectedType.value
  if (item) {
    loadUsages(item)
  } else {
    typeUsages.value = []
  }
})

  return {
    currentUserId,
    nodeTypes,
    linkTypes,
    selectedType,
    selectedTypeId,
    isLoading,
    isSaving,
    saveError,
    ownerDisplayNames,
    selectedTypeOwnerName,
    loadAll,
    selectType,
    refreshSnapshot,
    addType,
    saveType,
    deleteType,
    addCustomProperty,
    removeCustomProperty,
    typeUsages,
    isLoadingUsages,
    loadUsages,
    isDirty
  }
}
