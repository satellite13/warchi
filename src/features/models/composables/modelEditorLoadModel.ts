import { apiGet, type ApiResult } from "@/composables/useApi"
import {
  listParams,
  MODEL_PAGE_FETCH_CONCURRENCY,
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
import {
  paginatedContent,
  paginatedIsLastPage,
  paginatedTotalElements,
  paginatedTotalPages,
} from "@/utils/paginatedResponse"
import type { ModelEditorState } from "../types"
import { withModelEditorPageSlot } from '../utils/modelEditorPagePool'
import type { ModelEditorLoadProgressEvent } from '../utils/modelEditorLoadProgress'
import { toEditorDiagram, toEditorLink, toEditorNode } from "./modelEditorMappers"
import { fetchAllComponentsByNotationIds } from "./modelNotationComponentsApi"
import {
  fetchAllRelationRulesByNotationIds,
  fetchAllRelationsByNotationId,
} from "./modelNotationRelationsApi"
import { fetchNodeChildren } from './modelScopedApi'

export type LoadModelEditorDataResult = {
  model: ModelData
  modelCatalog: ModelData[]
  state: ModelEditorState
  loadedNotationIds: string[]
  rootChildrenPage: PaginatedResponse<NodeResponse>
}

export type ModelEditorCatalog = {
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
  components: ComponentResponse[]
  relations: RelationResponse[]
  relationRules: RelationRuleResponse[]
}

export type ModelEditorLoadCancellationOptions = {
  isCancelled?: () => boolean
  onProgress?: (event: ModelEditorLoadProgressEvent) => void
}

type ModelPageLoadControl = {
  shouldStop: () => boolean
  onError: (error: unknown) => void
}

type FetchModelPageOptions = ModelEditorLoadCancellationOptions & Partial<ModelPageLoadControl>

const LOAD_CANCELLED = Symbol('model-editor-load-cancelled')

async function fetchModelPage<T>(
  path: '/nodes' | '/links' | '/diagrams',
  modelId: string,
  page: number,
  pageSize: number,
  extraParams?: Record<string, string>,
  options?: FetchModelPageOptions
): Promise<PaginatedResponse<T>> {
  return withModelEditorPageSlot(async () => {
    if (options?.isCancelled?.() || options?.shouldStop?.()) throw LOAD_CANCELLED
    const query = pagedListParams(page, pageSize)
    query.set('modelId', modelId)
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        query.set(key, value)
      }
    }
    try {
      const result = await apiGet<PaginatedResponse<T>>(`${path}?${query.toString()}`)
      if (options?.isCancelled?.() || options?.shouldStop?.()) throw LOAD_CANCELLED
      if (!result.success) {
        throw new Error(`Ошибка загрузки ${path}: ${result.error.message}`)
      }
      return result.data
    } catch (error) {
      if (error !== LOAD_CANCELLED) options?.onError?.(error)
      throw error
    }
  })
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, control: ModelPageLoadControl) => Promise<R>,
  options?: ModelEditorLoadCancellationOptions
): Promise<R[]> {
  if (items.length === 0) return []
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  let firstError: unknown
  let failed = false
  const onError = (error: unknown): void => {
    if (!options?.isCancelled?.() && !failed) {
      failed = true
      firstError = error
    }
  }
  const control: ModelPageLoadControl = {
    shouldStop: () => failed || options?.isCancelled?.() === true,
    onError,
  }
  const worker = async (): Promise<void> => {
    while (!failed && !options?.isCancelled?.() && nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      if (item === undefined) break
      try {
        results[index] = await mapper(item, control)
      } catch (error) {
        if (error !== LOAD_CANCELLED) onError(error)
      }
    }
  }
  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  if (options?.isCancelled?.()) return results
  if (failed) throw firstError
  return results
}

/**
 * Load every page for a model-scoped collection (nodes/links/diagrams).
 * Fetches page 0 first, then remaining pages with a bounded pool.
 */
