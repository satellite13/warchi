import { ref, computed, onScopeDispose, type Ref, type ComputedRef } from "vue"
import { useRoute, useRouter } from "vue-router"
import { apiGet, apiPost, apiPut, apiDelete } from "../../../composables/useApi"
import type { NotationData, PaginatedResponse } from "../../../types/entities"
import type {
  NodeTypeResponse,
  NodeTypeRequest,
  LinkTypeResponse,
  LinkTypeRequest,
  ComponentResponse,
  ComponentRequest,
  RelationResponse,
  RelationRequest
} from "../../../types/api"
import {
  parseEntityAttrs,
  serializeEntityAttrs,
  parseTypeAttrs,
  serializeTypeAttrs
} from "../notationAttrs"
import {
  type NotationEditorState,
  type EditorNodeType,
  type EditorLinkType,
  type EditorComponent,
  type EditorRelation,
  createEmptyEditorState
} from "../types"

export interface NotationEditorReturn {
  notation: Ref<NotationData | null>
  state: Ref<NotationEditorState>
  isLoading: Ref<boolean>
  errorMessage: Ref<string | null>
  isSaving: Ref<boolean>
  saveError: Ref<string | null>
  saveSuccess: Ref<boolean>
  saveProgress: Ref<string>
  hasUnsavedChanges: ComputedRef<boolean>
  loadNotation: () => Promise<void>
  saveChanges: (hasValidationErrors: boolean) => Promise<boolean>
  handleBack: () => void
}

function toEditorNodeType(response: NodeTypeResponse): EditorNodeType {
  return {
    id: response.id,
    name: response.name,
    ownerId: response.ownerId,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    parsedAttrs: parseTypeAttrs(response.attrs ?? null)
  }
}

function toEditorLinkType(response: LinkTypeResponse): EditorLinkType {
  return {
    id: response.id,
    name: response.name,
    ownerId: response.ownerId,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    parsedAttrs: parseTypeAttrs(response.attrs ?? null)
  }
}

function toEditorComponent(response: ComponentResponse): EditorComponent {
  return {
    id: response.id,
    name: response.name,
    version: response.version,
    notationId: response.notationId,
    ownerId: response.ownerId,
    nodeTypeId: response.nodeTypeId,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    parsedAttrs: parseEntityAttrs(response.attrs ?? null)
  }
}

function toEditorRelation(response: RelationResponse): EditorRelation {
  return {
    id: response.id,
    name: response.name,
    version: response.version,
    notationId: response.notationId,
    ownerId: response.ownerId,
    linkTypeId: response.linkTypeId,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    parsedAttrs: parseEntityAttrs(response.attrs ?? null)
  }
}

