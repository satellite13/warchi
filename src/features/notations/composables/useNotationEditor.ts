import { ref, computed, watch, onScopeDispose, type Ref, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiGet, apiPost, apiPut, apiDelete } from '../../../composables/useApi'
import type { NotationData, PaginatedResponse } from '../../../types/entities'
import type {
  NodeTypeResponse,
  NodeTypeRequest,
  LinkTypeResponse,
  LinkTypeRequest,
  ComponentResponse,
  ComponentRequest,
  RelationResponse,
  RelationRequest,
  RelationRuleResponse,
  RelationRuleRequest,
} from '../../../types/api'
import { paginatedIsLastPage } from '../../../utils/paginatedResponse'
import {
  createId,
  parseEntityAttrs,
  serializeEntityAttrs,
  parseTypeAttrs,
  serializeTypeAttrs,
} from '../notationAttrs'
import {
  type NotationEditorState,
  type EditorNodeType,
  type EditorLinkType,
  type EditorComponent,
  type EditorRelation,
  type EditorRelationRule,
  type EditorDiagramLayer,
  createEmptyEditorState,
} from '../types'
import { syncRelationRulesViaApi } from './useRelationRulesSync'
import { parseNotationAttrs, mergeNotationAttrs } from '../utils/notationAttrsJson'

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

function normalizeDiagramLayer(value: unknown): EditorDiagramLayer {
  const fallback: EditorDiagramLayer = { version: 1, nodes: [], edges: [] }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const record = value as Record<string, unknown>
  const nodes = Array.isArray(record.nodes)
    ? record.nodes.filter((n): n is EditorDiagramLayer['nodes'][number] => {
        if (!n || typeof n !== 'object' || Array.isArray(n)) return false
        const item = n as Record<string, unknown>
        return (
          typeof item.id === 'string' &&
          typeof item.x === 'number' &&
          typeof item.y === 'number' &&
          typeof item.width === 'number' &&
          typeof item.height === 'number'
        )
      })
    : []
  const edges = Array.isArray(record.edges)
    ? record.edges.filter((e): e is EditorDiagramLayer['edges'][number] => {
        if (!e || typeof e !== 'object' || Array.isArray(e)) return false
        const item = e as Record<string, unknown>
        return (
          typeof item.id === 'string' &&
          typeof item.sourceNodeId === 'string' &&
          typeof item.targetNodeId === 'string'
        )
      })
    : []
  return {
    version: 1,
    nodes,
    edges,
  }
}

function toEditorNodeType(response: NodeTypeResponse): EditorNodeType {
  return {
    id: response.id,
    name: response.name,
    ownerId: response.ownerId,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    parsedAttrs: parseTypeAttrs(response.attrs ?? null),
  }
}

function toEditorLinkType(response: LinkTypeResponse): EditorLinkType {
  return {
    id: response.id,
    name: response.name,
    ownerId: response.ownerId,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    parsedAttrs: parseTypeAttrs(response.attrs ?? null),
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
    parsedAttrs: parseEntityAttrs(response.attrs ?? null),
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
    parsedAttrs: parseEntityAttrs(response.attrs ?? null),
  }
}

function toEditorRelationRules(
  rows: RelationRuleResponse[],
  allowedComponentIds: Set<string>
): EditorRelationRule[] {
  const grouped = new Map<string, EditorRelationRule>()
  for (const row of rows) {
    if (
      !allowedComponentIds.has(row.fromComponentId) ||
      !allowedComponentIds.has(row.toComponentId)
    ) {
      continue
    }
    const key = `${row.fromComponentId}::${row.toComponentId}`
    const existing = grouped.get(key)
    if (existing) {
      if (!existing.allowedRelationIds.includes(row.relationId)) {
        existing.allowedRelationIds.push(row.relationId)
      }
      continue
    }
    grouped.set(key, {
      id: createId(),
      fromComponentId: row.fromComponentId,
      toComponentId: row.toComponentId,
      allowedRelationIds: [row.relationId],
    })
  }
  return Array.from(grouped.values())
}

function normalizeTypeName(name: string): string {
  return name.trim().toLowerCase()
}

const RELATION_RULES_FETCH_SIZE = 5000

function buildRelationRuleKey(
  fromComponentId: string,
  toComponentId: string,
  relationId: string
): string {
  return `${fromComponentId}::${toComponentId}::${relationId}`
}