export async function fetchAllByModelId<T extends { id?: string }>(
  path: '/nodes' | '/links' | '/diagrams',
  modelId: string,
  pageSize: number = path === '/diagrams' ? PAGE_SIZE_MODEL_DIAGRAMS : PAGE_SIZE_MODEL_NODES,
  extraParams?: Record<string, string>,
  options?: ModelEditorLoadCancellationOptions
): Promise<T[]> {
  if (options?.isCancelled?.()) return []
  let first: PaginatedResponse<T>
  try {
    first = await fetchModelPage<T>(path, modelId, 0, pageSize, extraParams, options)
  } catch (error) {
    if (error === LOAD_CANCELLED || options?.isCancelled?.()) return []
    throw error
  }
  if (options?.isCancelled?.()) return []
  const firstBatch = first.content ?? []
  const totalElements = Math.max(paginatedTotalElements(first), firstBatch.length)
  let loadedElements = firstBatch.length
  const reportPage = (data: PaginatedResponse<T>): void => {
    loadedElements += data.content?.length ?? 0
    options?.onProgress?.({
      kind: 'collection',
      collection: path.slice(1) as 'nodes' | 'links' | 'diagrams',
      loaded: Math.min(loadedElements, totalElements),
      total: totalElements,
    })
  }
  options?.onProgress?.({
    kind: 'collection',
    collection: path.slice(1) as 'nodes' | 'links' | 'diagrams',
    loaded: Math.min(loadedElements, totalElements),
    total: totalElements,
  })
  let collected: T[]
  if (paginatedIsLastPage(first, 0)) {
    collected = firstBatch
  } else {
    const totalPages = paginatedTotalPages(first)
    if (totalPages <= 1) {
      collected = [...firstBatch]
      let page = 1
      while (true) {
        if (options?.isCancelled?.()) return []
        let data: PaginatedResponse<T>
        try {
          data = await fetchModelPage<T>(path, modelId, page, pageSize, extraParams, options)
        } catch (error) {
          if (error === LOAD_CANCELLED || options?.isCancelled?.()) return []
          throw error
        }
        if (options?.isCancelled?.()) return []
        reportPage(data)
        collected.push(...(data.content ?? []))
        if (paginatedIsLastPage(data, page)) break
        page += 1
      }
    } else {
      const restPages = Array.from({ length: totalPages - 1 }, (_, index) => index + 1)
      const rest = await mapPool(
        restPages,
        MODEL_PAGE_FETCH_CONCURRENCY,
        async (page, control) => {
          const data = await fetchModelPage<T>(path, modelId, page, pageSize, extraParams, {
            ...options,
            ...control,
          })
          reportPage(data)
          return data
        },
        options
      )
      if (options?.isCancelled?.()) return []
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
  if (options?.isCancelled?.()) return []
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

async function mapInChunks<T, R>(
  items: T[],
  mapFn: (item: T) => R,
  options?: ModelEditorLoadCancellationOptions,
  onChunk?: (loaded: number, total: number) => void
): Promise<R[]> {
  const mapped: R[] = []
  onChunk?.(0, items.length)
  for (let i = 0; i < items.length; i += ENTITY_MAP_CHUNK) {
    if (options?.isCancelled?.()) throw LOAD_CANCELLED
    const slice = items.slice(i, i + ENTITY_MAP_CHUNK)
    for (const item of slice) {
      mapped.push(mapFn(item))
    }
    onChunk?.(mapped.length, items.length)
    if (i + ENTITY_MAP_CHUNK < items.length) {
      await yieldToUi()
    }
  }
  return mapped
}

export type LoadModelEditorShellOptions = {
  /** Default false for editor tree; matrix needs true to read instance-scoped props. */
  diagramIncludeAttrs?: boolean
} & ModelEditorLoadCancellationOptions

/** Critical path: model metadata + scoped root children + light diagrams and folder types. */
export async function loadModelEditorShell(
  modelId: string,
  options?: LoadModelEditorShellOptions
): Promise<LoadModelEditorDataResult> {
  const listQuery = listParams()
  const nodeTypesQuery = listParams()
  nodeTypesQuery.set('modelId', modelId)
  const diagramIncludeAttrs = options?.diagramIncludeAttrs === true

  const [
    modelResult,
    modelsResult,
    rootChildrenResult,
    diagramResponses,
    notationsResult,
    nodeTypesResult,
  ] =
    await Promise.all([
      apiGet<ModelData>(`/models/${modelId}`),
      apiGet<PaginatedResponse<ModelData>>(`/models?page=0&${listQuery.toString()}`),
      // Normal opening must stay parent-scoped. The full helper below remains for detached callers.
      fetchNodeChildren(modelId, { kind: 'root' }, { page: 0 }),
      fetchAllByModelId<DiagramResponse>('/diagrams', modelId, PAGE_SIZE_MODEL_DIAGRAMS, {
        includeAttrs: diagramIncludeAttrs ? 'true' : 'false',
      }, options),
      apiGet<PaginatedResponse<NotationData>>(`/notations?${listQuery.toString()}`),
      // Needed immediately so Directory folders show expand toggles before catalog finishes.
      apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${nodeTypesQuery.toString()}`),
    ])

  if (options?.isCancelled?.()) throw LOAD_CANCELLED
  const model = requireModel(modelResult)
  if (!rootChildrenResult.success) {
    throw new Error(`Ошибка загрузки корня модели: ${rootChildrenResult.error.message}`)
  }
  const rootChildrenPage = rootChildrenResult.data
  const nodes = paginatedContent(rootChildrenPage)
  // includeAttrs=false → attrs null → _attrsPending; hydrate on open via GET /diagrams/{id}
  const diagrams = diagramResponses.map(row =>
    toEditorDiagram(row, diagramIncludeAttrs ? { attrsPending: false } : undefined)
  )
  const notationIds = Array.from(new Set(diagrams.map(diagram => diagram.notationId).filter(Boolean)))
  // Attrs parse is CPU-heavy on large models — yield so the first paint stays responsive.
  const editorNodes = await mapInChunks(nodes, toEditorNode, options, (loaded, total) => {
    options?.onProgress?.({ kind: 'preparing', target: 'shell', loaded, total })
  })
  if (options?.isCancelled?.()) throw LOAD_CANCELLED

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
    // GET /models returns ListResponse { items }, not Spring Page { content }
    modelCatalog: modelsResult.success ? paginatedContent(modelsResult.data) : [],
    state,
    loadedNotationIds: notationIds,
    rootChildrenPage,
  }
}

/**
 * Notation catalog needed to open/render diagrams.
 * Kept separate from links so a large link payload does not block components.
 */
export async function loadModelEditorCatalog(
  modelId: string,
  notationIds: string[],
  options?: ModelEditorLoadCancellationOptions
): Promise<ModelEditorCatalog> {
  options?.onProgress?.({ kind: 'catalog', status: 'started' })
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

  if (options?.isCancelled?.()) throw LOAD_CANCELLED
  const relationsById = new Map<string, RelationResponse>()
  for (const batch of relationsBatches) {
    for (const relation of batch) {
      relationsById.set(relation.id, relation)
    }
  }

  if (options?.isCancelled?.()) throw LOAD_CANCELLED
  options?.onProgress?.({ kind: 'catalog', status: 'complete' })
  return {
    components,
    relations: [...relationsById.values()],
    nodeTypes: nodeTypesResult.success ? (nodeTypesResult.data.content ?? []) : [],
    linkTypes: linkTypesResult.success ? (linkTypesResult.data.content ?? []) : [],
    relationRules: relationRules as RelationRuleResponse[],
  }
}

/** Heavy model graph edges — can finish after the tree/catalog are usable. */
export async function loadModelEditorLinks(
  modelId: string,
  options?: ModelEditorLoadCancellationOptions
): Promise<ReturnType<typeof toEditorLink>[]> {
  const links = await fetchAllByModelId<LinkResponse>(
    '/links',
    modelId,
    PAGE_SIZE_MODEL_NODES,
    undefined,
    options
  )
  if (options?.isCancelled?.()) throw LOAD_CANCELLED
  // Mapping parses attrs; yield so folder expand clicks stay responsive on large models.
  const mapped = await mapInChunks(links, toEditorLink, options, (loaded, total) => {
    options?.onProgress?.({ kind: 'preparing', target: 'links', loaded, total })
  })
  if (options?.isCancelled?.()) throw LOAD_CANCELLED
  return mapped
}

/** @deprecated Prefer shell + catalog + links; kept for tests and one-shot callers. */
export async function loadModelEditorExtras(
  modelId: string,
  notationIds: string[],
  options?: ModelEditorLoadCancellationOptions
): Promise<ModelEditorCatalog & { links: ReturnType<typeof toEditorLink>[] }> {
  const [catalog, links] = await Promise.all([
    loadModelEditorCatalog(modelId, notationIds, options),
    loadModelEditorLinks(modelId, options),
  ])
  if (options?.isCancelled?.()) throw LOAD_CANCELLED
  return { ...catalog, links }
}

/** Full blocking load (tests / callers that need everything at once). */
export async function loadModelEditorData(
  modelId: string,
  options?: LoadModelEditorShellOptions
): Promise<LoadModelEditorDataResult> {
  const shell = await loadModelEditorShell(modelId, options)
  // Full escape hatch intentionally keeps full nodes and links for detached/legacy consumers.
  // Do not route normal editor opening through this function.
  const [allNodes, extras] = await Promise.all([
    fetchAllByModelId<NodeResponse>('/nodes', modelId, PAGE_SIZE_MODEL_NODES, undefined, options),
    loadModelEditorExtras(modelId, shell.loadedNotationIds, options),
  ])
  if (options?.isCancelled?.()) throw LOAD_CANCELLED
  return {
    ...shell,
    state: {
      ...shell.state,
      nodes: await mapInChunks(allNodes, toEditorNode, options),
      links: extras.links,
      nodeTypes: extras.nodeTypes,
      linkTypes: extras.linkTypes,
      components: extras.components,
      relations: extras.relations,
      relationRules: extras.relationRules,
    },
  }
}