export function useNotationEditor(): NotationEditorReturn {
  const route = useRoute()
  const router = useRouter()

  const notation = ref<NotationData | null>(null)
  const state = ref<NotationEditorState>(createEmptyEditorState())

  const isLoading = ref(true)
  const errorMessage = ref<string | null>(null)
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)
  const saveSuccess = ref(false)
  const saveProgress = ref("")
  let saveSuccessTimer: ReturnType<typeof setTimeout> | null = null

  onScopeDispose(() => {
    if (saveSuccessTimer !== null) {
      clearTimeout(saveSuccessTimer)
      saveSuccessTimer = null
    }
  })

  const hasUnsavedChanges = computed(() => {
    const { nodeTypes, linkTypes, components, relations } = state.value
    const hasNewTypes =
      nodeTypes.some((t) => t._isNew) || linkTypes.some((t) => t._isNew)
    const hasChangedComponents = components.some(
      (c) => c._isNew || c._isDirty || c._isDeleted
    )
    const hasChangedRelations = relations.some(
      (r) => r._isNew || r._isDirty || r._isDeleted
    )
    return hasNewTypes || hasChangedComponents || hasChangedRelations
  })

  const loadNotation = async () => {
    const notationId = route.params.id
    if (!notationId || typeof notationId !== "string") {
      errorMessage.value = "Не удалось определить нотацию."
      isLoading.value = false
      return
    }

    isLoading.value = true
    errorMessage.value = null

    try {
      // Parallel fetch from 5 endpoints
      const [
        notationResult,
        nodeTypesResult,
        linkTypesResult,
        componentsResult,
        relationsResult
      ] = await Promise.all([
        apiGet<NotationData>(`/notations/${notationId}`),
        apiGet<PaginatedResponse<NodeTypeResponse>>("/node-types?size=1000"),
        apiGet<PaginatedResponse<LinkTypeResponse>>("/link-types?size=1000"),
        apiGet<PaginatedResponse<ComponentResponse>>(
          `/components?notationId=${encodeURIComponent(notationId)}&size=1000`
        ),
        apiGet<PaginatedResponse<RelationResponse>>(
          `/relations?notationId=${encodeURIComponent(notationId)}&size=1000`
        )
      ])

      if (!notationResult.success) {
        if (notationResult.error.status === 404) {
          throw new Error("Нотация не найдена")
        }
        throw new Error(notationResult.error.message)
      }

      notation.value = notationResult.data

      state.value = {
        notationId,
        ownerId: notationResult.data.ownerId,
        nodeTypes: nodeTypesResult.success
          ? (nodeTypesResult.data.content ?? []).map(toEditorNodeType)
          : [],
        linkTypes: linkTypesResult.success
          ? (linkTypesResult.data.content ?? []).map(toEditorLinkType)
          : [],
        components: componentsResult.success
          ? (componentsResult.data.content ?? []).map(toEditorComponent)
          : [],
        relations: relationsResult.success
          ? (relationsResult.data.content ?? []).map(toEditorRelation)
          : []
      }
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "Не удалось загрузить нотацию."
    } finally {
      isLoading.value = false
    }
  }

  const saveChanges = async (hasValidationErrors: boolean): Promise<boolean> => {
    if (!notation.value) {
      return false
    }

    if (hasValidationErrors) {
      saveError.value = "Исправьте ошибки в свойствах перед сохранением"
      return false
    }

    isSaving.value = true
    saveError.value = null
    saveSuccess.value = false
    saveProgress.value = ""

    try {
      const { notationId, ownerId, nodeTypes, linkTypes, components, relations } =
        state.value

      // Step 1: Create new node types
      const newNodeTypes = nodeTypes.filter((t) => t._isNew)
      for (const nodeType of newNodeTypes) {
        saveProgress.value = `Создание типа узла: ${nodeType.name}`
        const request: NodeTypeRequest = {
          name: nodeType.name,
          ownerId,
          attrs: serializeTypeAttrs(nodeType.parsedAttrs)
        }
        const result = await apiPost<NodeTypeResponse>("/node-types", request)
        if (!result.success) {
          throw new Error(`Ошибка создания типа узла: ${result.error.message}`)
        }
        // Update ID for components referencing this type
        const oldId = nodeType.id
        nodeType.id = result.data.id
        nodeType._isNew = false
        components.forEach((c) => {
          if (c.nodeTypeId === oldId) {
            c.nodeTypeId = result.data.id
          }
        })
      }

      // Step 2: Create new link types
      const newLinkTypes = linkTypes.filter((t) => t._isNew)
      for (const linkType of newLinkTypes) {
        saveProgress.value = `Создание типа связи: ${linkType.name}`
        const request: LinkTypeRequest = {
          name: linkType.name,
          ownerId,
          attrs: serializeTypeAttrs(linkType.parsedAttrs)
        }
        const result = await apiPost<LinkTypeResponse>("/link-types", request)
        if (!result.success) {
          throw new Error(`Ошибка создания типа связи: ${result.error.message}`)
        }
        // Update ID for relations referencing this type
        const oldId = linkType.id
        linkType.id = result.data.id
        linkType._isNew = false
        relations.forEach((r) => {
          if (r.linkTypeId === oldId) {
            r.linkTypeId = result.data.id
          }
        })
      }

      // Step 3: Delete marked components
      const deletedComponents = components.filter((c) => c._isDeleted && !c._isNew)
      for (const component of deletedComponents) {
        saveProgress.value = `Удаление компонента: ${component.name}`
        const result = await apiDelete<void>(`/components/${component.id}`)
        if (!result.success) {
          throw new Error(`Ошибка удаления компонента: ${result.error.message}`)
        }
      }

      // Step 4: Delete marked relations
      const deletedRelations = relations.filter((r) => r._isDeleted && !r._isNew)
      for (const relation of deletedRelations) {
        saveProgress.value = `Удаление отношения: ${relation.name}`
        const result = await apiDelete<void>(`/relations/${relation.id}`)
        if (!result.success) {
          throw new Error(`Ошибка удаления отношения: ${result.error.message}`)
        }
      }

      // Step 5: Create new components
      const newComponents = components.filter((c) => c._isNew && !c._isDeleted)
      for (const component of newComponents) {
        saveProgress.value = `Создание компонента: ${component.name}`
        const request: ComponentRequest = {
          name: component.name,
          version: component.version,
          notationId,
          ownerId,
          nodeTypeId: component.nodeTypeId,
          attrs: serializeEntityAttrs(component.parsedAttrs)
        }
        const result = await apiPost<ComponentResponse>("/components", request)
        if (!result.success) {
          throw new Error(`Ошибка создания компонента: ${result.error.message}`)
        }
        component.id = result.data.id
        component._isNew = false
      }

      // Step 6: Update dirty components
      const dirtyComponents = components.filter(
        (c) => c._isDirty && !c._isNew && !c._isDeleted
      )
      for (const component of dirtyComponents) {
        saveProgress.value = `Обновление компонента: ${component.name}`
        const request: ComponentRequest = {
          name: component.name,
          version: component.version,
          notationId,
          ownerId,
          nodeTypeId: component.nodeTypeId,
          attrs: serializeEntityAttrs(component.parsedAttrs)
        }
        const result = await apiPut<ComponentResponse>(
          `/components/${component.id}`,
          request
        )
        if (!result.success) {
          throw new Error(`Ошибка обновления компонента: ${result.error.message}`)
        }
        component._isDirty = false
      }

      // Step 7: Create new relations
      const newRelations = relations.filter((r) => r._isNew && !r._isDeleted)
      for (const relation of newRelations) {
        saveProgress.value = `Создание отношения: ${relation.name}`
        const request: RelationRequest = {
          name: relation.name,
          version: relation.version,
          notationId,
          ownerId,
          linkTypeId: relation.linkTypeId,
          attrs: serializeEntityAttrs(relation.parsedAttrs)
        }
        const result = await apiPost<RelationResponse>("/relations", request)
        if (!result.success) {
          throw new Error(`Ошибка создания отношения: ${result.error.message}`)
        }
        relation.id = result.data.id
        relation._isNew = false
      }

      // Step 8: Update dirty relations
      const dirtyRelations = relations.filter(
        (r) => r._isDirty && !r._isNew && !r._isDeleted
      )
      for (const relation of dirtyRelations) {
        saveProgress.value = `Обновление отношения: ${relation.name}`
        const request: RelationRequest = {
          name: relation.name,
          version: relation.version,
          notationId,
          ownerId,
          linkTypeId: relation.linkTypeId,
          attrs: serializeEntityAttrs(relation.parsedAttrs)
        }
        const result = await apiPut<RelationResponse>(
          `/relations/${relation.id}`,
          request
        )
        if (!result.success) {
          throw new Error(`Ошибка обновления отношения: ${result.error.message}`)
        }
        relation._isDirty = false
      }

      // Remove deleted items from state
      state.value.components = components.filter((c) => !c._isDeleted)
      state.value.relations = relations.filter((r) => !r._isDeleted)

      saveSuccess.value = true
      if (saveSuccessTimer !== null) {
        clearTimeout(saveSuccessTimer)
      }
      saveSuccessTimer = setTimeout(() => {
        saveSuccess.value = false
        saveSuccessTimer = null
      }, 3000)
      return true
    } catch (error) {
      saveError.value =
        error instanceof Error ? error.message : "Не удалось сохранить изменения."
      return false
    } finally {
      isSaving.value = false
      saveProgress.value = ""
    }
  }

  const handleBack = () => {
    router.push({ name: "notations" })
  }

  return {
    notation,
    state,
    isLoading,
    errorMessage,
    isSaving,
    saveError,
    saveSuccess,
    saveProgress,
    hasUnsavedChanges,
    loadNotation,
    saveChanges,
    handleBack
  }
}
