import { apiGet, apiPost } from '@/composables/useApi'
import type { ApiResult } from '@/api/apiClient'
import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
import type { EditorDiagram, EditorLink, EditorNode } from '../types'
import { serializeNodeAttrs, serializeLinkAttrs, serializeDiagramAttrs } from '../modelAttrs'

export type BatchConflictItem = {
  kind: string
  id: string
  serverUpdatedAt: string | null
  clientBaseUpdatedAt: string | null
}

export interface BatchSaveRequest {
  force?: boolean
  nodes: {
    create: Array<{
      tempId: string
      name: string
      nodeTypeId: string
      parentNodeId: string | null
      attrs: string | null
    }>
    update: Array<{
      id: string
      name: string
      nodeTypeId: string
      parentNodeId: string | null
      attrs: string | null
      baseUpdatedAt?: string | null
    }>
    delete: string[]
  }
  links: {
    create: Array<{
      tempId: string
      sourceId: string
      targetId: string
      linkTypeId: string
      attrs: string | null
    }>
    update: Array<{
      id: string
      sourceId: string
      targetId: string
      linkTypeId: string
      attrs: string | null
      baseUpdatedAt?: string | null
    }>
    delete: string[]
  }
  diagrams: {
    create: Array<{
      tempId: string
      name: string
      version: string
      notationId: string
      nodeId: string | null
      attrs: string | null
    }>
    update: Array<{
      id: string
      name: string
      version: string
      notationId: string
      nodeId: string | null
      attrs: string | null
      baseUpdatedAt?: string | null
    }>
    delete: string[]
  }
}

export interface BatchSaveResponse {
  nodeIdMap: Record<string, string>
  linkIdMap: Record<string, string>
  diagramIdMap: Record<string, string>
}

export function buildBatchSaveRequest(
  nodes: EditorNode[],
  links: EditorLink[],
  diagrams: EditorDiagram[],
  options?: { force?: boolean }
): BatchSaveRequest {
  return {
    ...(options?.force === true ? { force: true } : {}),
    nodes: {
      create: nodes
        .filter(n => n._isNew && !n._isDeleted)
        .map(n => ({
          tempId: n.id,
          name: n.name,
          nodeTypeId: n.nodeTypeId,
          parentNodeId: n.parentNodeId ?? null,
          attrs: serializeNodeAttrs(n.parsedAttrs),
        })),
      update: nodes
        .filter(n => n._isDirty && !n._isDeleted && !n._isNew)
        .map(n => ({
          id: n.id,
          name: n.name,
          nodeTypeId: n.nodeTypeId,
          parentNodeId: n.parentNodeId ?? null,
          attrs: serializeNodeAttrs(n.parsedAttrs),
          baseUpdatedAt: n.updatedAt ?? null,
        })),
      delete: nodes.filter(n => n._isDeleted && !n._isNew).map(n => n.id),
    },
    links: {
      create: links
        .filter(l => l._isNew && !l._isDeleted)
        .map(l => ({
          tempId: l.id,
          sourceId: l.sourceId,
          targetId: l.targetId,
          linkTypeId: l.linkTypeId,
          attrs: serializeLinkAttrs(l.parsedAttrs),
        })),
      update: links
        .filter(l => l._isDirty && !l._isDeleted && !l._isNew)
        .map(l => ({
          id: l.id,
          sourceId: l.sourceId,
          targetId: l.targetId,
          linkTypeId: l.linkTypeId,
          attrs: serializeLinkAttrs(l.parsedAttrs),
          baseUpdatedAt: l.updatedAt ?? null,
        })),
      delete: links.filter(l => l._isDeleted && !l._isNew).map(l => l.id),
    },
    diagrams: {
      create: diagrams
        .filter(d => d._isNew && !d._isDeleted)
        .map(d => ({
          tempId: d.id,
          name: d.name,
          version: d.version,
          notationId: d.notationId,
          nodeId: d.nodeId ?? null,
          attrs: serializeDiagramAttrs(d.parsedAttrs),
        })),
      update: diagrams
        .filter(d => d._isDirty && !d._isDeleted && !d._isNew)
        .map(d => ({
          id: d.id,
          name: d.name,
          version: d.version,
          notationId: d.notationId,
          nodeId: d.nodeId ?? null,
          attrs: serializeDiagramAttrs(d.parsedAttrs),
          baseUpdatedAt: d.updatedAt ?? null,
        })),
      delete: diagrams.filter(d => d._isDeleted && !d._isNew).map(d => d.id),
    },
  }
}

