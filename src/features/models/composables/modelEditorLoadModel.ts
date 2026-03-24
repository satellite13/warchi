import { apiGet } from "../../../composables/useApi"
import type { ModelData, NotationData, PaginatedResponse } from "../../../types/entities"
import type {
  ComponentResponse,
  DiagramResponse,
  LinkResponse,
  LinkTypeResponse,
  NodeResponse,
  NodeTypeResponse,
  RelationResponse,
  RelationRuleResponse,
} from "../../../types/api"
import type { ModelEditorState } from "../types"
import { toEditorDiagram, toEditorLink, toEditorNode } from "./modelEditorMappers"
import { fetchAllRelationRulesByNotationIds } from "./modelNotationRelationsApi"

type LoadModelEditorDataResult = {
  model: ModelData
  modelCatalog: ModelData[]
  state: ModelEditorState
  loadedNotationIds: string[]
}

export async function loadModelEditorData(modelId: string): Promise<LoadModelEditorDataResult> {
  const listQuery = new URLSearchParams({ size: "1000" })

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
    apiGet<PaginatedResponse<NodeResponse>>(`/nodes?modelId=${encodeURIComponent(modelId)}&size=1000`),
    apiGet<PaginatedResponse<LinkResponse>>(`/links?modelId=${encodeURIComponent(modelId)}&size=1000`),
    apiGet<PaginatedResponse<DiagramResponse>>(
      `/diagrams?modelId=${encodeURIComponent(modelId)}&size=1000`
    ),
    apiGet<PaginatedResponse<NotationData>>(`/notations?${listQuery.toString()}`),
    apiGet<PaginatedResponse<ComponentResponse>>(`/components?${listQuery.toString()}`),
    apiGet<PaginatedResponse<RelationResponse>>(`/relations?${listQuery.toString()}`),
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

  const diagrams = diagramsResult.success ? (diagramsResult.data.content ?? []).map(toEditorDiagram) : []
  const notationIds = Array.from(new Set(diagrams.map(diagram => diagram.notationId).filter(Boolean)))

  const typesQuery = new URLSearchParams({ size: "1000" })
  typesQuery.set("modelId", modelId)
  for (const notationId of notationIds) {
    typesQuery.append("notationId", notationId)
  }

  const [nodeTypesResult, linkTypesResult, relationRules] = await Promise.all([
    apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${typesQuery.toString()}`),
    apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${typesQuery.toString()}`),
    fetchAllRelationRulesByNotationIds(notationIds, { includeAttrs: false }),
  ])

  const state: ModelEditorState = {
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
    relationRules: relationRules as RelationRuleResponse[],
  }

  return {
    model: modelResult.data,
    modelCatalog: modelsResult.success ? (modelsResult.data.content ?? []) : [],
    state,
    loadedNotationIds: notationIds,
  }
}
