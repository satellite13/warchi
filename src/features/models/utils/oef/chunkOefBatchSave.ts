import type { ApiResult } from '@/api/apiClient'
import type { BatchSaveRequest, BatchSaveResponse } from '@/features/models/composables/useModelBatchSave'

export const OEF_NODE_CHUNK_SIZE = 800
export const OEF_LINK_CHUNK_SIZE = 800

export type OefBatchChunkKind = 'nodes' | 'links' | 'diagrams'

export type OefBatchChunk = {
  kind: OefBatchChunkKind
  index: number
  totalOfKind: number
  request: BatchSaveRequest
}

export type OefChunkProgress = {
  kind: OefBatchChunkKind
  index: number
  totalOfKind: number
  nodesCreated: number
  linksCreated: number
  diagramsCreated: number
}

export type ApplyOefBatchChunksResult = {
  nodeIdMap: Record<string, string>
  linkIdMap: Record<string, string>
  diagramIdMap: Record<string, string>
  nodesCreated: number
  linksCreated: number
  diagramsCreated: number
}

function emptyRequest(force?: boolean): BatchSaveRequest {
  return {
    ...(force === true ? { force: true } : {}),
    nodes: { create: [], update: [], delete: [] },
    links: { create: [], update: [], delete: [] },
    diagrams: { create: [], update: [], delete: [] },
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/** Rewrite temp ids in diagram attrs JSON using accumulated maps. */
export function remapDiagramAttrsTempIds(
  attrs: string | null,
  nodeIdMap: Record<string, string>,
  linkIdMap: Record<string, string>
): string | null {
  if (!attrs) return attrs
  if (Object.keys(nodeIdMap).length === 0 && Object.keys(linkIdMap).length === 0) return attrs

  let root: unknown
  try {
    root = JSON.parse(attrs)
  } catch {
    return attrs
  }
  if (!root || typeof root !== 'object') return attrs

  let changed = false
  const remapField = (obj: Record<string, unknown>, field: string, map: Record<string, string>) => {
    const value = obj[field]
    if (typeof value !== 'string') return
    const mapped = map[value]
    if (!mapped) return
    obj[field] = mapped
    changed = true
  }

  const remapNodes = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue
      remapField(item as Record<string, unknown>, 'modelNodeId', nodeIdMap)
    }
  }

  const remapEdges = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue
      const edge = item as Record<string, unknown>
      remapField(edge, 'modelLinkId', linkIdMap)
      remapField(edge, 'sourceModelNodeId', nodeIdMap)
      remapField(edge, 'targetModelNodeId', nodeIdMap)
    }
  }

  const rootObj = root as Record<string, unknown>
  const instances = rootObj.instances
  if (instances && typeof instances === 'object') {
    const inst = instances as Record<string, unknown>
    remapNodes(inst.nodes)
    remapEdges(inst.edges)
  }
  remapNodes(rootObj.nodes)
  remapEdges(rootObj.edges)

  return changed ? JSON.stringify(rootObj) : attrs
}

export function planOefBatchSaveChunks(
  request: BatchSaveRequest,
  options?: {
    nodeChunkSize?: number
    linkChunkSize?: number
  }
): OefBatchChunk[] {
  const nodeChunkSize = options?.nodeChunkSize ?? OEF_NODE_CHUNK_SIZE
  const linkChunkSize = options?.linkChunkSize ?? OEF_LINK_CHUNK_SIZE
  const force = request.force === true
  const chunks: OefBatchChunk[] = []

  const nodeChunks = chunkArray(request.nodes.create, nodeChunkSize)
  nodeChunks.forEach((create, index) => {
    const next = emptyRequest(force)
    next.nodes = { create, update: [], delete: [] }
    chunks.push({
      kind: 'nodes',
      index: index + 1,
      totalOfKind: nodeChunks.length,
      request: next,
    })
  })

  const linkChunks = chunkArray(request.links.create, linkChunkSize)
  linkChunks.forEach((create, index) => {
    const next = emptyRequest(force)
    next.links = { create, update: [], delete: [] }
    chunks.push({
      kind: 'links',
      index: index + 1,
      totalOfKind: linkChunks.length,
      request: next,
    })
  })

  const diagrams = request.diagrams.create
  diagrams.forEach((create, index) => {
    const next = emptyRequest(force)
    next.diagrams = { create: [create], update: [], delete: [] }
    chunks.push({
      kind: 'diagrams',
      index: index + 1,
      totalOfKind: diagrams.length,
      request: next,
    })
  })

  return chunks
}

