import type { DiagramAttrs } from '../modelAttrs'
import type { EditorLink } from '../types'

type SyncLinkEndpointsFromDiagramOptions = {
  prevDiagramAttrs: DiagramAttrs
  nextDiagramAttrs: DiagramAttrs
  links: EditorLink[]
  markLinkDirty: (linkId: string) => void
  isDiagramOnlyEdgeModelLinkId: (modelLinkId: string) => boolean
}

export function syncLinkEndpointsFromDiagram({
  prevDiagramAttrs,
  nextDiagramAttrs,
  links,
  markLinkDirty,
  isDiagramOnlyEdgeModelLinkId,
}: SyncLinkEndpointsFromDiagramOptions): void {
  const prevEdgesById = new Map(prevDiagramAttrs.instances.edges.map(edge => [edge.id, edge]))
  const nextNodeInstanceToModelNodeId = new Map(
    nextDiagramAttrs.instances.nodes.map(instance => [instance.id, instance.modelNodeId])
  )

  for (const nextEdge of nextDiagramAttrs.instances.edges) {
    if (isDiagramOnlyEdgeModelLinkId(nextEdge.modelLinkId)) continue
    const prevEdge = prevEdgesById.get(nextEdge.id)
    if (!prevEdge) continue

    const endpointChanged =
      prevEdge.sourceInstanceId !== nextEdge.sourceInstanceId ||
      prevEdge.targetInstanceId !== nextEdge.targetInstanceId
    if (!endpointChanged) continue

    const link = links.find(item => item.id === nextEdge.modelLinkId && !item._isDeleted)
    if (!link) continue

    const nextSourceModelNodeId = nextNodeInstanceToModelNodeId.get(nextEdge.sourceInstanceId)
    const nextTargetModelNodeId = nextNodeInstanceToModelNodeId.get(nextEdge.targetInstanceId)
    if (!nextSourceModelNodeId || !nextTargetModelNodeId) continue

    if (link.sourceId !== nextSourceModelNodeId || link.targetId !== nextTargetModelNodeId) {
      link.sourceId = nextSourceModelNodeId
      link.targetId = nextTargetModelNodeId
      markLinkDirty(link.id)
    }
  }
}
