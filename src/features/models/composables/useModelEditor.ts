import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { apiDelete, apiGet, apiPost, apiPut } from "../../../composables/useApi"
import type { ModelData, NotationData, PaginatedResponse } from "../../../types/entities"
import type {
  ComponentResponse,
  DiagramRequest,
  DiagramResponse,
  DiagramUpdateRequest,
  LinkRequest,
  LinkResponse,
  LinkTypeResponse,
  NodeRequest,
  NodeResponse,
  NodeTypeResponse,
  RelationResponse,
  RelationRuleResponse
} from "../../../types/api"
import {
  parseDiagramAttrs,
  parseLinkAttrs,
  parseNodeAttrs,
  serializeDiagramAttrs,
  serializeLinkAttrs,
  serializeNodeAttrs
} from "../modelAttrs"
import {
  createEmptyModelEditorState,
  type EditorDiagram,
  type EditorLink,
  type EditorNode,
  type ModelEditorState
} from "../types"

type ModelEditorReturn = {
  model: Ref<ModelData | null>
  state: Ref<ModelEditorState>
  isLoading: Ref<boolean>
  errorMessage: Ref<string | null>
  isSaving: Ref<boolean>
  saveError: Ref<string | null>
  saveSuccess: Ref<boolean>
  saveProgress: Ref<string>
  hasUnsavedChanges: ComputedRef<boolean>
  loadModel: () => Promise<void>
  saveChanges: () => Promise<boolean>
  markNodeDirty: (id: string) => void
  markLinkDirty: (id: string) => void
  markDiagramDirty: (id: string) => void
  handleBack: () => void
}

const toEditorNode = (row: NodeResponse): EditorNode => ({
  ...row,
  parsedAttrs: parseNodeAttrs(row.attrs ?? null)
})

const toEditorLink = (row: LinkResponse): EditorLink => ({
  ...row,
  parsedAttrs: parseLinkAttrs(row.attrs ?? null)
})

const toEditorDiagram = (row: DiagramResponse): EditorDiagram => ({
  ...row,
  parsedAttrs: parseDiagramAttrs(row.attrs ?? null)
})

const withoutDeleted = <T extends { _isDeleted?: boolean }>(rows: T[]): T[] =>
  rows.filter((row) => !row._isDeleted)

