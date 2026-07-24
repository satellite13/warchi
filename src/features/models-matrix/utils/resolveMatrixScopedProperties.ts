import type { EditorDiagram, EditorLink, EditorNode } from '@/features/models/types'
import {
  getDiagramScopedLinkValues,
  getDiagramScopedNodeValues,
} from '@/features/models/utils/diagramScopedProperties'

/**
 * Effective component custom properties for the relation matrix.
 * Prefers diagram instance snapshots (where the editor writes values) over
 * legacy node.componentProperties defaults.
 */
export function resolveMatrixNodeComponentProperties(params: {
  node: EditorNode
  notationId: string
  componentId: string
  diagrams: EditorDiagram[]
}): Record<string, unknown> {
  const { node, notationId, componentId, diagrams } = params
  let values: Record<string, unknown> = {
    ...(node.parsedAttrs.componentProperties[notationId]?.[componentId] ?? {}),
  }

  for (const diagram of diagrams) {
    if (diagram._isDeleted || diagram._attrsPending) continue
    if (diagram.notationId !== notationId) continue
    for (const instance of diagram.parsedAttrs.instances.nodes) {
      if (instance.modelNodeId !== node.id) continue
      const scoped = getDiagramScopedNodeValues({
        diagram: diagram.parsedAttrs,
        modelNodeId: node.id,
        notationId,
        componentId,
        nodeAttrsFallback: node.parsedAttrs,
        instanceId: instance.id,
      })
      values = { ...values, ...scoped }
    }
  }

  return values
}

/**
 * Effective relation custom properties for the relation matrix.
 * Prefers diagram edge snapshots over legacy link.relationProperties.
 */
export function resolveMatrixLinkRelationProperties(params: {
  link: EditorLink
  notationId: string
  relationId: string
  diagrams: EditorDiagram[]
}): Record<string, unknown> {
  const { link, notationId, relationId, diagrams } = params
  let values: Record<string, unknown> = {
    ...(link.parsedAttrs.relationProperties[notationId]?.[relationId] ?? {}),
  }

  for (const diagram of diagrams) {
    if (diagram._isDeleted || diagram._attrsPending) continue
    if (diagram.notationId !== notationId) continue
    for (const edge of diagram.parsedAttrs.instances.edges) {
      if (edge.modelLinkId !== link.id) continue
      const scoped = getDiagramScopedLinkValues({
        diagram: diagram.parsedAttrs,
        modelLinkId: link.id,
        notationId,
        relationId,
        linkAttrsFallback: link.parsedAttrs,
        edgeInstanceId: edge.id,
      })
      values = { ...values, ...scoped }
    }
  }

  return values
}
