export function canvasModelNodeIds(
  instances: { nodes: Array<{ modelNodeId?: string }> },
): string[] {
  return instances.nodes
    .map(node => node.modelNodeId)
    .filter((id): id is string => Boolean(id))
}

export function orphanedUntypedNodeIds(input: {
  deletedCanvasNodeIds: Iterable<string>
  remainingCanvasNodeIds: Iterable<string>
  nodes: Array<{ id: string; nodeTypeId: string; _isDeleted?: boolean }>
  untypedNodeTypeIds: Set<string>
}): string[] {
  const remaining = new Set(input.remainingCanvasNodeIds)
  const deleted = new Set(input.deletedCanvasNodeIds)
  return input.nodes
    .filter(node => !node._isDeleted)
    .filter(node => input.untypedNodeTypeIds.has(node.nodeTypeId))
    .filter(node => deleted.has(node.id) && !remaining.has(node.id))
    .map(node => node.id)
}
