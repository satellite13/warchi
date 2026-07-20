import { apiGet, type ApiResult } from "@/composables/useApi"
import { listParams, PAGE_SIZE_FULL, pagedListParams } from '@/api/queryHelpers'
import type { ModelData, NotationData, PaginatedResponse } from "@/types/entities"
import type {
  ComponentResponse,
  DiagramResponse,
  LinkResponse,
  LinkTypeResponse,
  NodeResponse,
  NodeTypeResponse,
  RelationResponse,
  RelationRuleResponse,
} from "@/types/api"
import { paginatedIsLastPage } from "@/utils/paginatedResponse"
import type { ModelEditorState } from "../types"
import { toEditorDiagram, toEditorLink, toEditorNode } from "./modelEditorMappers"
import { fetchAllRelationRulesByNotationIds } from "./modelNotationRelationsApi"

type LoadModelEditorDataResult = {
  model: ModelData
  modelCatalog: ModelData[]
  state: ModelEditorState
  loadedNotationIds: string[]
}

async function mergePagedById<T extends { id: string }>(
  fetches: Array<Promise<ApiResult<PaginatedResponse<T>>>>
): Promise<T[]> {
  const byId = new Map<string, T>()
  const results = await Promise.all(fetches)
  for (const r of results) {
    if (!r.success || !r.data?.content) continue
    for (const item of r.data.content) {
      byId.set(item.id, item)
    }
  }
  return [...byId.values()]
}

/** Load every page for a model-scoped collection (nodes/links/diagrams after large OEF import). */
export async function fetchAllByModelId<T>(
  path: '/nodes' | '/links' | '/diagrams',
  modelId: string,
  pageSize: number = PAGE_SIZE_FULL
): Promise<T[]> {
  const collected: T[] = []
  let page = 0
  while (true) {
    const query = pagedListParams(page, pageSize)
    query.set('modelId', modelId)
    const result = await apiGet<PaginatedResponse<T>>(`${path}?${query.toString()}`)
    if (!result.success) {
      throw new Error(`Ошибка загрузки ${path}: ${result.error.message}`)
    }
    const batch = result.data.content ?? []
    collected.push(...batch)
    if (paginatedIsLastPage(result.data, page)) break
    page += 1
  }
  return collected
}

export async function loadModelEditorData(modelId: string): Promise<LoadModelEditorDataResult> {
  const listQuery = listParams()

  const [modelResult, modelsResult, nodes, links, diagramResponses, notationsResult] =
    await Promise.all([
      apiGet<ModelData>(`/models/${modelId}`),
      apiGet<PaginatedResponse<ModelData>>(`/models?page=0&${listQuery.toString()}`),
      fetchAllByModelId<NodeResponse>('/nodes', modelId),
      fetchAllByModelId<LinkResponse>('/links', modelId),
      fetchAllByModelId<DiagramResponse>('/diagrams', modelId),
      apiGet<PaginatedResponse<NotationData>>(`/notations?${listQuery.toString()}`),
    ])

  if (!modelResult.success) {
    if (modelResult.error.status === 404) {
      throw new Error("Модель не найдена")
    }
    if (modelResult.error.status === 403) {
      throw new Error("Доступ к модели отозван или отсутствует.")
    }
    throw new Error(modelResult.error.message)
  }

  const diagrams = diagramResponses.map(toEditorDiagram)
  const notationIds = Array.from(new Set(diagrams.map(diagram => diagram.notationId).filter(Boolean)))

  const typesQuery = listParams()
  typesQuery.set("modelId", modelId)
  for (const notationId of notationIds) {
    typesQuery.append("notationId", notationId)
  }

  const componentFetches =
    notationIds.length > 0
      ? notationIds.map(nid => {
          const q = listParams()
          q.set("modelId", modelId)
          q.set("notationId", nid)
          return apiGet<PaginatedResponse<ComponentResponse>>(`/components?${q.toString()}`)
        })
      : [apiGet<PaginatedResponse<ComponentResponse>>(`/components?${listQuery.toString()}`)]

  const relationFetches =
    notationIds.length > 0
      ? notationIds.map(nid => {
          const q = listParams()
          q.set("modelId", modelId)
          q.set("notationId", nid)
          return apiGet<PaginatedResponse<RelationResponse>>(`/relations?${q.toString()}`)
        })
      : [apiGet<PaginatedResponse<RelationResponse>>(`/relations?${listQuery.toString()}`)]

  const [components, relations, nodeTypesResult, linkTypesResult, relationRules] = await Promise.all([
    mergePagedById(componentFetches),
    mergePagedById(relationFetches),
    apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${typesQuery.toString()}`),
    apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${typesQuery.toString()}`),
    fetchAllRelationRulesByNotationIds(notationIds, { includeAttrs: false, modelId }),
  ])

  const state: ModelEditorState = {
    modelId,
    ownerId: modelResult.data.ownerId,
    nodes: nodes.map(toEditorNode),
    links: links.map(toEditorLink),
    diagrams,
    notations: notationsResult.success ? (notationsResult.data.content ?? []) : [],
    nodeTypes: nodeTypesResult.success ? (nodeTypesResult.data.content ?? []) : [],
    linkTypes: linkTypesResult.success ? (linkTypesResult.data.content ?? []) : [],
    components,
    relations,
    relationRules: relationRules as RelationRuleResponse[],
  }

  return {
    model: modelResult.data,
    modelCatalog: modelsResult.success ? (modelsResult.data.content ?? []) : [],
    state,
    loadedNotationIds: notationIds,
  }
}
