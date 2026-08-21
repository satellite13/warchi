import { MODEL_RESOLVE_CHUNK_SIZE, MODEL_TREE_PAGE_SIZE, chunkUniqueIds } from '@/api/queryHelpers'
import { apiFetch, type ApiResult } from '@/composables/useApi'
import type {
  DiagramReferenceResponse,
  GraphNeighborResponse,
  LinkResponse,
  ModelLinkResolveRequest,
  ModelLinkResolveResponse,
  ModelNodeResolveResponse,
  ModelSearchResponse,
  NodeResponse,
} from '@/types/api'
import type { PaginatedResponse } from '@/types/entities'
import type { TreeParentScope } from '../types'

export type FetchNodeChildrenOptions = {
  page?: number
  size?: number
  excludeSystem?: boolean
  foldersOnly?: boolean
  signal?: AbortSignal
}

export type SearchModelNodesOptions = {
  limit?: number
  signal?: AbortSignal
}

export type FetchGraphNeighborsOptions = {
  direction: 'outgoing' | 'incoming'
  linkTypeId?: string
  page?: number
  size?: number
  signal?: AbortSignal
}

export type FetchDiagramReferencesOptions = {
  page?: number
  size?: number
  signal?: AbortSignal
}

const encodePath = (value: string): string => encodeURIComponent(value)

const uniqueById = <T extends { id: string }>(rows: readonly T[]): T[] => {
  const seen = new Set<string>()
  return rows.filter(row => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

export function fetchNodeChildren(
  modelId: string,
  scope: TreeParentScope,
  options: FetchNodeChildrenOptions = {}
): Promise<ApiResult<PaginatedResponse<NodeResponse>>> {
  const query = new URLSearchParams({
    modelId,
    parentId: scope.kind === 'root' ? 'root' : scope.nodeId,
    excludeSystem: String(options.excludeSystem ?? true),
    foldersOnly: String(options.foldersOnly ?? false),
    page: String(options.page ?? 0),
    size: String(options.size ?? MODEL_TREE_PAGE_SIZE),
  })
  return apiFetch<PaginatedResponse<NodeResponse>>(`/nodes?${query.toString()}`, {
    method: 'GET',
    signal: options.signal,
  })
}

export async function resolveModelNodes(
  modelId: string,
  nodeIds: readonly string[],
  signal?: AbortSignal
): Promise<ApiResult<ModelNodeResolveResponse>> {
  const chunks = chunkUniqueIds(nodeIds, MODEL_RESOLVE_CHUNK_SIZE)
  if (chunks.length === 0) return { success: true, data: { nodes: [], missingIds: [] } }

  const nodes: NodeResponse[] = []
  const missingIds: string[] = []
  for (const chunk of chunks) {
    const result = await apiFetch<ModelNodeResolveResponse>(
      `/models/${encodePath(modelId)}/nodes:resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ nodeIds: chunk }),
        signal,
      }
    )
    if (!result.success) return result
    nodes.push(...result.data.nodes)
    missingIds.push(...result.data.missingIds)
  }
  return {
    success: true,
    data: {
      nodes: uniqueById(nodes),
      missingIds: [...new Set(missingIds)],
    },
  }
}

export async function resolveModelLinks(
  modelId: string,
  request: ModelLinkResolveRequest,
  signal?: AbortSignal
): Promise<ApiResult<ModelLinkResolveResponse>> {
  const linkChunks = chunkUniqueIds(request.linkIds, MODEL_RESOLVE_CHUNK_SIZE)
  const endpointChunks = chunkUniqueIds(request.endpointNodeIds, MODEL_RESOLVE_CHUNK_SIZE)
  const requestCount = Math.max(linkChunks.length, endpointChunks.length)
  if (requestCount === 0) {
    return { success: true, data: { links: [], missingLinkIds: [] } }
  }

  const links: LinkResponse[] = []
  const missingLinkIds: string[] = []
  for (let index = 0; index < requestCount; index += 1) {
    const body: ModelLinkResolveRequest = {
      linkIds: linkChunks[index] ?? [],
      endpointNodeIds: endpointChunks[index] ?? [],
    }
    const result = await apiFetch<ModelLinkResolveResponse>(
      `/models/${encodePath(modelId)}/links:resolve`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      }
    )
    if (!result.success) return result
    links.push(...result.data.links)
    missingLinkIds.push(...result.data.missingLinkIds)
  }
  return {
    success: true,
    data: {
      links: uniqueById(links),
      missingLinkIds: [...new Set(missingLinkIds)],
    },
  }
}

export function fetchNodeAncestors(
  modelId: string,
  nodeId: string,
  signal?: AbortSignal
): Promise<ApiResult<NodeResponse[]>> {
  return apiFetch<NodeResponse[]>(
    `/models/${encodePath(modelId)}/nodes/${encodePath(nodeId)}/ancestors`,
    { method: 'GET', signal }
  )
}

export function searchModelNodes(
  modelId: string,
  queryText: string,
  options: SearchModelNodesOptions = {}
): Promise<ApiResult<ModelSearchResponse>> {
  const query = new URLSearchParams({
    q: queryText,
    kinds: 'nodes',
    limit: String(options.limit ?? 50),
  })
  return apiFetch<ModelSearchResponse>(
    `/search/models/${encodePath(modelId)}?${query.toString()}`,
    { method: 'GET', signal: options.signal }
  )
}

export function fetchGraphNeighbors(
  modelId: string,
  nodeId: string,
  options: FetchGraphNeighborsOptions
): Promise<ApiResult<PaginatedResponse<GraphNeighborResponse>>> {
  const query = new URLSearchParams({
    nodeId,
    direction: options.direction,
  })
  if (options.linkTypeId) query.set('linkTypeId', options.linkTypeId)
  query.set('page', String(options.page ?? 0))
  query.set('size', String(options.size ?? 50))
  return apiFetch<PaginatedResponse<GraphNeighborResponse>>(
    `/models/${encodePath(modelId)}/graph/neighbors?${query.toString()}`,
    { method: 'GET', signal: options.signal }
  )
}

export function fetchDiagramReferences(
  modelId: string,
  nodeId: string,
  options: FetchDiagramReferencesOptions = {}
): Promise<ApiResult<PaginatedResponse<DiagramReferenceResponse>>> {
  const query = new URLSearchParams({
    nodeId,
    page: String(options.page ?? 0),
    size: String(options.size ?? 50),
  })
  return apiFetch<PaginatedResponse<DiagramReferenceResponse>>(
    `/models/${encodePath(modelId)}/diagram-references?${query.toString()}`,
    { method: 'GET', signal: options.signal }
  )
}