async function runTasksWithConcurrencyLimit(
  tasks: Array<() => Promise<void>>,
  concurrencyLimit: number
): Promise<void> {
  if (tasks.length === 0) return
  const limit = Math.max(1, concurrencyLimit)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      await tasks[currentIndex]()
    }
  })

  await Promise.all(workers)
}

const fetchAllRelationRulesByNotation = async (
  notationId: string
): Promise<RelationRuleResponse[]> => {
  const collected: RelationRuleResponse[] = []
  let page = 0

  // Backend returns paginated relation-rules; load all pages to avoid hidden rules.
  while (true) {
    const query = new URLSearchParams({
      notationId,
      page: String(page),
      size: String(RELATION_RULES_FETCH_SIZE),
      includeAttrs: 'true',
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

  return collected
}

function formatNotationEntityError(
  action: 'создания' | 'обновления' | 'удаления',
  entity: string,
  status: number,
  message: string
): string {
  if (status === 401 || status === 403) {
    return 'Недостаточно прав для редактирования нотации. Войдите заново или обратитесь к администратору.'
  }
  return `Ошибка ${action} ${entity}: ${message}`
}

async function resolveNodeTypes(
  nodeTypes: EditorNodeType[],
  components: EditorComponent[],
  typeOwnerId: string,
  onProgress: (msg: string) => void
): Promise<void> {
  const existingNodeTypeQuery = new URLSearchParams({ size: '1000' })
  const existingNodeTypesResult = await apiGet<PaginatedResponse<NodeTypeResponse>>(
    `/node-types?${existingNodeTypeQuery.toString()}`
  )
  if (!existingNodeTypesResult.success) {
    throw new Error(`Ошибка загрузки типов узлов: ${existingNodeTypesResult.error.message}`)
  }
  const existingNodeTypesByName = new Map<string, NodeTypeResponse>()
  for (const existing of existingNodeTypesResult.data.content ?? []) {
    const key = normalizeTypeName(existing.name)
    if (!key || existingNodeTypesByName.has(key)) continue
    existingNodeTypesByName.set(key, existing)
  }
  const resolvedNodeTypeIdByName = new Map<string, string>()

  const newNodeTypes = nodeTypes.filter(t => t._isNew)
  for (const nodeType of newNodeTypes) {
    const oldId = nodeType.id
    const normalizedName = normalizeTypeName(nodeType.name)

    const resolvedExistingId = normalizedName
      ? resolvedNodeTypeIdByName.get(normalizedName)
      : undefined
    if (resolvedExistingId) {
      nodeType.id = resolvedExistingId
      nodeType._isNew = false
      components.forEach(c => {
        if (c.nodeTypeId === oldId) c.nodeTypeId = resolvedExistingId
      })
      continue
    }

    const existingType = normalizedName
      ? existingNodeTypesByName.get(normalizedName)
      : undefined
    if (existingType) {
      nodeType.id = existingType.id
      nodeType.parsedAttrs = parseTypeAttrs(existingType.attrs ?? null)
      nodeType._isNew = false
      if (normalizedName) resolvedNodeTypeIdByName.set(normalizedName, existingType.id)
      components.forEach(c => {
        if (c.nodeTypeId === oldId) c.nodeTypeId = existingType.id
      })
      continue
    }

    onProgress(`Создание типа узла: ${nodeType.name}`)
    const request: NodeTypeRequest = {
      name: nodeType.name,
      ownerId: typeOwnerId,
      attrs: serializeTypeAttrs(nodeType.parsedAttrs),
    }
    const result = await apiPost<NodeTypeResponse>('/node-types', request)
    if (!result.success) {
      throw new Error(
        formatNotationEntityError('создания', 'типа узла', result.error.status, result.error.message)
      )
    }
    nodeType.id = result.data.id
    nodeType._isNew = false
    if (normalizedName) resolvedNodeTypeIdByName.set(normalizedName, result.data.id)
    components.forEach(c => {
      if (c.nodeTypeId === oldId) c.nodeTypeId = result.data.id
    })
  }
}

async function resolveLinkTypes(
  linkTypes: EditorLinkType[],
  relations: EditorRelation[],
  typeOwnerId: string,
  onProgress: (msg: string) => void
): Promise<void> {
  const existingLinkTypeQuery = new URLSearchParams({ size: '1000' })
  const existingLinkTypesResult = await apiGet<PaginatedResponse<LinkTypeResponse>>(
    `/link-types?${existingLinkTypeQuery.toString()}`
  )
  if (!existingLinkTypesResult.success) {
    throw new Error(`Ошибка загрузки типов связей: ${existingLinkTypesResult.error.message}`)
  }
  const existingLinkTypesByName = new Map<string, LinkTypeResponse>()
  for (const existing of existingLinkTypesResult.data.content ?? []) {
    const key = normalizeTypeName(existing.name)
    if (!key || existingLinkTypesByName.has(key)) continue
    existingLinkTypesByName.set(key, existing)
  }
  const resolvedLinkTypeIdByName = new Map<string, string>()

  const newLinkTypes = linkTypes.filter(t => t._isNew)
  for (const linkType of newLinkTypes) {
    const oldId = linkType.id
    const normalizedName = normalizeTypeName(linkType.name)

    const resolvedExistingId = normalizedName
      ? resolvedLinkTypeIdByName.get(normalizedName)
      : undefined
    if (resolvedExistingId) {
      linkType.id = resolvedExistingId
      linkType._isNew = false
      relations.forEach(r => {
        if (r.linkTypeId === oldId) r.linkTypeId = resolvedExistingId
      })
      continue
    }

    const existingType = normalizedName
      ? existingLinkTypesByName.get(normalizedName)
      : undefined
    if (existingType) {
      linkType.id = existingType.id
      linkType.parsedAttrs = parseTypeAttrs(existingType.attrs ?? null)
      linkType._isNew = false
      if (normalizedName) resolvedLinkTypeIdByName.set(normalizedName, existingType.id)
      relations.forEach(r => {
        if (r.linkTypeId === oldId) r.linkTypeId = existingType.id
      })
      continue
    }

    onProgress(`Создание типа связи: ${linkType.name}`)
    const request: LinkTypeRequest = {
      name: linkType.name,
      ownerId: typeOwnerId,
      attrs: serializeTypeAttrs(linkType.parsedAttrs),
    }
    const result = await apiPost<LinkTypeResponse>('/link-types', request)
    if (!result.success) {
      throw new Error(
        formatNotationEntityError('создания', 'типа связи', result.error.status, result.error.message)
      )
    }
    linkType.id = result.data.id
    linkType._isNew = false
    if (normalizedName) resolvedLinkTypeIdByName.set(normalizedName, result.data.id)
    relations.forEach(r => {
      if (r.linkTypeId === oldId) r.linkTypeId = result.data.id
    })
  }
}

async function saveComponents(
  components: EditorComponent[],
  relationRules: EditorRelationRule[],
  notationId: string,
  ownerId: string,
  onProgress: (msg: string) => void
): Promise<void> {
  for (const component of components.filter(c => c._isDeleted && !c._isNew)) {
    onProgress(`Удаление компонента: ${component.name}`)
    const result = await apiDelete<void>(`/components/${component.id}`)
    if (!result.success) {
      throw new Error(
        formatNotationEntityError('удаления', 'компонента', result.error.status, result.error.message)
      )
    }
  }

  for (const component of components.filter(c => c._isNew && !c._isDeleted)) {
    onProgress(`Создание компонента: ${component.name}`)
    const request: ComponentRequest = {
      name: component.name,
      version: component.version,
      notationId,
      ownerId,
      nodeTypeId: component.nodeTypeId,
      attrs: serializeEntityAttrs(component.parsedAttrs),
    }
    const result = await apiPost<ComponentResponse>('/components', request)
    if (!result.success) {
      throw new Error(
        formatNotationEntityError('создания', 'компонента', result.error.status, result.error.message)
      )
    }
    const oldComponentId = component.id
    component.id = result.data.id
    component._isNew = false
    for (const rule of relationRules) {
      if (rule.fromComponentId === oldComponentId) {
        rule.fromComponentId = component.id
        rule._isDirty = true
      }
      if (rule.toComponentId === oldComponentId) {
        rule.toComponentId = component.id
        rule._isDirty = true
      }
    }
  }

  for (const component of components.filter(c => c._isDirty && !c._isNew && !c._isDeleted)) {
    onProgress(`Обновление компонента: ${component.name}`)
    const request: ComponentRequest = {
      name: component.name,
      version: component.version,
      notationId,
      ownerId,
      nodeTypeId: component.nodeTypeId,
      attrs: serializeEntityAttrs(component.parsedAttrs),
    }
    const result = await apiPut<ComponentResponse>(`/components/${component.id}`, request)
    if (!result.success) {
      throw new Error(
        formatNotationEntityError('обновления', 'компонента', result.error.status, result.error.message)
      )
    }
    component._isDirty = false
  }
}

async function saveRelations(
  relations: EditorRelation[],
  relationRules: EditorRelationRule[],
  notationId: string,
  ownerId: string,
  onProgress: (msg: string) => void
): Promise<void> {
  for (const relation of relations.filter(r => r._isDeleted && !r._isNew)) {
    onProgress(`Удаление отношения: ${relation.name}`)
    const result = await apiDelete<void>(`/relations/${relation.id}`)
    if (!result.success) {
      throw new Error(`Ошибка удаления отношения: ${result.error.message}`)
    }
  }

  for (const relation of relations.filter(r => r._isNew && !r._isDeleted)) {
    onProgress(`Создание отношения: ${relation.name}`)
    const oldRelationId = relation.id
    const request: RelationRequest = {
      name: relation.name,
      version: relation.version,
      notationId,
      ownerId,
      linkTypeId: relation.linkTypeId,
      attrs: serializeEntityAttrs(relation.parsedAttrs),
    }
    const result = await apiPost<RelationResponse>('/relations', request)
    if (!result.success) {
      throw new Error(`Ошибка создания отношения: ${result.error.message}`)
    }
    relation.id = result.data.id
    relation._isNew = false
    for (const rule of relationRules) {
      if (!rule.allowedRelationIds.includes(oldRelationId)) continue
      rule.allowedRelationIds = rule.allowedRelationIds.map(relationId =>
        relationId === oldRelationId ? relation.id : relationId
      )
      rule._isDirty = true
    }
  }

  for (const relation of relations.filter(r => r._isDirty && !r._isNew && !r._isDeleted)) {
    onProgress(`Обновление отношения: ${relation.name}`)
    const request: RelationRequest = {
      name: relation.name,
      version: relation.version,
      notationId,
      ownerId,
      linkTypeId: relation.linkTypeId,
      attrs: serializeEntityAttrs(relation.parsedAttrs),
    }
    const result = await apiPut<RelationResponse>(`/relations/${relation.id}`, request)
    if (!result.success) {
      throw new Error(`Ошибка обновления отношения: ${result.error.message}`)
    }
    relation._isDirty = false
  }
}

async function syncRelationRules(
  components: EditorComponent[],
  relations: EditorRelation[],
  relationRules: EditorRelationRule[],
  notationId: string,
  ownerId: string,
  onProgress: (msg: string) => void
): Promise<EditorRelationRule[]> {
  onProgress('Синхронизация правил связей')
  const currentComponentIds = new Set(
    components.filter(component => !component._isDeleted).map(component => component.id)
  )
  const activeRelationIds = new Set(
    relations.filter(relation => !relation._isDeleted).map(relation => relation.id)
  )
  const activeRules = relationRules.filter(
    rule =>
      !rule._isDeleted &&
      currentComponentIds.has(rule.fromComponentId) &&
      currentComponentIds.has(rule.toComponentId)
  )

  const syncResult = await syncRelationRulesViaApi(
    notationId,
    relationRules,
    currentComponentIds,
    activeRelationIds
  )
  if (syncResult) {
    for (const rule of activeRules) {
      rule.allowedRelationIds = Array.from(new Set(rule.allowedRelationIds)).filter(id =>
        activeRelationIds.has(id)
      )
      rule._isNew = false
      rule._isDirty = false
    }
    return activeRules
  }

  const REQUEST_CONCURRENCY = 8
  const existingRules = (await fetchAllRelationRulesByNotation(notationId)).filter(
    rule =>
      currentComponentIds.has(rule.fromComponentId) &&
      currentComponentIds.has(rule.toComponentId)
  )
  const desiredKeys = new Set<string>()
  const existingRuleIdsByKey = new Map<string, string[]>()

  for (const existingRule of existingRules) {
    const key = buildRelationRuleKey(
      existingRule.fromComponentId,
      existingRule.toComponentId,
      existingRule.relationId
    )
    const existingIds = existingRuleIdsByKey.get(key)
    if (existingIds) {
      existingIds.push(existingRule.id)
    } else {
      existingRuleIdsByKey.set(key, [existingRule.id])
    }
  }

  const createRequests: RelationRuleRequest[] = []
  for (const rule of activeRules) {
    const uniqueRelationIds = Array.from(new Set(rule.allowedRelationIds)).filter(relationId =>
      activeRelationIds.has(relationId)
    )
    for (const relationId of uniqueRelationIds) {
      const key = buildRelationRuleKey(rule.fromComponentId, rule.toComponentId, relationId)
      desiredKeys.add(key)

      const existingIds = existingRuleIdsByKey.get(key)
      if (existingIds && existingIds.length > 0) {
        // Keep one matching row, remove potential duplicates later.
        existingIds.pop()
        continue
      }

      createRequests.push({
        relationId,
        fromComponentId: rule.fromComponentId,
        toComponentId: rule.toComponentId,
        ownerId,
      })
    }

    rule.allowedRelationIds = uniqueRelationIds
    rule._isNew = false
    rule._isDirty = false
  }

  const deleteIds: string[] = []
  for (const [key, ids] of existingRuleIdsByKey.entries()) {
    if (!desiredKeys.has(key)) {
      deleteIds.push(...ids)
      continue
    }
    if (ids.length > 0) {
      deleteIds.push(...ids)
    }
  }

  await runTasksWithConcurrencyLimit(
    deleteIds.map(ruleId => async () => {
      const deleteResult = await apiDelete<void>(`/relation-rules/${ruleId}`)
      if (!deleteResult.success) {
        throw new Error(`Ошибка удаления правила связи: ${deleteResult.error.message}`)
      }
    }),
    REQUEST_CONCURRENCY
  )

  await runTasksWithConcurrencyLimit(
    createRequests.map(request => async () => {
      const createResult = await apiPost<RelationRuleResponse>('/relation-rules', request)
      if (!createResult.success) {
        // Rule may already exist (parallel save or stale local cache); treat conflict as idempotent success.
        if (createResult.error.status === 409) {
          return
        }
        throw new Error(`Ошибка создания правила связи: ${createResult.error.message}`)
      }
    }),
    REQUEST_CONCURRENCY
  )

  return activeRules
}

export function useNotationEditor(): NotationEditorReturn {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()

  const notation = ref<NotationData | null>(null)
  const notationAttrsSnapshot = ref<string | null>(null)
  const state = ref<NotationEditorState>(createEmptyEditorState())

  const isLoading = ref(true)
  const errorMessage = ref<string | null>(null)
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)
  const saveSuccess = ref(false)
  const saveProgress = ref('')
  let saveSuccessTimer: ReturnType<typeof setTimeout> | null = null

  onScopeDispose(() => {
    if (saveSuccessTimer !== null) {
      clearTimeout(saveSuccessTimer)
      saveSuccessTimer = null
    }
  })

  const notationAttrsDirty = computed(() => {
    const currentAttrs = notation.value?.attrs ?? null
    return currentAttrs !== notationAttrsSnapshot.value
  })

  const hasUnsavedChanges = computed(() => {
    const { nodeTypes, linkTypes, components, relations, relationRules } = state.value
    const hasNewTypes =
      nodeTypes.some(t => t._isNew === true) || linkTypes.some(t => t._isNew === true)
    const hasChangedComponents = components.some(
      c => c._isNew === true || c._isDirty === true || c._isDeleted === true
    )
    const hasChangedRelations = relations.some(
      r => r._isNew === true || r._isDirty === true || r._isDeleted === true
    )
    const hasChangedRelationRules = relationRules.some(
      rule => rule._isNew === true || rule._isDirty === true || rule._isDeleted === true
    )
    return (
      hasNewTypes ||
      hasChangedComponents ||
      hasChangedRelations ||
      hasChangedRelationRules ||
      notationAttrsDirty.value
    )
  })

  watch(
    () => state.value.diagramLayer,
    (layer) => {
      if (!notation.value || isLoading.value) return
      notation.value.attrs = mergeNotationAttrs(notation.value.attrs ?? null, {
        editorDiagramLayer: layer,
      })
    },
    { deep: true }
  )

  const loadNotation = async () => {
    const notationId = route.params.id
    if (!notationId || typeof notationId !== 'string') {
      errorMessage.value = 'Не удалось определить нотацию.'
      isLoading.value = false
      return
    }

    isLoading.value = true
    errorMessage.value = null

    try {
      const listQuery = new URLSearchParams({ size: '1000' })
      const listQueryWithNotation = new URLSearchParams({
        size: '1000',
        notationId,
      })

      // Parallel fetch from 6 endpoints
      const [notationResult, nodeTypesResult, linkTypesResult, componentsResult, relationsResult] =
        await Promise.all([
          apiGet<NotationData>(`/notations/${notationId}`),
          apiGet<PaginatedResponse<NodeTypeResponse>>(
            `/node-types?${listQueryWithNotation.toString()}`
          ),
          apiGet<PaginatedResponse<LinkTypeResponse>>(
            `/link-types?${listQueryWithNotation.toString()}`
          ),
          apiGet<PaginatedResponse<ComponentResponse>>(
            `/components?notationId=${encodeURIComponent(notationId)}&${listQuery.toString()}`
          ),
          apiGet<PaginatedResponse<RelationResponse>>(
            `/relations?notationId=${encodeURIComponent(notationId)}&${listQuery.toString()}`
          ),
        ])

      if (!notationResult.success) {
        if (notationResult.error.status === 404) {
          throw new Error('Нотация не найдена')
        }
        if (notationResult.error.status === 403) {
          throw new Error('Доступ к нотации отозван или отсутствует.')
        }
        throw new Error(notationResult.error.message)
      }

      notation.value = notationResult.data
      notationAttrsSnapshot.value = notationResult.data.attrs ?? null

      const components = componentsResult.success
        ? (componentsResult.data.content ?? []).map(toEditorComponent)
        : []
      const componentIds = new Set(components.map(component => component.id))

      const relationRules = await fetchAllRelationRulesByNotation(notationId)

      state.value = {
        notationId,
        ownerId: notationResult.data.ownerId,
        nodeTypes: nodeTypesResult.success
          ? (nodeTypesResult.data.content ?? []).map(toEditorNodeType)
          : [],
        linkTypes: linkTypesResult.success
          ? (linkTypesResult.data.content ?? []).map(toEditorLinkType)
          : [],
        components,
        relations: relationsResult.success
          ? (relationsResult.data.content ?? []).map(toEditorRelation)
          : [],
        relationRules: toEditorRelationRules(relationRules, componentIds),
        diagramLayer: normalizeDiagramLayer(parseNotationAttrs(notationResult.data.attrs ?? null).editorDiagramLayer),
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Не удалось загрузить нотацию.'
    } finally {
      isLoading.value = false
    }
  }

  const saveChanges = async (hasValidationErrors: boolean): Promise<boolean> => {
    if (!notation.value) {
      return false
    }

    if (hasValidationErrors) {
      saveError.value = t('notations.saveErrorValidation')
      return false
    }

    isSaving.value = true
    saveError.value = null
    saveSuccess.value = false
    saveProgress.value = ''

    try {
      const { notationId, ownerId, nodeTypes, linkTypes, components, relations, relationRules } =
        state.value
      const typeOwnerId = ownerId
      const onProgress = (msg: string) => { saveProgress.value = msg }

      if (notationAttrsDirty.value && notation.value) {
        onProgress('Обновление атрибутов нотации')
        const updateResult = await apiPut<NotationData>(`/notations/${notationId}`, {
          attrs: notation.value.attrs,
        })
        if (!updateResult.success) {
          throw new Error(
            formatNotationEntityError(
              'обновления',
              'нотации',
              updateResult.error.status ?? 0,
              updateResult.error.message
            )
          )
        }
        notationAttrsSnapshot.value = notation.value.attrs ?? null
      }

      await resolveNodeTypes(nodeTypes, components, typeOwnerId, onProgress)
      await resolveLinkTypes(linkTypes, relations, typeOwnerId, onProgress)
      await saveComponents(components, relationRules, notationId, ownerId, onProgress)
      await saveRelations(relations, relationRules, notationId, ownerId, onProgress)
      state.value.relationRules = await syncRelationRules(
        components, relations, relationRules, notationId, ownerId, onProgress
      )

      state.value.components = components.filter(c => !c._isDeleted)
      state.value.relations = relations.filter(r => !r._isDeleted)

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
      saveError.value = error instanceof Error ? error.message : t('notations.saveErrorGeneric')
      return false
    } finally {
      isSaving.value = false
      saveProgress.value = ''
    }
  }

  const handleBack = () => {
    router.push({ name: 'notations' })
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
    handleBack,
  }
}