function applyIdMaps(
  target: Record<string, string>,
  source: Record<string, string> | undefined
): void {
  if (!source) return
  for (const [tempId, realId] of Object.entries(source)) {
    target[tempId] = realId
  }
}

function remapLinkCreates(
  creates: BatchSaveRequest['links']['create'],
  nodeIdMap: Record<string, string>
): BatchSaveRequest['links']['create'] {
  return creates.map(link => ({
    ...link,
    sourceId: nodeIdMap[link.sourceId] ?? link.sourceId,
    targetId: nodeIdMap[link.targetId] ?? link.targetId,
  }))
}

function remapDiagramCreates(
  creates: BatchSaveRequest['diagrams']['create'],
  nodeIdMap: Record<string, string>,
  linkIdMap: Record<string, string>
): BatchSaveRequest['diagrams']['create'] {
  return creates.map(diagram => ({
    ...diagram,
    nodeId: diagram.nodeId ? (nodeIdMap[diagram.nodeId] ?? diagram.nodeId) : diagram.nodeId,
    attrs: remapDiagramAttrsTempIds(diagram.attrs, nodeIdMap, linkIdMap),
  }))
}

export async function applyOefBatchSaveChunks(options: {
  modelId: string
  request: BatchSaveRequest
  batchSave: (modelId: string, request: BatchSaveRequest) => Promise<ApiResult<BatchSaveResponse>>
  onProgress?: (progress: OefChunkProgress) => void
  nodeChunkSize?: number
  linkChunkSize?: number
}): Promise<ApiResult<ApplyOefBatchChunksResult>> {
  const planned = planOefBatchSaveChunks(options.request, {
    nodeChunkSize: options.nodeChunkSize,
    linkChunkSize: options.linkChunkSize,
  })

  const nodeIdMap: Record<string, string> = {}
  const linkIdMap: Record<string, string> = {}
  const diagramIdMap: Record<string, string> = {}
  let nodesCreated = 0
  let linksCreated = 0
  let diagramsCreated = 0

  for (const chunk of planned) {
    let request = chunk.request
    if (chunk.kind === 'links') {
      request = {
        ...request,
        links: {
          ...request.links,
          create: remapLinkCreates(request.links.create, nodeIdMap),
        },
      }
    } else if (chunk.kind === 'diagrams') {
      request = {
        ...request,
        diagrams: {
          ...request.diagrams,
          create: remapDiagramCreates(request.diagrams.create, nodeIdMap, linkIdMap),
        },
      }
    }

    const result = await options.batchSave(options.modelId, request)
    if (!result.success) {
      const progressHint = `nodes=${nodesCreated}, links=${linksCreated}, diagrams=${diagramsCreated}`
      return {
        success: false,
        error: {
          ...result.error,
          message: `${result.error.message} (chunk ${chunk.kind} ${chunk.index}/${chunk.totalOfKind}; created so far: ${progressHint})`,
        },
      }
    }

    applyIdMaps(nodeIdMap, result.data.nodeIdMap)
    applyIdMaps(linkIdMap, result.data.linkIdMap)
    applyIdMaps(diagramIdMap, result.data.diagramIdMap)
    nodesCreated += request.nodes.create.length
    linksCreated += request.links.create.length
    diagramsCreated += request.diagrams.create.length

    options.onProgress?.({
      kind: chunk.kind,
      index: chunk.index,
      totalOfKind: chunk.totalOfKind,
      nodesCreated,
      linksCreated,
      diagramsCreated,
    })
  }

  return {
    success: true,
    data: {
      nodeIdMap,
      linkIdMap,
      diagramIdMap,
      nodesCreated,
      linksCreated,
      diagramsCreated,
    },
  }
}
