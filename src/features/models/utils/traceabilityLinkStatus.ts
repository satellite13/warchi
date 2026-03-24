import type { RelationResponse } from '@/types/api'
import type { EditorDiagram, EditorLink } from '../types'

export type TraceabilityLinkDragDisabledReason =
  | 'noActiveDiagram'
  | 'readOnly'
  | 'alreadyOnDiagram'
  | 'missingEndpointInstances'
  | 'missingRelation'
  | 'connectNotAllowed'

export type TraceabilityLinkStatus = {
  hasActiveDiagram: boolean
  onDiagram: boolean
  draggable: boolean
  reason?: TraceabilityLinkDragDisabledReason
}

type ComputeTraceabilityLinkStatusArgs = {
  link: EditorLink
  activeDiagram: EditorDiagram | null
  activeNotationId: string | null
  isDiagramReadOnly: boolean
  relations: RelationResponse[]
  canConnect: (sourceModelNodeId: string, targetModelNodeId: string) => boolean
  isDiagramOnlyEdgeModelLinkId?: (modelLinkId: string) => boolean
}

export function computeTraceabilityLinkStatus(
  args: ComputeTraceabilityLinkStatusArgs
): TraceabilityLinkStatus {
  const {
    link,
    activeDiagram,
    activeNotationId,
    isDiagramReadOnly,
    relations,
    canConnect,
    isDiagramOnlyEdgeModelLinkId = () => false,
  } = args

  if (!activeDiagram) {
    return { hasActiveDiagram: false, onDiagram: false, draggable: false, reason: 'noActiveDiagram' }
  }

  const onDiagram = activeDiagram.parsedAttrs.instances.edges.some(
    (edge) =>
      edge.modelLinkId === link.id &&
      !isDiagramOnlyEdgeModelLinkId(edge.modelLinkId)
  )

  if (isDiagramReadOnly) {
    return { hasActiveDiagram: true, onDiagram, draggable: false, reason: 'readOnly' }
  }

  if (onDiagram) {
    return { hasActiveDiagram: true, onDiagram: true, draggable: false, reason: 'alreadyOnDiagram' }
  }

  const modelNodeIdsOnDiagram = new Set(
    activeDiagram.parsedAttrs.instances.nodes.map((nodeInstance) => nodeInstance.modelNodeId)
  )
  const hasSourceInstance = modelNodeIdsOnDiagram.has(link.sourceId)
  const hasTargetInstance = modelNodeIdsOnDiagram.has(link.targetId)
  if (!hasSourceInstance || !hasTargetInstance) {
    return {
      hasActiveDiagram: true,
      onDiagram: false,
      draggable: false,
      reason: 'missingEndpointInstances',
    }
  }

  const hasRelation =
    !!activeNotationId &&
    relations.some(
      (relation) =>
        relation.notationId === activeNotationId && relation.linkTypeId === link.linkTypeId
    )
  if (!hasRelation) {
    return { hasActiveDiagram: true, onDiagram: false, draggable: false, reason: 'missingRelation' }
  }

  if (!canConnect(link.sourceId, link.targetId)) {
    return { hasActiveDiagram: true, onDiagram: false, draggable: false, reason: 'connectNotAllowed' }
  }

  return { hasActiveDiagram: true, onDiagram: false, draggable: true }
}