export function isValidBatchResponse(data: unknown): data is BatchSaveResponse {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.nodeIdMap === 'object' &&
    obj.nodeIdMap !== null &&
    typeof obj.linkIdMap === 'object' &&
    obj.linkIdMap !== null &&
    typeof obj.diagramIdMap === 'object' &&
    obj.diagramIdMap !== null
  )
}

export function parseBatchSaveConflictDetails(details: unknown): BatchConflictItem[] | null {
  if (!details || typeof details !== 'object') return null
  const record = details as Record<string, unknown>
  if (!Array.isArray(record.conflicts)) return null
  const out: BatchConflictItem[] = []
  for (const row of record.conflicts) {
    if (!row || typeof row !== 'object') continue
    const c = row as Record<string, unknown>
    if (typeof c.kind !== 'string' || typeof c.id !== 'string') continue
    out.push({
      kind: c.kind,
      id: c.id,
      serverUpdatedAt: typeof c.serverUpdatedAt === 'string' ? c.serverUpdatedAt : null,
      clientBaseUpdatedAt: typeof c.clientBaseUpdatedAt === 'string' ? c.clientBaseUpdatedAt : null,
    })
  }
  return out.length > 0 ? out : null
}

export async function batchSave(
  modelId: string,
  request: BatchSaveRequest
): Promise<ApiResult<BatchSaveResponse>> {
  return apiPost<BatchSaveResponse>(
    `/models/${encodeURIComponent(modelId)}/batch-save`,
    request
  )
}

export function hasBatchChanges(request: BatchSaveRequest): boolean {
  return (
    request.nodes.create.length > 0 ||
    request.nodes.update.length > 0 ||
    request.nodes.delete.length > 0 ||
    request.links.create.length > 0 ||
    request.links.update.length > 0 ||
    request.links.delete.length > 0 ||
    request.diagrams.create.length > 0 ||
    request.diagrams.update.length > 0 ||
    request.diagrams.delete.length > 0
  )
}

/**
 * Id сущностей, у которых на сервере обновилась `updatedAt` после batch-save (нужен GET, т.к. ответ batch не возвращает метки времени).
 */
export function collectEntityIdsForBatchTimestampRefresh(
  request: BatchSaveRequest,
  response: BatchSaveResponse
): { nodeIds: string[]; linkIds: string[]; diagramIds: string[] } {
  const nodeIds = new Set<string>()
  const linkIds = new Set<string>()
  const diagramIds = new Set<string>()

  for (const u of request.nodes.update) nodeIds.add(u.id)
  for (const u of request.links.update) linkIds.add(u.id)
  for (const u of request.diagrams.update) diagramIds.add(u.id)

  for (const c of request.nodes.create) {
    const nid = response.nodeIdMap[c.tempId]
    if (nid) nodeIds.add(nid)
  }
  for (const c of request.links.create) {
    const lid = response.linkIdMap[c.tempId]
    if (lid) linkIds.add(lid)
  }
  for (const c of request.diagrams.create) {
    const did = response.diagramIdMap[c.tempId]
    if (did) diagramIds.add(did)
  }

  return {
    nodeIds: [...nodeIds],
    linkIds: [...linkIds],
    diagramIds: [...diagramIds],
  }
}

/**
 * После успешного batch-save сервер выставляет новый `updatedAt`, а клиент оставляет старый → следующий save даёт ложный 409.
 * Подтягиваем только метки времени через GET по id.
 */
