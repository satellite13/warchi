import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiGet, apiPost, apiPut, apiDelete } from '@/composables/useApi'
import { listParams, pagedListParams } from '@/api/queryHelpers'
import type { NotationData, PaginatedResponse } from '@/types/entities'
import type {
  NodeTypeResponse,
  LinkTypeResponse,
  ComponentResponse,
  ComponentRequest,
  RelationResponse,
  RelationRequest,
  RelationRuleResponse,
  RelationRuleRequest,
} from '@/types/api'
import { useSaveState } from '@/composables/useSaveState'
import { formatEntitySaveError } from '@/utils/formatEntityError'
import { paginatedIsLastPage } from '@/utils/paginatedResponse'
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
import { resolveNewTypes } from '../utils/resolveNewTypes'
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

const UNTYPED_TYPE_NAMES = new Set(['diagram only'])
const isUntypedTypeName = (name: string): boolean => UNTYPED_TYPE_NAMES.has(normalizeTypeName(name))

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
    const query = pagedListParams(page, RELATION_RULES_FETCH_SIZE)
    query.set('notationId', notationId)
    query.set('includeAttrs', 'true')
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
        formatEntitySaveError('нотации','удаления', 'компонента', result.error.status, result.error.message)
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
        formatEntitySaveError('нотации','создания', 'компонента', result.error.status, result.error.message)
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
        formatEntitySaveError('нотации','обновления', 'компонента', result.error.status, result.error.message)
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
  nodeTypes: EditorNodeType[],
  linkTypes: EditorLinkType[],
  components: EditorComponent[],
  relations: EditorRelation[],
  relationRules: EditorRelationRule[],
  notationId: string,
  ownerId: string,
  onProgress: (msg: string) => void
): Promise<EditorRelationRule[]> {
  onProgress('Синхронизация правил связей')
  const untypedNodeTypeIds = new Set(
    nodeTypes.filter(item => isUntypedTypeName(item.name)).map(item => item.id)
  )
  const untypedLinkTypeIds = new Set(
    linkTypes.filter(item => isUntypedTypeName(item.name)).map(item => item.id)
  )
  const untypedComponentIds = new Set(
    components
      .filter(component => !component._isDeleted && untypedNodeTypeIds.has(component.nodeTypeId))
      .map(component => component.id)
  )
  const currentComponentIds = new Set(
    components
      .filter(component => !component._isDeleted && !untypedComponentIds.has(component.id))
      .map(component => component.id)
  )
  const activeRelationIds = new Set(
    relations
      .filter(relation => !relation._isDeleted && !untypedLinkTypeIds.has(relation.linkTypeId))
      .map(relation => relation.id)
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
  const { isSaving, saveError, saveSuccess, saveProgress, startSave, completeSave, failSave, finishSave } = useSaveState()

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
      const listQuery = listParams()
      const listQueryWithNotation = listParams()
      listQueryWithNotation.set('notationId', notationId)

      // Parallel fetch from API endpoints.
      // We load both notation-scoped and global type lists to reuse a single shared
      // "Без типа" type instead of recreating it per notation.
      const [
        notationResult,
        nodeTypesResult,
        linkTypesResult,
        allNodeTypesResult,
        allLinkTypesResult,
        componentsResult,
        relationsResult,
      ] =
        await Promise.all([
          apiGet<NotationData>(`/notations/${notationId}`),
          apiGet<PaginatedResponse<NodeTypeResponse>>(
            `/node-types?${listQueryWithNotation.toString()}`
          ),
          apiGet<PaginatedResponse<LinkTypeResponse>>(
            `/link-types?${listQueryWithNotation.toString()}`
          ),
          apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${listQuery.toString()}`),
          apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${listQuery.toString()}`),
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

      const components = componentsResult.success
        ? (componentsResult.data.content ?? []).map(toEditorComponent)
        : []
      const componentIds = new Set(components.map(component => component.id))

      const relationRules = await fetchAllRelationRulesByNotation(notationId)
      const notationNodeTypes = nodeTypesResult.success
        ? (nodeTypesResult.data.content ?? []).map(toEditorNodeType)
        : []
      const notationLinkTypes = linkTypesResult.success
        ? (linkTypesResult.data.content ?? []).map(toEditorLinkType)
        : []
      const allNodeTypes = allNodeTypesResult.success
        ? (allNodeTypesResult.data.content ?? []).map(toEditorNodeType)
        : []
      const allLinkTypes = allLinkTypesResult.success
        ? (allLinkTypesResult.data.content ?? []).map(toEditorLinkType)
        : []

      const sharedUntypedNodeType = allNodeTypes.find(item => isUntypedTypeName(item.name))
      const sharedUntypedLinkType = allLinkTypes.find(item => isUntypedTypeName(item.name))
      if (
        sharedUntypedNodeType &&
        !notationNodeTypes.some(item => item.id === sharedUntypedNodeType.id)
      ) {
        notationNodeTypes.push(sharedUntypedNodeType)
      }
      if (
        sharedUntypedLinkType &&
        !notationLinkTypes.some(item => item.id === sharedUntypedLinkType.id)
      ) {
        notationLinkTypes.push(sharedUntypedLinkType)
      }

      const diagramLayer = normalizeDiagramLayer(
        parseNotationAttrs(notation.value.attrs ?? null).editorDiagramLayer,
      )
      state.value = {
        notationId,
        ownerId: notationResult.data.ownerId,
        nodeTypes: notationNodeTypes,
        linkTypes: notationLinkTypes,
        components,
        relations: relationsResult.success
          ? (relationsResult.data.content ?? []).map(toEditorRelation)
          : [],
        relationRules: toEditorRelationRules(relationRules, componentIds),
        diagramLayer,
      }

      // Baseline must match what the diagramLayer watcher writes (mergeNotationAttrs + JSON.stringify),
      // otherwise attrs string !== snapshot and the UI shows unsaved changes immediately after load.
      const mergedAttrs = mergeNotationAttrs(notation.value.attrs ?? null, {
        editorDiagramLayer: diagramLayer,
      })
      notation.value.attrs = mergedAttrs
      notationAttrsSnapshot.value = mergedAttrs
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
      failSave(t('notations.saveErrorValidation'))
      return false
    }

    startSave()

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
            formatEntitySaveError('нотации',
              'обновления',
              'нотации',
              updateResult.error.status ?? 0,
              updateResult.error.message
            )
          )
        }
        notationAttrsSnapshot.value = notation.value.attrs ?? null
      }

      await resolveNewTypes({
        types: nodeTypes,
        entities: components,
        typeOwnerId,
        apiEndpoint: '/node-types',
        entityTypeName: 'типа узла',
        getTypeId: (c) => c.nodeTypeId,
        setTypeId: (c, id) => {
          c.nodeTypeId = id
        },
        parseAttrs: parseTypeAttrs,
        serializeAttrs: serializeTypeAttrs,
        onProgress,
      })
      await resolveNewTypes({
        types: linkTypes,
        entities: relations,
        typeOwnerId,
        apiEndpoint: '/link-types',
        entityTypeName: 'типа связи',
        getTypeId: (r) => r.linkTypeId,
        setTypeId: (r, id) => {
          r.linkTypeId = id
        },
        parseAttrs: parseTypeAttrs,
        serializeAttrs: serializeTypeAttrs,
        onProgress,
      })
      await saveComponents(components, relationRules, notationId, ownerId, onProgress)
      await saveRelations(relations, relationRules, notationId, ownerId, onProgress)
      state.value.relationRules = await syncRelationRules(
        nodeTypes,
        linkTypes,
        components, relations, relationRules, notationId, ownerId, onProgress
      )

      state.value.components = components.filter(c => !c._isDeleted)
      state.value.relations = relations.filter(r => !r._isDeleted)

      completeSave()
      return true
    } catch (error) {
      failSave(error instanceof Error ? error.message : t('notations.saveErrorGeneric'))
      return false
    } finally {
      finishSave()
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
