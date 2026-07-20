import type { DiagramAttrs, DiagramNodeInstance } from '../modelAttrs'
import { EDGE_ANCHOR_SIZE, getHostEdgeInstanceId, isEdgeAnchorInstance } from './diagramOnlyInstances'

export type EdgeMidpoint = { x: number; y: number }

/**
 * Positions an edge-anchor instance so its center sits on the host edge midpoint.
 */
export function placeEdgeAnchorAtMidpoint(
  instance: DiagramNodeInstance,
  midpoint: EdgeMidpoint,
  size: number = EDGE_ANCHOR_SIZE
): DiagramNodeInstance {
  const half = size / 2
  return {
    ...instance,
    x: midpoint.x - half,
    y: midpoint.y - half,
    width: size,
    height: size,
  }
}

/**
 * Returns anchor instance ids whose host edge is missing from the diagram.
 */
export function findOrphanEdgeAnchorInstanceIds(attrs: DiagramAttrs): string[] {
  const edgeIds = new Set((attrs.instances.edges ?? []).map(edge => edge.id))
  return (attrs.instances.nodes ?? [])
    .filter(isEdgeAnchorInstance)
    .filter(instance => {
      const hostId = getHostEdgeInstanceId(instance)
      return !hostId || !edgeIds.has(hostId)
    })
    .map(instance => instance.id)
}

/**
 * Removes orphan edge anchors and any edges attached to them.
 */
export function removeOrphanEdgeAnchors(attrs: DiagramAttrs): {
  nextAttrs: DiagramAttrs
  removedAnchorIds: string[]
  removedEdgeIds: string[]
  changed: boolean
} {
  const orphanIds = new Set(findOrphanEdgeAnchorInstanceIds(attrs))
  if (orphanIds.size === 0) {
    return { nextAttrs: attrs, removedAnchorIds: [], removedEdgeIds: [], changed: false }
  }
  const nodes = (attrs.instances.nodes ?? []).filter(node => !orphanIds.has(node.id))
  const edges = (attrs.instances.edges ?? []).filter(
    edge => !orphanIds.has(edge.sourceInstanceId) && !orphanIds.has(edge.targetInstanceId)
  )
  const removedEdgeIds = (attrs.instances.edges ?? [])
    .filter(edge => orphanIds.has(edge.sourceInstanceId) || orphanIds.has(edge.targetInstanceId))
    .map(edge => edge.id)
  return {
    nextAttrs: {
      ...attrs,
      instances: { nodes, edges },
    },
    removedAnchorIds: [...orphanIds],
    removedEdgeIds,
    changed: true,
  }
}

/**
 * Applies midpoint positions to all edge anchors that have a lookup for their host edge.
 */
export function syncEdgeAnchorPositions(
  nodes: DiagramNodeInstance[],
  midpointByHostEdgeId: Map<string, EdgeMidpoint>
): { nodes: DiagramNodeInstance[]; changed: boolean } {
  let changed = false
  const next = nodes.map(node => {
    if (!isEdgeAnchorInstance(node)) return node
    const hostId = getHostEdgeInstanceId(node)
    if (!hostId) return node
    const midpoint = midpointByHostEdgeId.get(hostId)
    if (!midpoint) return node
    const placed = placeEdgeAnchorAtMidpoint(node, midpoint)
    if (
      placed.x === node.x &&
      placed.y === node.y &&
      placed.width === node.width &&
      placed.height === node.height
    ) {
      return node
    }
    changed = true
    return placed
  })
  return { nodes: next, changed }
}
