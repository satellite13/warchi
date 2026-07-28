import { apiGet, type ApiResult } from "@/composables/useApi"
import {
  listParams,
  PAGE_SIZE_MODEL_DIAGRAMS,
  PAGE_SIZE_MODEL_NODES,
  pagedListParams,
} from '@/api/queryHelpers'
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
import { paginatedIsLastPage, paginatedTotalPages } from "@/utils/paginatedResponse"
import type { ModelEditorState } from "../types"
import { toEditorDiagram, toEditorLink, toEditorNode } from "./modelEditorMappers"
import { fetchAllComponentsByNotationIds } from "./modelNotationComponentsApi"
import {
  fetchAllRelationRulesByNotationIds,
  fetchAllRelationsByNotationId,
} from "./modelNotationRelationsApi"

type LoadModelEditorDataResult = {
  model: ModelData
  modelCatalog: ModelData[]
  state: ModelEditorState
  loadedNotationIds: string[]
}

export type ModelEditorCatalog = {
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
  components: ComponentResponse[]
  relations: RelationResponse[]
  relationRules: RelationRuleResponse[]
}

async function fetchModelPage<T>(
  path: '/nodes' | '/links' | '/diagrams',
  modelId: string,
  page: number,
  pageSize: number,
  extraParams?: Record<string, string>
): Promise<PaginatedResponse<T>> {
  const query = pagedListParams(page, pageSize)
  query.set('modelId', modelId)
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      query.set(key, value)
    }
  }
  const result = await apiGet<PaginatedResponse<T>>(`${path}?${query.toString()}`)
  if (!result.success) {
    throw new Error(`Ошибка загрузки ${path}: ${result.error.message}`)
  }
  return result.data
}

/**
 * Load every page for a model-scoped collection (nodes/links/diagrams).
 * Fetches page 0 first, then remaining pages in parallel.
 */
export async function fetchAllByModelId<T extends { id?: string }>(
  path: '/nodes' | '/links' | '/diagrams',
  modelId: string,
  pageSize: number = path === '/diagrams' ? PAGE_SIZE_MODEL_DIAGRAMS : PAGE_SIZE_MODEL_NODES,
  extraParams?: Record<string, string>
): Promise<T[]> {
  const first = await fetchModelPage<T>(path, modelId, 0, pageSize, extraParams)
  const firstBatch = first.content ?? []
  let collected: T[]
  if (paginatedIsLastPage(first, 0)) {
    collected = firstBatch
  } else {
    const totalPages = paginatedTotalPages(first)
    if (totalPages <= 1) {
      collected = [...firstBatch]
      let page = 1
      while (true) {
        const data = await fetchModelPage<T>(path, modelId, page, pageSize, extraParams)
        collected.push(...(data.content ?? []))
        if (paginatedIsLastPage(data, page)) break
        page += 1
      }
    } else {
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          fetchModelPage<T>(path, modelId, index + 1, pageSize, extraParams)
        )
      )
      collected = firstBatch.concat(...rest.map(page => page.content ?? []))
    }
  }

  // Guard against unstable server ordering (duplicate rows across pages).
  const seen = new Set<string>()
  const unique: T[] = []
  for (const item of collected) {
    const id = typeof item.id === 'string' ? item.id : null
    if (id == null) {
      unique.push(item)
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    unique.push(item)
  }
  return unique
}

function requireModel(modelResult: ApiResult<ModelData>): ModelData {
  if (!modelResult.success) {
    if (modelResult.error.status === 404) {
      throw new Error("Модель не найдена")
    }
    if (modelResult.error.status === 403) {
      throw new Error("Доступ к модели отозван или отсутствует.")
    }
    throw new Error(modelResult.error.message)
  }
  return modelResult.data
}

const ENTITY_MAP_CHUNK = 500

function yieldToUi(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0)
  })
}

async function mapInChunks<T, R>(items: T[], mapFn: (item: T) => R): Promise<R[]> {
  const mapped: R[] = []
  for (let i = 0; i < items.length; i += ENTITY_MAP_CHUNK) {
    const slice = items.slice(i, i + ENTITY_MAP_CHUNK)
    for (const item of slice) {
      mapped.push(mapFn(item))
    }
    if (i + ENTITY_MAP_CHUNK < items.length) {
      await yieldToUi()
    }
  }
  return mapped
}

export type LoadModelEditorShellOptions = {
  /** Default false for editor tree; matrix needs true to read instance-scoped props. */
  diagramIncludeAttrs?: boolean
}

