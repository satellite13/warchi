import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiDelete, apiGet, apiPost, apiPut } from '../../../composables/useApi'
import type { ModelData, NotationData, PaginatedResponse } from '../../../types/entities'
import type {
  ComponentResponse,
  DiagramRequest,
  DiagramResponse,
  DiagramUpdateRequest,
  LinkRequest,
  LinkResponse,
  LinkTypeResponse,
  ModelUpdateRequest,
  NodeRequest,
  NodeResponse,
  NodeTypeResponse,
  RelationResponse,
  RelationRuleResponse,
} from '../../../types/api'
import {
  parseDiagramAttrs,
  parseLinkAttrs,
  parseNodeAttrs,
  serializeDiagramAttrs,
  serializeLinkAttrs,
  serializeNodeAttrs,
} from '../modelAttrs'
import {
  createEmptyModelEditorState,
  type EditorDiagram,
  type EditorLink,
  type EditorNode,
  type ModelEditorState,
} from '../types'

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
  markModelDirty: () => void
  renameModel: (nextName: string) => string | null
  handleBack: () => void
  createDiagramBaseline: (diagramId: string) => Promise<EditorDiagram | null>
}

const toEditorNode = (row: NodeResponse): EditorNode => ({
  ...row,
  parsedAttrs: parseNodeAttrs(row.attrs ?? null),
})

const toEditorLink = (row: LinkResponse): EditorLink => ({
  ...row,
  parsedAttrs: parseLinkAttrs(row.attrs ?? null),
})

const toEditorDiagram = (row: DiagramResponse): EditorDiagram => ({
  ...row,
  parsedAttrs: parseDiagramAttrs(row.attrs ?? null),
})