export const useModelEditor = (): ModelEditorReturn => {
  const route = useRoute()
  const router = useRouter()

  const model = ref<ModelData | null>(null)
  const state = ref<ModelEditorState>(createEmptyModelEditorState())
  const isLoading = ref(true)
  const errorMessage = ref<string | null>(null)
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)
  const saveSuccess = ref(false)
  const saveProgress = ref("")
  let saveSuccessTimer: ReturnType<typeof setTimeout> | null = null
  let saveErrorTimer: ReturnType<typeof setTimeout> | null = null

  onScopeDispose(() => {
    if (saveSuccessTimer) {
      clearTimeout(saveSuccessTimer)
      saveSuccessTimer = null
    }
    if (saveErrorTimer) {
      clearTimeout(saveErrorTimer)
      saveErrorTimer = null
    }
  })

  const hasUnsavedChanges = computed(() => {
    const hasDirtyNodes = state.value.nodes.some((item) => item._isNew || item._isDirty || item._isDeleted)
    const hasDirtyLinks = state.value.links.some((item) => item._isNew || item._isDirty || item._isDeleted)
    const hasDirtyDiagrams = state.value.diagrams.some((item) => item._isNew || item._isDirty || item._isDeleted)
    return hasDirtyNodes || hasDirtyLinks || hasDirtyDiagrams
  })

  const loadModel = async (): Promise<void> => {
    const modelId = route.params.id
    if (!modelId || typeof modelId !== "string") {
      errorMessage.value = "Не удалось определить модель."
      isLoading.value = false
      return
    }

    isLoading.value = true
    errorMessage.value = null

    try {
      const [
        modelResult,
        nodesResult,
        linksResult,
        diagramsResult,
        notationsResult,
        nodeTypesResult,
        linkTypesResult,
        componentsResult,
        relationsResult,
        relationRulesResult
      ] = await Promise.all([
        apiGet<ModelData>(`/models/${modelId}`),
        apiGet<PaginatedResponse<NodeResponse>>(`/nodes?modelId=${encodeURIComponent(modelId)}&size=1000`),
        apiGet<PaginatedResponse<LinkResponse>>(`/links?modelId=${encodeURIComponent(modelId)}&size=1000`),
        apiGet<PaginatedResponse<DiagramResponse>>(`/diagrams?modelId=${encodeURIComponent(modelId)}&size=1000`),
        apiGet<PaginatedResponse<NotationData>>("/notations?size=1000"),
        apiGet<PaginatedResponse<NodeTypeResponse>>("/node-types?size=1000"),
        apiGet<PaginatedResponse<LinkTypeResponse>>("/link-types?size=1000"),
        apiGet<PaginatedResponse<ComponentResponse>>("/components?size=1000"),
        apiGet<PaginatedResponse<RelationResponse>>("/relations?size=1000"),
        apiGet<PaginatedResponse<RelationRuleResponse>>("/relation-rules?size=1000")
      ])

      if (!modelResult.success) {
        throw new Error(modelResult.error.status === 404 ? "Модель не найдена" : modelResult.error.message)
      }

      model.value = modelResult.data
      state.value = {
        modelId,
        ownerId: modelResult.data.ownerId,
        nodes: nodesResult.success ? (nodesResult.data.content ?? []).map(toEditorNode) : [],
        links: linksResult.success ? (linksResult.data.content ?? []).map(toEditorLink) : [],
        diagrams: diagramsResult.success ? (diagramsResult.data.content ?? []).map(toEditorDiagram) : [],
        notations: notationsResult.success ? (notationsResult.data.content ?? []) : [],
        nodeTypes: nodeTypesResult.success ? (nodeTypesResult.data.content ?? []) : [],
        linkTypes: linkTypesResult.success ? (linkTypesResult.data.content ?? []) : [],
        components: componentsResult.success ? (componentsResult.data.content ?? []) : [],
        relations: relationsResult.success ? (relationsResult.data.content ?? []) : [],
        relationRules: relationRulesResult.success ? (relationRulesResult.data.content ?? []) : []
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "Не удалось загрузить модель."
    } finally {
      isLoading.value = false
    }
  }

  const markNodeDirty = (id: string) => {
    const row = state.value.nodes.find((item) => item.id === id)
    if (row && !row._isNew) row._isDirty = true
  }
  const markLinkDirty = (id: string) => {
    const row = state.value.links.find((item) => item.id === id)
    if (row && !row._isNew) row._isDirty = true
  }
  const markDiagramDirty = (id: string) => {
    const row = state.value.diagrams.find((item) => item.id === id)
    if (row && !row._isNew) row._isDirty = true
  }

  const saveChanges = async (): Promise<boolean> => {
    if (!model.value) return false
    isSaving.value = true
    saveError.value = null
    saveSuccess.value = false
    saveProgress.value = ""

    try {
      const ownerId = state.value.ownerId
      const modelId = state.value.modelId

      const nodes = state.value.nodes
      const links = state.value.links
      const diagrams = state.value.diagrams

      const newNodeIdMap = new Map<string, string>()

      for (const node of nodes.filter((row) => row._isDeleted && !row._isNew)) {
        saveProgress.value = `Удаление узла: ${node.name}`
        const result = await apiDelete<void>(`/nodes/${node.id}`)
        if (!result.success) throw new Error(`Ошибка удаления узла: ${result.error.message}`)
      }

      for (const node of nodes.filter((row) => row._isNew && !row._isDeleted)) {
        saveProgress.value = `Создание узла: ${node.name}`
        const request: NodeRequest = {
          name: node.name,
          modelId,
          ownerId,
          nodeTypeId: node.nodeTypeId,
          parentNodeId: node.parentNodeId ?? null,
          attrs: serializeNodeAttrs(node.parsedAttrs)
        }
        const result = await apiPost<NodeResponse>("/nodes", request)
        if (!result.success) throw new Error(`Ошибка создания узла: ${result.error.message}`)
        newNodeIdMap.set(node.id, result.data.id)
        node.id = result.data.id
        node._isNew = false
      }

      for (const node of nodes.filter((row) => row._isDirty && !row._isDeleted && !row._isNew)) {
        saveProgress.value = `Обновление узла: ${node.name}`
        const request: NodeRequest = {
          name: node.name,
          modelId,
          ownerId,
          nodeTypeId: node.nodeTypeId,
          parentNodeId: node.parentNodeId ?? null,
          attrs: serializeNodeAttrs(node.parsedAttrs)
        }
        const result = await apiPut<NodeResponse>(`/nodes/${node.id}`, request)
        if (!result.success) throw new Error(`Ошибка обновления узла: ${result.error.message}`)
        node._isDirty = false
      }

      // Update links/diagrams references if nodes were recreated.
      if (newNodeIdMap.size > 0) {
        for (const link of links) {
          if (newNodeIdMap.has(link.sourceId)) link.sourceId = newNodeIdMap.get(link.sourceId)!
          if (newNodeIdMap.has(link.targetId)) link.targetId = newNodeIdMap.get(link.targetId)!
        }
        for (const diagram of diagrams) {
          if (diagram.nodeId && newNodeIdMap.has(diagram.nodeId)) {
            diagram.nodeId = newNodeIdMap.get(diagram.nodeId) ?? diagram.nodeId
          }
          for (const nodeInstance of diagram.parsedAttrs.instances.nodes) {
            if (newNodeIdMap.has(nodeInstance.modelNodeId)) {
              nodeInstance.modelNodeId = newNodeIdMap.get(nodeInstance.modelNodeId)!
            }
          }
        }
      }

      for (const link of links.filter((row) => row._isDeleted && !row._isNew)) {
        saveProgress.value = `Удаление связи`
        const result = await apiDelete<void>(`/links/${link.id}`)
        if (!result.success) throw new Error(`Ошибка удаления связи: ${result.error.message}`)
      }

      for (const link of links.filter((row) => row._isNew && !row._isDeleted)) {
        saveProgress.value = `Создание связи`
        const request: LinkRequest = {
          sourceId: link.sourceId,
          targetId: link.targetId,
          modelId,
          ownerId,
          linkTypeId: link.linkTypeId,
          attrs: serializeLinkAttrs(link.parsedAttrs)
        }
        const result = await apiPost<LinkResponse>("/links", request)
        if (!result.success) throw new Error(`Ошибка создания связи: ${result.error.message}`)
        const oldId = link.id
        link.id = result.data.id
        link._isNew = false
        for (const diagram of diagrams) {
          for (const edge of diagram.parsedAttrs.instances.edges) {
            if (edge.modelLinkId === oldId) edge.modelLinkId = result.data.id
          }
        }
      }

      for (const link of links.filter((row) => row._isDirty && !row._isDeleted && !row._isNew)) {
        saveProgress.value = `Обновление связи`
        const request: LinkRequest = {
          sourceId: link.sourceId,
          targetId: link.targetId,
          modelId,
          ownerId,
          linkTypeId: link.linkTypeId,
          attrs: serializeLinkAttrs(link.parsedAttrs)
        }
        const result = await apiPut<LinkResponse>(`/links/${link.id}`, request)
        if (!result.success) throw new Error(`Ошибка обновления связи: ${result.error.message}`)
        link._isDirty = false
      }

      for (const diagram of diagrams.filter((row) => row._isDeleted && !row._isNew)) {
        saveProgress.value = `Удаление диаграммы: ${diagram.name}`
        const result = await apiDelete<void>(`/diagrams/${diagram.id}`)
        if (!result.success) throw new Error(`Ошибка удаления диаграммы: ${result.error.message}`)
      }

      for (const diagram of diagrams.filter((row) => row._isNew && !row._isDeleted)) {
        saveProgress.value = `Создание диаграммы: ${diagram.name}`
        const request: DiagramRequest = {
          name: diagram.name,
          version: diagram.version,
          ownerId,
          modelId,
          nodeId: diagram.nodeId ?? null,
          notationId: diagram.notationId,
          attrs: serializeDiagramAttrs(diagram.parsedAttrs)
        }
        const result = await apiPost<DiagramResponse>("/diagrams", request)
        if (!result.success) throw new Error(`Ошибка создания диаграммы: ${result.error.message}`)
        diagram.id = result.data.id
        diagram._isNew = false
      }

      for (const diagram of diagrams.filter((row) => row._isDirty && !row._isDeleted && !row._isNew)) {
        saveProgress.value = `Обновление диаграммы: ${diagram.name}`
        const request: DiagramUpdateRequest = {
          name: diagram.name,
          version: diagram.version,
          ownerId,
          modelId,
          nodeId: diagram.nodeId ?? null,
          notationId: diagram.notationId,
          attrs: serializeDiagramAttrs(diagram.parsedAttrs)
        }
        const result = await apiPut<DiagramResponse>(`/diagrams/${diagram.id}`, request)
        if (!result.success) throw new Error(`Ошибка обновления диаграммы: ${result.error.message}`)
        diagram._isDirty = false
      }

      state.value.nodes = withoutDeleted(state.value.nodes)
      state.value.links = withoutDeleted(state.value.links)
      state.value.diagrams = withoutDeleted(state.value.diagrams)

      saveSuccess.value = true
      if (saveSuccessTimer) clearTimeout(saveSuccessTimer)
      saveSuccessTimer = setTimeout(() => {
        saveSuccess.value = false
        saveSuccessTimer = null
      }, 2500)
      return true
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : "Не удалось сохранить изменения."
      if (saveErrorTimer) clearTimeout(saveErrorTimer)
      saveErrorTimer = setTimeout(() => {
        saveError.value = null
        saveErrorTimer = null
      }, 5000)
      return false
    } finally {
      isSaving.value = false
      saveProgress.value = ""
    }
  }

  const handleBack = () => {
    router.push({ name: "models" })
  }

  return {
    model,
    state,
    isLoading,
    errorMessage,
    isSaving,
    saveError,
    saveSuccess,
    saveProgress,
    hasUnsavedChanges,
    loadModel,
    saveChanges,
    markNodeDirty,
    markLinkDirty,
    markDiagramDirty,
    handleBack
  }
}
