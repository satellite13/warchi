import { apiPost } from '../../../composables/useApi'
import type { EditorDiagram, EditorLink, EditorNode } from '../types'
import { serializeNodeAttrs, serializeLinkAttrs, serializeDiagramAttrs } from '../modelAttrs'

export interface BatchSaveRequest {
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
  diagrams: EditorDiagram[]
): BatchSaveRequest {
  return {
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
        })),
      delete: diagrams.filter(d => d._isDeleted && !d._isNew).map(d => d.id),
    },
  }
}

function isValidBatchResponse(data: unknown): data is BatchSaveResponse {
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

export async function batchSave(
  modelId: string,
  request: BatchSaveRequest
): Promise<BatchSaveResponse | null> {
  const result = await apiPost<BatchSaveResponse>(
    `/models/${encodeURIComponent(modelId)}/batch-save`,
    request
  )
  if (!result.success) return null
  if (!isValidBatchResponse(result.data)) return null
  return result.data
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

export function applyBatchRemapping(
  response: BatchSaveResponse,
  nodes: EditorNode[],
  links: EditorLink[],
  diagrams: EditorDiagram[]
): void {
  const { nodeIdMap, linkIdMap, diagramIdMap } = response

  for (const node of nodes) {
    if (node._isNew && nodeIdMap[node.id]) {
      node.id = nodeIdMap[node.id]!
      node._isNew = false
    }
    if (node.parentNodeId && nodeIdMap[node.parentNodeId]) {
      node.parentNodeId = nodeIdMap[node.parentNodeId]!
    }
    node._isDirty = false
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
    link._isDirty = false
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
    diagram._isDirty = false
  }
}
