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
import { clonePlainDeep } from '../../../utils/clonePlainDeep'
import { paginatedIsLastPage } from '../../../utils/paginatedResponse'
import { compareVersions } from '../../../utils/version'
import {
  type DiagramAttrs,
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
import { mergeDiagramAttrsAfterBatchConflictReload } from '../utils/mergeLocalCustomPropsAfterReload'
import { applyDiagramGarbageSanitizeToState } from '../utils/sanitizeDiagramInstances'
import {
  applyBatchRemapping,
  batchSave,
  buildBatchSaveRequest,
  hasBatchChanges,
  isValidBatchResponse,
  parseBatchSaveConflictDetails,
  refreshBatchSavedEntityTimestamps,
  type BatchConflictItem,
} from './useModelBatchSave'

type ModelEditorReturn = {
  model: Ref<ModelData | null>
  state: Ref<ModelEditorState>
  isLoading: Ref<boolean>
  errorMessage: Ref<string | null>
  /** true, если менялись метаданные модели (имя/версия/attrs) без сохранения */
  modelDirty: Ref<boolean>
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
  ensureNotationRelationsAndRules: (
    notationId: string,
    options?: { force?: boolean }
  ) => Promise<void>
  isNotationRelationsAndRulesLoading: (notationId: string | null | undefined) => boolean
  /** Конфликт версий при batch-save (409); null если нет */
  batchSaveConflict: Ref<BatchConflictItem[] | null>
  /** Подтянуть модель с сервера и закрыть диалог конфликта */
  resolveBatchSaveReload: () => Promise<void>
  /** Повторить сохранение с force=true (перезаписать сервер) */
  resolveBatchSaveOverwrite: () => Promise<boolean>
  /** Закрыть диалог конфликта без действия */
  dismissBatchSaveConflict: () => void
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

const RELATION_RULES_FETCH_SIZE = 5000
const RELATIONS_FETCH_SIZE = 5000

const fetchAllRelationRulesByNotationIds = async (
  notationIds: string[],
  options?: { includeAttrs?: boolean }
): Promise<RelationRuleResponse[]> => {
  if (notationIds.length === 0) return []
  const includeAttrs = options?.includeAttrs ?? true

  const collected: RelationRuleResponse[] = []

  for (const notationId of notationIds) {
    let page = 0
    while (true) {
      const query = new URLSearchParams({
        notationId,
        page: String(page),
        size: String(RELATION_RULES_FETCH_SIZE),
        includeAttrs: String(includeAttrs),
      })
      const result = await apiGet<PaginatedResponse<RelationRuleResponse>>(
        `/relation-rules?${query.toString()}`
      )
      if (!result.success) {
        throw new Error(`Ошибка загрузки правил связей: ${result.error.message}`)
      }
      const batch = result.data.content ?? []
      collected.push(...batch)
      if (paginatedIsLastPage(result.data, page)) break
      page += 1
    }
  }

  return collected
}

const fetchAllRelationsByNotationId = async (notationId: string): Promise<RelationResponse[]> => {
  const collected: RelationResponse[] = []
  let page = 0

  while (true) {
    const query = new URLSearchParams({
      notationId,
      page: String(page),
      size: String(RELATIONS_FETCH_SIZE),
    })
    const result = await apiGet<PaginatedResponse<RelationResponse>>(
      `/relations?${query.toString()}`
    )
    if (!result.success) {
      throw new Error(`Ошибка загрузки relations: ${result.error.message}`)
    }
    const batch = result.data.content ?? []
    collected.push(...batch)
    if (paginatedIsLastPage(result.data, page)) break
    page += 1
  }

  return collected
}

function formatSaveEntityError(
  action: 'создания' | 'обновления' | 'удаления',
  entity: string,
  status: number,
  message: string
): string {
  if (status === 401 || status === 403) {
    return 'Недостаточно прав для редактирования модели. Войдите заново или обратитесь к администратору.'
  }
  return `Ошибка ${action} ${entity}: ${message}`
}

async function saveModelMetadata(
  model: ModelData,
  modelCatalog: ModelData[]
): Promise<{ data: ModelData }> {
  const request: ModelUpdateRequest = {
    name: model.name,
    version: model.version,
    ownerId: model.ownerId,
    attrs: model.attrs ?? null,
  }
  const result = await apiPut<ModelData>(`/models/${model.id}`, request)
  if (!result.success) {
    if (result.error.status === 409) {
      throw new Error('Модель с таким именем и версией уже существует.')
    }
    throw new Error(`Ошибка обновления модели: ${result.error.message}`)
  }
  const idx = modelCatalog.findIndex(item => item.id === result.data.id)
  if (idx >= 0) modelCatalog[idx] = result.data
  return { data: result.data }
}

async function saveNodes(
  nodes: EditorNode[],
  modelId: string,
  ownerId: string,
  onProgress: (msg: string) => void
): Promise<Map<string, string>> {
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
      onProgress(`Создание узла: ${node.name}`)
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
      const createdU = result.data.updatedAt
      if (typeof createdU === 'string' && createdU.length > 0) node.updatedAt = createdU
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
    onProgress(`Обновление узла: ${node.name}`)
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
    const nodeU = result.data.updatedAt
    if (typeof nodeU === 'string' && nodeU.length > 0) node.updatedAt = nodeU
  }

  for (const node of nodes.filter(row => row._isDeleted && !row._isNew)) {
    onProgress(`Удаление узла: ${node.name}`)
    const result = await apiDelete<void>(`/nodes/${node.id}`)
    if (!result.success) {
      throw new Error(
        formatSaveEntityError('удаления', 'узла', result.error.status, result.error.message)
      )
    }
  }

  return newNodeIdMap
}

function remapNodeIds(
  newNodeIdMap: Map<string, string>,
  links: EditorLink[],
  diagrams: EditorDiagram[]
): void {
  if (newNodeIdMap.size === 0) return
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

async function saveLinks(
  links: EditorLink[],
  diagrams: EditorDiagram[],
  modelId: string,
  ownerId: string,
  onProgress: (msg: string) => void
): Promise<void> {
  for (const link of links.filter(row => row._isDeleted && !row._isNew)) {
    onProgress('Удаление связи')
    const result = await apiDelete<void>(`/links/${link.id}`)
    if (!result.success) throw new Error(`Ошибка удаления связи: ${result.error.message}`)
  }

  for (const link of links.filter(row => row._isNew && !row._isDeleted)) {
    onProgress('Создание связи')
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
    const linkCreatedU = result.data.updatedAt
    if (typeof linkCreatedU === 'string' && linkCreatedU.length > 0) link.updatedAt = linkCreatedU
    for (const diagram of diagrams) {
      for (const edge of diagram.parsedAttrs.instances.edges) {
        if (edge.modelLinkId === oldId) edge.modelLinkId = result.data.id
      }
    }
  }

  for (const link of links.filter(row => row._isDirty && !row._isDeleted && !row._isNew)) {
    onProgress('Обновление связи')
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
    const linkU = result.data.updatedAt
    if (typeof linkU === 'string' && linkU.length > 0) link.updatedAt = linkU
  }
}

async function saveDiagrams(
  diagrams: EditorDiagram[],
  ownerId: string,
  modelId: string,
  onProgress: (msg: string) => void
): Promise<void> {
  for (const diagram of diagrams.filter(row => row._isDeleted && !row._isNew)) {
    onProgress(`Удаление диаграммы: ${diagram.name}`)
    const result = await apiDelete<void>(`/diagrams/${diagram.id}`)
    if (!result.success) throw new Error(`Ошибка удаления диаграммы: ${result.error.message}`)
  }

  for (const diagram of diagrams.filter(row => row._isNew && !row._isDeleted)) {
    onProgress(`Создание диаграммы: ${diagram.name}`)
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
    const dCreatedU = result.data.updatedAt
    if (typeof dCreatedU === 'string' && dCreatedU.length > 0) diagram.updatedAt = dCreatedU
  }

  const dirtyDiagrams = diagrams
    .filter(row => row._isDirty && !row._isDeleted && !row._isNew)
    .sort((a, b) => compareVersions(b.version, a.version))
  for (const diagram of dirtyDiagrams) {
    onProgress(`Обновление диаграммы: ${diagram.name}`)
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
    const dU = result.data.updatedAt
    if (typeof dU === 'string' && dU.length > 0) diagram.updatedAt = dU
  }
}

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
  const pendingForceBatch = ref(false)
  const batchSaveConflict = ref<BatchConflictItem[] | null>(null)
  const modelDirty = ref(false)
  const modelInitialName = ref('')
  const modelCatalog = ref<ModelData[]>([])
  let saveSuccessTimer: ReturnType<typeof setTimeout> | null = null
  let saveErrorTimer: ReturnType<typeof setTimeout> | null = null
  const loadedRelationRuleNotationIds = new Set<string>()
  const loadingRelationRuleNotationCounts = ref<Record<string, number>>({})
  const relationRuleLoadsByNotation = new Map<string, Promise<void>>()

  const incrementRelationRuleLoading = (notationId: string): void => {
    const next = { ...loadingRelationRuleNotationCounts.value }
    next[notationId] = (next[notationId] ?? 0) + 1
    loadingRelationRuleNotationCounts.value = next
  }

  const decrementRelationRuleLoading = (notationId: string): void => {
    const next = { ...loadingRelationRuleNotationCounts.value }
    const current = next[notationId] ?? 0
    if (current <= 1) {
      delete next[notationId]
    } else {
      next[notationId] = current - 1
    }
    loadingRelationRuleNotationCounts.value = next
  }

  const isNotationRelationsAndRulesLoading = (notationId: string | null | undefined): boolean => {
    if (!notationId) return false
    return (loadingRelationRuleNotationCounts.value[notationId] ?? 0) > 0
  }

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
        componentsResult,
        relationsResult,
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
        apiGet<PaginatedResponse<ComponentResponse>>(`/components?${listQuery.toString()}`),
        apiGet<PaginatedResponse<RelationResponse>>(`/relations?${listQuery.toString()}`),
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
      const diagrams = diagramsResult.success ? (diagramsResult.data.content ?? []).map(toEditorDiagram) : []
      const notationIds = Array.from(
        new Set(diagrams.map(diagram => diagram.notationId).filter(Boolean))
      )

      const typesQuery = new URLSearchParams({ size: '1000' })
      typesQuery.set('modelId', modelId)
      for (const nid of notationIds) {
        typesQuery.append('notationId', nid)
      }

      const [nodeTypesResult, linkTypesResult, relationRules] = await Promise.all([
        apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${typesQuery.toString()}`),
        apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${typesQuery.toString()}`),
        fetchAllRelationRulesByNotationIds(notationIds, { includeAttrs: false }),
      ])
      loadedRelationRuleNotationIds.clear()
      for (const notationId of notationIds) {
        loadedRelationRuleNotationIds.add(notationId)
      }
      state.value = {
        modelId,
        ownerId: modelResult.data.ownerId,
        nodes: nodesResult.success ? (nodesResult.data.content ?? []).map(toEditorNode) : [],
        links: linksResult.success ? (linksResult.data.content ?? []).map(toEditorLink) : [],
        diagrams,
        notations: notationsResult.success ? (notationsResult.data.content ?? []) : [],
        nodeTypes: nodeTypesResult.success ? (nodeTypesResult.data.content ?? []) : [],
        linkTypes: linkTypesResult.success ? (linkTypesResult.data.content ?? []) : [],
        components: componentsResult.success ? (componentsResult.data.content ?? []) : [],
        relations: relationsResult.success ? (relationsResult.data.content ?? []) : [],
        relationRules,
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

  const scheduleSaveErrorClear = (): void => {
    if (saveErrorTimer) clearTimeout(saveErrorTimer)
    saveErrorTimer = setTimeout(() => {
      saveError.value = null
      saveErrorTimer = null
    }, 5000)
  }

  const saveChanges = async (): Promise<boolean> => {
    if (!model.value) return false
    if (isSaving.value) return false
    isSaving.value = true
    saveError.value = null
    saveSuccess.value = false
    saveProgress.value = ''
    batchSaveConflict.value = null

    try {
      const { ownerId, modelId, nodes, links, diagrams } = state.value
      const onProgress = (msg: string) => { saveProgress.value = msg }

      if (model.value && modelDirty.value) {
        onProgress(`Обновление модели: ${model.value.name}`)
        const { data } = await saveModelMetadata(model.value, modelCatalog.value)
        model.value = data
        modelInitialName.value = data.name
        modelDirty.value = false
      }

      let usedBatch = false
      const forceBatch = pendingForceBatch.value
      pendingForceBatch.value = false

      applyDiagramGarbageSanitizeToState(state.value)

      const batchRequest = buildBatchSaveRequest(nodes, links, diagrams, { force: forceBatch })
      if (hasBatchChanges(batchRequest)) {
        const batchResult = await batchSave(modelId, batchRequest)
        if (batchResult.success) {
          if (!isValidBatchResponse(batchResult.data)) {
            saveError.value = 'Некорректный ответ сервера при пакетном сохранении.'
            scheduleSaveErrorClear()
            return false
          }
          applyBatchRemapping(batchResult.data, nodes, links, diagrams, batchRequest)
          await refreshBatchSavedEntityTimestamps(
            { nodes, links, diagrams },
            batchRequest,
            batchResult.data
          )
          usedBatch = true
        } else if (batchResult.error.status === 409) {
          const conflicts = parseBatchSaveConflictDetails(batchResult.error.details)
          if (conflicts && conflicts.length > 0) {
            batchSaveConflict.value = conflicts
            return false
          }
          saveError.value =
            batchResult.error.message || 'Конфликт версий при сохранении (данные изменены на сервере).'
          scheduleSaveErrorClear()
          return false
        } else {
          saveError.value = batchResult.error.message
          scheduleSaveErrorClear()
          return false
        }
      }

      if (!usedBatch) {
        const newNodeIdMap = await saveNodes(nodes, modelId, ownerId, onProgress)
        remapNodeIds(newNodeIdMap, links, diagrams)
        await saveLinks(links, diagrams, modelId, ownerId, onProgress)
        await saveDiagrams(diagrams, ownerId, modelId, onProgress)
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
      scheduleSaveErrorClear()
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

  const ensureNotationRelationsAndRules = async (
    notationId: string,
    options?: { force?: boolean }
  ): Promise<void> => {
    if (!notationId) return
    const force = options?.force === true
    if (!force && loadedRelationRuleNotationIds.has(notationId)) return
    const existingLoad = relationRuleLoadsByNotation.get(notationId)
    if (existingLoad) {
      await existingLoad
      if (!force) return
    }

    incrementRelationRuleLoading(notationId)
    const loadPromise = (async () => {
      const [relations, rules] = await Promise.all([
        fetchAllRelationsByNotationId(notationId),
        fetchAllRelationRulesByNotationIds([notationId], { includeAttrs: false }),
      ])

      const previousRelationIds = new Set(
        state.value.relations.filter(relation => relation.notationId === notationId).map(relation => relation.id)
      )
      for (const relation of relations) {
        previousRelationIds.add(relation.id)
      }

      state.value.relations = [
        ...state.value.relations.filter(relation => relation.notationId !== notationId),
        ...relations,
      ]

      state.value.relationRules = [
        ...state.value.relationRules.filter(rule => !previousRelationIds.has(rule.relationId)),
        ...rules,
      ]

      loadedRelationRuleNotationIds.add(notationId)
    })()
      .finally(() => {
        relationRuleLoadsByNotation.delete(notationId)
        decrementRelationRuleLoading(notationId)
      })
    relationRuleLoadsByNotation.set(notationId, loadPromise)
    await loadPromise
  }

  const resolveBatchSaveReload = async (): Promise<void> => {
    const conflicts = batchSaveConflict.value ? [...batchSaveConflict.value] : []
    batchSaveConflict.value = null

    const diagramBeforeReload = new Map<
      string,
      { localAttrs: EditorDiagram['parsedAttrs']; serverAttrs: DiagramAttrs }
    >()

    const diagramConflicts = conflicts.filter(c => c.kind === 'diagram')
    await Promise.all(
      diagramConflicts.map(async c => {
        const d = state.value.diagrams.find(item => item.id === c.id)
        if (!d) return
        const enc = encodeURIComponent(c.id)
        const r = await apiGet<DiagramResponse>(`/diagrams/${enc}`)
        if (!r.success) return
        diagramBeforeReload.set(c.id, {
          localAttrs: clonePlainDeep(d.parsedAttrs),
          serverAttrs: parseDiagramAttrs(r.data.attrs ?? null),
        })
      })
    )

    await loadModel()

    if (errorMessage.value || conflicts.length === 0) return

    for (const c of conflicts) {
      if (c.kind !== 'diagram') continue
      const snap = diagramBeforeReload.get(c.id)
      const d = state.value.diagrams.find(item => item.id === c.id)
      if (!snap || !d) continue
      d.parsedAttrs = mergeDiagramAttrsAfterBatchConflictReload(
        snap.localAttrs,
        snap.serverAttrs,
        d.parsedAttrs
      )
      d._isDirty = true
    }
  }

  const resolveBatchSaveOverwrite = async (): Promise<boolean> => {
    batchSaveConflict.value = null
    pendingForceBatch.value = true
    return saveChanges()
  }

  const dismissBatchSaveConflict = (): void => {
    batchSaveConflict.value = null
  }

  return {
    model,
    state,
    isLoading,
    errorMessage,
    modelDirty,
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
    ensureNotationRelationsAndRules,
    isNotationRelationsAndRulesLoading,
    batchSaveConflict,
    resolveBatchSaveReload,
    resolveBatchSaveOverwrite,
    dismissBatchSaveConflict,
  }
}