export async function refreshBatchSavedEntityTimestamps(
  state: { nodes: EditorNode[]; links: EditorLink[]; diagrams: EditorDiagram[] },
  request: BatchSaveRequest,
  response: BatchSaveResponse
): Promise<void> {
  const { nodeIds, linkIds, diagramIds } = collectEntityIdsForBatchTimestampRefresh(request, response)

  const tasks: Promise<void>[] = []

  for (const id of nodeIds) {
    tasks.push(
      (async (): Promise<void> => {
        const r = await apiGet<NodeResponse>(`/nodes/${encodeURIComponent(id)}`)
        if (!r.success) return
        const row = state.nodes.find(n => n.id === id)
        if (!row) return
        const u = r.data.updatedAt
        if (typeof u === 'string' && u.length > 0) row.updatedAt = u
      })()
    )
  }

  for (const id of linkIds) {
    tasks.push(
      (async (): Promise<void> => {
        const r = await apiGet<LinkResponse>(`/links/${encodeURIComponent(id)}`)
        if (!r.success) return
        const row = state.links.find(l => l.id === id)
        if (!row) return
        const u = r.data.updatedAt
        if (typeof u === 'string' && u.length > 0) row.updatedAt = u
      })()
    )
  }

  for (const id of diagramIds) {
    tasks.push(
      (async (): Promise<void> => {
        const r = await apiGet<DiagramResponse>(`/diagrams/${encodeURIComponent(id)}`)
        if (!r.success) return
        const row = state.diagrams.find(d => d.id === id)
        if (!row) return
        const u = r.data.updatedAt
        if (typeof u === 'string' && u.length > 0) row.updatedAt = u
      })()
    )
  }

  await Promise.all(tasks)
}

export function applyBatchRemapping(
  response: BatchSaveResponse,
  nodes: EditorNode[],
  links: EditorLink[],
  diagrams: EditorDiagram[],
  request?: BatchSaveRequest
): void {
  const { nodeIdMap, linkIdMap, diagramIdMap } = response

  // Build sets of IDs that were actually included in the batch request,
  // so we only clear dirty/new flags for those entities (not ones edited concurrently).
  const batchNodeIds = request
    ? new Set([
        ...request.nodes.create.map((n) => n.tempId),
        ...request.nodes.update.map((n) => n.id),
        ...request.nodes.delete,
      ])
    : null
  const batchLinkIds = request
    ? new Set([
        ...request.links.create.map((l) => l.tempId),
        ...request.links.update.map((l) => l.id),
        ...request.links.delete,
      ])
    : null
  const batchDiagramIds = request
    ? new Set([
        ...request.diagrams.create.map((d) => d.tempId),
        ...request.diagrams.update.map((d) => d.id),
        ...request.diagrams.delete,
      ])
    : null

  for (const node of nodes) {
    if (node._isNew && nodeIdMap[node.id]) {
      node.id = nodeIdMap[node.id]!
      node._isNew = false
    }
    if (node.parentNodeId && nodeIdMap[node.parentNodeId]) {
      node.parentNodeId = nodeIdMap[node.parentNodeId]!
    }
    if (!batchNodeIds || batchNodeIds.has(node.id)) {
      node._isDirty = false
    }
  }

  for (const link of links) {
    if (nodeIdMap[link.sourceId]) link.sourceId = nodeIdMap[link.sourceId]!
    if (nodeIdMap[link.targetId]) link.targetId = nodeIdMap[link.targetId]!
    if (link._isNew && linkIdMap[link.id]) {
      const oldId = link.id
      link.id = linkIdMap[oldId]!
      link._isNew = false
      for (const diagram of diagrams) {
        for (const edge of diagram.parsedAttrs.instances.edges) {
          if (edge.modelLinkId === oldId) edge.modelLinkId = link.id
        }
      }
    }
    if (!batchLinkIds || batchLinkIds.has(link.id)) {
      link._isDirty = false
    }
  }

  for (const diagram of diagrams) {
    if (diagram.nodeId && nodeIdMap[diagram.nodeId]) {
      diagram.nodeId = nodeIdMap[diagram.nodeId]!
    }
    for (const nodeInstance of diagram.parsedAttrs.instances.nodes) {
      if (nodeIdMap[nodeInstance.modelNodeId]) {
        nodeInstance.modelNodeId = nodeIdMap[nodeInstance.modelNodeId]!
      }
    }
    if (diagram._isNew && diagramIdMap[diagram.id]) {
      diagram.id = diagramIdMap[diagram.id]!
      diagram._isNew = false
    }
    if (!batchDiagramIds || batchDiagramIds.has(diagram.id)) {
      diagram._isDirty = false
    }
  }
}
