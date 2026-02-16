import { ref, computed, watch, type Ref } from "vue"
import { apiGet, apiPost, apiPut, apiDelete } from "../../../composables/useApi"
import { useAuth } from "../../../composables/useAuth"
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
} from "../../../types/api"
import type { PaginatedResponse, NotationData } from "../../../types/entities"

export type TypeKind = "node" | "link"

export interface TypeItem {
  id: string
  name: string
  ownerId: string
  kind: TypeKind
  parsedAttrs: TypeParsedAttrs
  _isNew?: boolean
}

function toTypeItem(resp: NodeTypeResponse | LinkTypeResponse, kind: TypeKind): TypeItem {
  return {
    id: resp.id,
    name: resp.name,
    ownerId: resp.ownerId,
    kind,
    parsedAttrs: parseTypeAttrs(resp.attrs ?? null)
  }
}

export function useTypeEditor() {
  const { currentUser } = useAuth()

  const nodeTypes: Ref<TypeItem[]> = ref([])
  const linkTypes: Ref<TypeItem[]> = ref([])
  const selectedTypeId = ref<string | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)

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
    return JSON.stringify({ name: item.name, attrs: serializeTypeAttrs(item.parsedAttrs) })
  }

  function updateSnapshot() {
    const item = selectedType.value
    if (item) {
      savedSnapshot.value = item._isNew ? null : takeSnapshot(item)
    } else {
      savedSnapshot.value = null
    }
  }

  const isDirty = computed(() => {
    const item = selectedType.value
    if (!item) return false
    if (item._isNew) return true
    if (savedSnapshot.value === null) return false
    return takeSnapshot(item) !== savedSnapshot.value
  })

  async function loadAll() {
    isLoading.value = true
    saveError.value = null
    try {
      const [nodeResult, linkResult] = await Promise.all([
        apiGet<PaginatedResponse<NodeTypeResponse>>("/node-types?size=1000"),
        apiGet<PaginatedResponse<LinkTypeResponse>>("/link-types?size=1000")
      ])

      if (nodeResult.success) {
        nodeTypes.value = (nodeResult.data.content ?? []).map((r) => toTypeItem(r, "node"))
      }
      if (linkResult.success) {
        linkTypes.value = (linkResult.data.content ?? []).map((r) => toTypeItem(r, "link"))
      }
    } finally {
      isLoading.value = false
    }
  }

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

    try {
      if (item._isNew) {
        if (item.kind === "node") {
          const body: NodeTypeRequest = {
            name: item.name,
            ownerId: item.ownerId,
            attrs
          }
          const result = await apiPost<NodeTypeResponse>("/node-types", body)
          if (!result.success) {
            saveError.value = result.error.message
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
            ownerId: item.ownerId,
            attrs
          }
          const result = await apiPost<LinkTypeResponse>("/link-types", body)
          if (!result.success) {
            saveError.value = result.error.message
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
            saveError.value = result.error.message
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
            saveError.value = result.error.message
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
        saveError.value = result.error.message
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
      enumValues: []
    })
  }

  function removeCustomProperty(item: TypeItem, propertyId: string) {
    if (!item.parsedAttrs.customProperties) return
    item.parsedAttrs.customProperties = item.parsedAttrs.customProperties.filter(
      (p) => p.id !== propertyId
    )
  }

  // --- Type usages ---

  interface UsageElement {
    id: string
    name: string
    version: string
  }

  interface UsageGroup {
    notationId: string
    notationName: string
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
      const [notationsResult, elementsResult] = await Promise.all([
        apiGet<PaginatedResponse<NotationData>>("/notations?size=1000"),
        item.kind === "node"
          ? apiGet<PaginatedResponse<ComponentResponse>>("/components?size=1000")
          : apiGet<PaginatedResponse<RelationResponse>>("/relations?size=1000")
      ])

      const notationsMap = new Map<string, string>()
      if (notationsResult.success) {
        for (const n of notationsResult.data.content ?? []) {
          notationsMap.set(n.id, `${n.name} (${n.version})`)
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
          version: el.version
        })
      }

      typeUsages.value = Array.from(grouped.entries()).map(([notationId, elements]) => ({
        notationId,
        notationName: notationsMap.get(notationId) ?? notationId,
        elements
      }))
    } finally {
      isLoadingUsages.value = false
    }
  }

  watch(selectedType, (item) => {
    if (item) {
      loadUsages(item)
    } else {
      typeUsages.value = []
    }
  })

  return {
    nodeTypes,
    linkTypes,
    selectedType,
    selectedTypeId,
    isLoading,
    isSaving,
    saveError,
    loadAll,
    selectType,
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