/** Critical path for the tree: model + nodes + light diagrams (no attrs) + node types. */
export async function loadModelEditorShell(
  modelId: string,
  options?: LoadModelEditorShellOptions
): Promise<LoadModelEditorDataResult> {
  const listQuery = listParams()
  const nodeTypesQuery = listParams()
  nodeTypesQuery.set('modelId', modelId)
  const diagramIncludeAttrs = options?.diagramIncludeAttrs === true

  const [modelResult, modelsResult, nodes, diagramResponses, notationsResult, nodeTypesResult] =
    await Promise.all([
      apiGet<ModelData>(`/models/${modelId}`),
      apiGet<PaginatedResponse<ModelData>>(`/models?page=0&${listQuery.toString()}`),
      fetchAllByModelId<NodeResponse>('/nodes', modelId, PAGE_SIZE_MODEL_NODES),
      fetchAllByModelId<DiagramResponse>('/diagrams', modelId, PAGE_SIZE_MODEL_DIAGRAMS, {
        includeAttrs: diagramIncludeAttrs ? 'true' : 'false',
      }),
      apiGet<PaginatedResponse<NotationData>>(`/notations?${listQuery.toString()}`),
      // Needed immediately so Directory folders show expand toggles before catalog finishes.
      apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${nodeTypesQuery.toString()}`),
    ])

  const model = requireModel(modelResult)
  // includeAttrs=false → attrs null → _attrsPending; hydrate on open via GET /diagrams/{id}
  const diagrams = diagramResponses.map(row =>
    toEditorDiagram(row, diagramIncludeAttrs ? { attrsPending: false } : undefined)
  )
  const notationIds = Array.from(new Set(diagrams.map(diagram => diagram.notationId).filter(Boolean)))
  // Attrs parse is CPU-heavy on large models — yield so the first paint stays responsive.
  const editorNodes = await mapInChunks(nodes, toEditorNode)

  const state: ModelEditorState = {
    modelId,
    ownerId: model.ownerId,
    nodes: editorNodes,
    links: [],
    diagrams,
    notations: notationsResult.success ? (notationsResult.data.content ?? []) : [],
    nodeTypes: nodeTypesResult.success ? (nodeTypesResult.data.content ?? []) : [],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
  }

  return {
    model,
    modelCatalog: modelsResult.success ? (modelsResult.data.content ?? []) : [],
    state,
    loadedNotationIds: notationIds,
  }
}

/**
 * Notation catalog needed to open/render diagrams.
 * Kept separate from links so a large link payload does not block components.
 */
export async function loadModelEditorCatalog(
  modelId: string,
  notationIds: string[]
): Promise<ModelEditorCatalog> {
  const typesQuery = listParams()
  typesQuery.set("modelId", modelId)
  for (const notationId of notationIds) {
    typesQuery.append("notationId", notationId)
  }

  const relationFetches =
    notationIds.length > 0
      ? notationIds.map(nid => fetchAllRelationsByNotationId(nid, { modelId }))
      : [Promise.resolve([] as RelationResponse[])]

  const [components, relationsBatches, nodeTypesResult, linkTypesResult, relationRules] =
    await Promise.all([
      fetchAllComponentsByNotationIds(notationIds, { modelId }),
      Promise.all(relationFetches),
      apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${typesQuery.toString()}`),
      apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${typesQuery.toString()}`),
      fetchAllRelationRulesByNotationIds(notationIds, { includeAttrs: false, modelId }),
    ])

  const relationsById = new Map<string, RelationResponse>()
  for (const batch of relationsBatches) {
    for (const relation of batch) {
      relationsById.set(relation.id, relation)
    }
  }

  return {
    components,
    relations: [...relationsById.values()],
    nodeTypes: nodeTypesResult.success ? (nodeTypesResult.data.content ?? []) : [],
    linkTypes: linkTypesResult.success ? (linkTypesResult.data.content ?? []) : [],
    relationRules: relationRules as RelationRuleResponse[],
  }
}

/** Heavy model graph edges — can finish after the tree/catalog are usable. */
export async function loadModelEditorLinks(modelId: string): Promise<ReturnType<typeof toEditorLink>[]> {
  const links = await fetchAllByModelId<LinkResponse>('/links', modelId, PAGE_SIZE_MODEL_NODES)
  // Mapping parses attrs; yield so folder expand clicks stay responsive on large models.
  return mapInChunks(links, toEditorLink)
}

/** @deprecated Prefer shell + catalog + links; kept for tests and one-shot callers. */
export async function loadModelEditorExtras(
  modelId: string,
  notationIds: string[]
): Promise<ModelEditorCatalog & { links: ReturnType<typeof toEditorLink>[] }> {
  const [catalog, links] = await Promise.all([
    loadModelEditorCatalog(modelId, notationIds),
    loadModelEditorLinks(modelId),
  ])
  return { ...catalog, links }
}

/** Full blocking load (tests / callers that need everything at once). */
export async function loadModelEditorData(
  modelId: string,
  options?: LoadModelEditorShellOptions
): Promise<LoadModelEditorDataResult> {
  const shell = await loadModelEditorShell(modelId, options)
  const extras = await loadModelEditorExtras(modelId, shell.loadedNotationIds)
  return {
    ...shell,
    state: {
      ...shell.state,
      links: extras.links,
      nodeTypes: extras.nodeTypes,
      linkTypes: extras.linkTypes,
      components: extras.components,
      relations: extras.relations,
      relationRules: extras.relationRules,
    },
  }
}
