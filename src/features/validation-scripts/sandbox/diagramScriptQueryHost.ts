import type { ApiResult } from '@/composables/useApi'
import type {
  fetchGraphNeighbors,
  resolveModelLinks,
  searchModelNodes,
} from '@/features/models/composables/modelScopedApi'
import type { GraphNeighborResponse, ModelSearchHit } from '@/types/api'

export type DiagramScriptQueryMethod = 'neighbors' | 'searchNodes' | 'linksBetween'

export type DiagramScriptQueryRequest = {
  method: DiagramScriptQueryMethod | string
  args: Record<string, unknown>
}

export type DiagramScriptQueryResult =
  | { data: unknown }
  | { error: string }

export type DiagramScriptQueryHostDeps = {
  modelId: string
  fetchNeighbors: typeof fetchGraphNeighbors
  search: typeof searchModelNodes
  resolveLinks: typeof resolveModelLinks
}

function apiErrorMessage(result: ApiResult<unknown>): string {
  if (result.success) return ''
  return result.error.message || 'Request failed'
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function matchesLinkType(
  linkTypeId: string,
  requested: string
): boolean {
  if (!requested) return true
  return linkTypeId === requested || linkTypeId.toLowerCase() === requested.toLowerCase()
}

function matchesSearchType(hit: ModelSearchHit, type: string): boolean {
  if (!type) return true
  const needle = type.trim().toLowerCase()
  return (
    hit.nodeTypeId === type ||
    (hit.typeName ?? '').trim().toLowerCase() === needle
  )
}

export function createDiagramScriptQueryHost(deps: DiagramScriptQueryHostDeps) {
  const handle = async (request: DiagramScriptQueryRequest): Promise<DiagramScriptQueryResult> => {
    switch (request.method) {
      case 'neighbors': {
        const nodeId = asString(request.args.nodeId)
        const direction = request.args.direction
        if (!nodeId) return { error: 'nodeId required' }
        if (direction !== 'outgoing' && direction !== 'incoming') {
          return { error: 'direction required' }
        }
        const linkType = asString(request.args.linkType)
        const page = asNumber(request.args.page)
        const result = await deps.fetchNeighbors(deps.modelId, nodeId, {
          direction,
          ...(linkType ? { linkTypeId: linkType } : {}),
          ...(page != null ? { page } : {}),
        })
        if (!result.success) return { error: apiErrorMessage(result) }
        const items = (result.data.content ?? result.data.items ?? []) as GraphNeighborResponse[]
        return { data: { items, last: result.data.last ?? true } }
      }
      case 'searchNodes': {
        const q = asString(request.args.q)
        const type = asString(request.args.type)
        if (!q && !type) return { error: 'q or type required' }
        const requestedLimit = asNumber(request.args.limit)
        const limit = Math.min(requestedLimit ?? 50, 50)
        const result = await deps.search(deps.modelId, q || type, {
          kinds: ['nodes'],
          limit,
        })
        if (!result.success) return { error: apiErrorMessage(result) }
        const hits = (result.data.hits ?? []).filter((hit) => matchesSearchType(hit, type))
        return { data: hits }
      }
      case 'linksBetween': {
        const a = asString(request.args.a)
        const b = asString(request.args.b)
        if (!a || !b) return { error: 'a and b required' }
        const linkType = asString(request.args.linkType)
        const result = await deps.resolveLinks(deps.modelId, {
          endpointNodeIds: [a, b],
          linkIds: [],
        })
        if (!result.success) return { error: apiErrorMessage(result) }
        const pair = new Set([a, b])
        const links = result.data.links.filter((link) => {
          if (!pair.has(link.sourceId) || !pair.has(link.targetId)) return false
          return matchesLinkType(link.linkTypeId, linkType)
        })
        return { data: links }
      }
      default:
        return { error: `unknown query method ${String(request.method)}` }
    }
  }

  return { handle }
}