const withoutDeleted = <T extends { _isDeleted?: boolean }>(rows: T[]): T[] =>
  rows.filter(row => !row._isDeleted)

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
  const saveProgress = ref('')
  const modelDirty = ref(false)
  const modelInitialName = ref('')
  const modelCatalog = ref<ModelData[]>([])
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
    const hasDirtyNodes = state.value.nodes.some(
      item => item._isNew || item._isDirty || item._isDeleted
    )
    const hasDirtyLinks = state.value.links.some(
      item => item._isNew || item._isDirty || item._isDeleted
    )
    const hasDirtyDiagrams = state.value.diagrams.some(
      item => item._isNew || item._isDirty || item._isDeleted
    )
    return modelDirty.value || hasDirtyNodes || hasDirtyLinks || hasDirtyDiagrams
  })

  const loadModel = async (): Promise<void> => {
    const modelId = route.params.id
    if (!modelId || typeof modelId !== 'string') {
      errorMessage.value = 'Не удалось определить модель.'
      isLoading.value = false
      return
    }

    isLoading.value = true
    errorMessage.value = null

    try {
      const listQuery = new URLSearchParams({ size: '1000' })

      const [
        modelResult,
        modelsResult,
        nodesResult,
        linksResult,
        diagramsResult,
        notationsResult,
        nodeTypesResult,
        linkTypesResult,
        componentsResult,
        relationsResult,
        relationRulesResult,
      ] = await Promise.all([
        apiGet<ModelData>(`/models/${modelId}`),
        apiGet<PaginatedResponse<ModelData>>(`/models?page=0&${listQuery.toString()}`),
        apiGet<PaginatedResponse<NodeResponse>>(
          `/nodes?modelId=${encodeURIComponent(modelId)}&size=1000`
        ),
        apiGet<PaginatedResponse<LinkResponse>>(
          `/links?modelId=${encodeURIComponent(modelId)}&size=1000`
        ),
        apiGet<PaginatedResponse<DiagramResponse>>(
          `/diagrams?modelId=${encodeURIComponent(modelId)}&size=1000`
        ),
        apiGet<PaginatedResponse<NotationData>>(`/notations?${listQuery.toString()}`),
        apiGet<PaginatedResponse<NodeTypeResponse>>(
          `/node-types?modelId=${encodeURIComponent(modelId)}&${listQuery.toString()}`
        ),
        apiGet<PaginatedResponse<LinkTypeResponse>>(
          `/link-types?modelId=${encodeURIComponent(modelId)}&${listQuery.toString()}`
        ),
        apiGet<PaginatedResponse<ComponentResponse>>(`/components?${listQuery.toString()}`),
        apiGet<PaginatedResponse<RelationResponse>>(`/relations?${listQuery.toString()}`),
        apiGet<PaginatedResponse<RelationRuleResponse>>(`/relation-rules?${listQuery.toString()}`),
      ])

      if (!modelResult.success) {
        if (modelResult.error.status === 404) {
          throw new Error('Модель не найдена')
        }
        if (modelResult.error.status === 403) {
          throw new Error('Доступ к модели отозван или отсутствует.')
        }
        throw new Error(modelResult.error.message)
      }

      model.value = modelResult.data
      modelInitialName.value = modelResult.data.name
      modelDirty.value = false
      modelCatalog.value = modelsResult.success ? (modelsResult.data.content ?? []) : []
      state.value = {
        modelId,
        ownerId: modelResult.data.ownerId,
        nodes: nodesResult.success ? (nodesResult.data.content ?? []).map(toEditorNode) : [],
        links: linksResult.success ? (linksResult.data.content ?? []).map(toEditorLink) : [],
        diagrams: diagramsResult.success
          ? (diagramsResult.data.content ?? []).map(toEditorDiagram)
          : [],
        notations: notationsResult.success ? (notationsResult.data.content ?? []) : [],
        nodeTypes: nodeTypesResult.success ? (nodeTypesResult.data.content ?? []) : [],
        linkTypes: linkTypesResult.success ? (linkTypesResult.data.content ?? []) : [],
        components: componentsResult.success ? (componentsResult.data.content ?? []) : [],
        relations: relationsResult.success ? (relationsResult.data.content ?? []) : [],
        relationRules: relationRulesResult.success ? (relationRulesResult.data.content ?? []) : [],
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Не удалось загрузить модель.'
    } finally {
      isLoading.value = false
    }
  }

  const markNodeDirty = (id: string) => {
    const row = state.value.nodes.find(item => item.id === id)
    if (row && !row._isNew) row._isDirty = true
  }
  const markLinkDirty = (id: string) => {
    const row = state.value.links.find(item => item.id === id)
    if (row && !row._isNew) row._isDirty = true
  }
  const markDiagramDirty = (id: string) => {
    const row = state.value.diagrams.find(item => item.id === id)
    if (row && !row._isNew) row._isDirty = true
  }

  const markModelDirty = () => {
    modelDirty.value = true
  }

  const hasModelNameVersionConflict = (name: string, version: string): boolean => {
    if (!model.value) return false
    const normalizedName = name.trim().toLowerCase()
    const normalizedVersion = version.trim()
    if (!normalizedName || !normalizedVersion) return false
    return modelCatalog.value.some(
      item =>
        item.id !== model.value!.id &&
        item.name.trim().toLowerCase() === normalizedName &&
        item.version.trim() === normalizedVersion
    )
  }

  const renameModel = (nextName: string): string | null => {
    if (!model.value) return 'Модель не загружена.'
    const trimmed = nextName.trim()
    if (!trimmed) return 'Название модели не может быть пустым.'
    if (hasModelNameVersionConflict(trimmed, model.value.version)) {
      return 'Модель с таким именем и версией уже существует.'
    }
    if (trimmed === model.value.name) return null
    model.value.name = trimmed
    modelDirty.value = trimmed !== modelInitialName.value
    return null
  }

  const saveChanges = async (): Promise<boolean> => {
    if (!model.value) return false
    isSaving.value = true
    saveError.value = null
    saveSuccess.value = false
    saveProgress.value = ''

    try {
      const formatSaveEntityError = (
        action: 'создания' | 'обновления' | 'удаления',
        entity: string,
        status: number,
        message: string
      ): string => {
        if (status === 401 || status === 403) {
          return 'Недостаточно прав для редактирования модели. Войдите заново или обратитесь к администратору.'
        }
        return `Ошибка ${action} ${entity}: ${message}`
      }

      const ownerId = state.value.ownerId
      const modelId = state.value.modelId

      const nodes = state.value.nodes
      const links = state.value.links
      const diagrams = state.value.diagrams

      if (model.value && modelDirty.value) {
        saveProgress.value = `Обновление модели: ${model.value.name}`
        const request: ModelUpdateRequest = {
          name: model.value.name,
          version: model.value.version,
          ownerId: model.value.ownerId,
          attrs: model.value.attrs ?? null,
        }
        const result = await apiPut<ModelData>(`/models/${model.value.id}`, request)
        if (!result.success) {
          if (result.error.status === 409) {
            throw new Error('Модель с таким именем и версией уже существует.')
          }
          throw new Error(`Ошибка обновления модели: ${result.error.message}`)
        }
        model.value = result.data
        modelInitialName.value = result.data.name
        modelDirty.value = false
        const idx = modelCatalog.value.findIndex(item => item.id === result.data.id)
        if (idx >= 0) modelCatalog.value[idx] = result.data
      }

      const newNodeIdMap = new Map<string, string>()

      const pendingNewNodes = nodes.filter(row => row._isNew && !row._isDeleted)
      const pendingNewNodeIds = new Set(pendingNewNodes.map(node => node.id))

      while (pendingNewNodes.length > 0) {
        let progress = false

        for (let i = 0; i < pendingNewNodes.length; i += 1) {
          const node = pendingNewNodes[i]!
          const rawParentId = node.parentNodeId ?? null
          const parentIsPending = rawParentId ? pendingNewNodeIds.has(rawParentId) : false
          if (parentIsPending && !newNodeIdMap.has(rawParentId!)) {
            continue
          }

          const resolvedParentId = rawParentId
            ? (newNodeIdMap.get(rawParentId) ?? rawParentId)
            : null
          saveProgress.value = `Создание узла: ${node.name}`
          const request: NodeRequest = {
            name: node.name,
            modelId,
            ownerId,
            nodeTypeId: node.nodeTypeId,
            parentNodeId: resolvedParentId,
            attrs: serializeNodeAttrs(node.parsedAttrs),
          }
          const result = await apiPost<NodeResponse>('/nodes', request)
          if (!result.success) {
            throw new Error(
              formatSaveEntityError('создания', 'узла', result.error.status, result.error.message)
            )
          }
          const oldId = node.id
          newNodeIdMap.set(oldId, result.data.id)
          node.id = result.data.id
          node.parentNodeId = result.data.parentNodeId ?? resolvedParentId
          node._isNew = false
          pendingNewNodes.splice(i, 1)
          pendingNewNodeIds.delete(oldId)
          i -= 1
          progress = true
        }

        if (!progress) {
          throw new Error('Не удалось сохранить новые узлы: проверьте иерархию дерева.')
        }
      }

      for (const node of nodes.filter(row => row._isDirty && !row._isDeleted && !row._isNew)) {
        saveProgress.value = `Обновление узла: ${node.name}`
        const resolvedParentId = node.parentNodeId
          ? (newNodeIdMap.get(node.parentNodeId) ?? node.parentNodeId)
          : null
        const request: NodeRequest = {
          name: node.name,
          modelId,
          ownerId,
          nodeTypeId: node.nodeTypeId,
          parentNodeId: resolvedParentId,
          attrs: serializeNodeAttrs(node.parsedAttrs),
        }
        const result = await apiPut<NodeResponse>(`/nodes/${node.id}`, request)
        if (!result.success) {
          throw new Error(
            formatSaveEntityError('обновления', 'узла', result.error.status, result.error.message)
          )
        }
        node.parentNodeId = result.data.parentNodeId ?? resolvedParentId
        node._isDirty = false
      }

      // Delete nodes after all node updates.
      // This prevents backend cascades from removing nodes that were moved out
      // of a folder in the same save transaction.
      for (const node of nodes.filter(row => row._isDeleted && !row._isNew)) {
        saveProgress.value = `Удаление узла: ${node.name}`
        const result = await apiDelete<void>(`/nodes/${node.id}`)
        if (!result.success) {
          throw new Error(
            formatSaveEntityError('удаления', 'узла', result.error.status, result.error.message)
          )
        }
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

      for (const link of links.filter(row => row._isDeleted && !row._isNew)) {
        saveProgress.value = `Удаление связи`
        const result = await apiDelete<void>(`/links/${link.id}`)
        if (!result.success) throw new Error(`Ошибка удаления связи: ${result.error.message}`)
      }

      for (const link of links.filter(row => row._isNew && !row._isDeleted)) {
        saveProgress.value = `Создание связи`
        const request: LinkRequest = {
          sourceId: link.sourceId,
          targetId: link.targetId,
          modelId,
          ownerId,
          linkTypeId: link.linkTypeId,
          attrs: serializeLinkAttrs(link.parsedAttrs),
        }
        const result = await apiPost<LinkResponse>('/links', request)
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

      for (const link of links.filter(row => row._isDirty && !row._isDeleted && !row._isNew)) {
        saveProgress.value = `Обновление связи`
        const request: LinkRequest = {
          sourceId: link.sourceId,
          targetId: link.targetId,
          modelId,
          ownerId,
          linkTypeId: link.linkTypeId,
          attrs: serializeLinkAttrs(link.parsedAttrs),
        }
        const result = await apiPut<LinkResponse>(`/links/${link.id}`, request)
        if (!result.success) throw new Error(`Ошибка обновления связи: ${result.error.message}`)
        link._isDirty = false
      }

      for (const diagram of diagrams.filter(row => row._isDeleted && !row._isNew)) {
        saveProgress.value = `Удаление диаграммы: ${diagram.name}`
        const result = await apiDelete<void>(`/diagrams/${diagram.id}`)
        if (!result.success) throw new Error(`Ошибка удаления диаграммы: ${result.error.message}`)
      }

      for (const diagram of diagrams.filter(row => row._isNew && !row._isDeleted)) {
        saveProgress.value = `Создание диаграммы: ${diagram.name}`
        const request: DiagramRequest = {
          name: diagram.name,
          version: diagram.version,
          ownerId,
          modelId,
          nodeId: diagram.nodeId ?? null,
          notationId: diagram.notationId,
          attrs: serializeDiagramAttrs(diagram.parsedAttrs),
        }
        const result = await apiPost<DiagramResponse>('/diagrams', request)
        if (!result.success) throw new Error(`Ошибка создания диаграммы: ${result.error.message}`)
        diagram.id = result.data.id
        diagram._isNew = false
      }

      for (const diagram of diagrams.filter(
        row => row._isDirty && !row._isDeleted && !row._isNew
      )) {
        saveProgress.value = `Обновление диаграммы: ${diagram.name}`
        const request: DiagramUpdateRequest = {
          name: diagram.name,
          version: diagram.version,
          ownerId,
          modelId,
          nodeId: diagram.nodeId ?? null,
          notationId: diagram.notationId,
          attrs: serializeDiagramAttrs(diagram.parsedAttrs),
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
      saveError.value = error instanceof Error ? error.message : 'Не удалось сохранить изменения.'
      if (saveErrorTimer) clearTimeout(saveErrorTimer)
      saveErrorTimer = setTimeout(() => {
        saveError.value = null
        saveErrorTimer = null
      }, 5000)
      return false
    } finally {
      isSaving.value = false
      saveProgress.value = ''
    }
  }

  const handleBack = () => {
    router.push({ name: 'models' })
  }

  const createDiagramBaseline = async (diagramId: string): Promise<EditorDiagram | null> => {
    const result = await apiPost<DiagramResponse>(`/diagrams/${diagramId}/baseline`, {})
    if (!result.success) return null
    const editorDiagram = toEditorDiagram(result.data)
    state.value.diagrams = [...state.value.diagrams, editorDiagram]
    return editorDiagram
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
    markModelDirty,
    renameModel,
    handleBack,
    createDiagramBaseline,
  }
}
