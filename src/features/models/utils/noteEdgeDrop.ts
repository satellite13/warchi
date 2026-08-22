export type NoteEdgeDropPoint = { x: number; y: number }

export type NoteEdgeDropCandidate = {
  instanceEdgeId: string
  fromPapNodeId?: string
  toPapNodeId?: string
  path: readonly NoteEdgeDropPoint[]
}

function distanceToSegment(
  point: NoteEdgeDropPoint,
  start: NoteEdgeDropPoint,
  end: NoteEdgeDropPoint
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

function distanceToPath(
  point: NoteEdgeDropPoint,
  path: readonly NoteEdgeDropPoint[]
): { distance: number; pathParam: number } {
  if (path.length < 2) return { distance: Number.POSITIVE_INFINITY, pathParam: 0.5 }
  let total = 0
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y)
  }
  let bestDist = Number.POSITIVE_INFINITY
  let bestParam = 0.5
  let acc = 0
  for (let i = 1; i < path.length; i++) {
    const start = path[i - 1]!
    const end = path[i]!
    const segLen = Math.hypot(end.x - start.x, end.y - start.y)
    const dist = distanceToSegment(point, start, end)
    if (dist < bestDist) {
      bestDist = dist
      const dx = end.x - start.x
      const dy = end.y - start.y
      const lengthSq = dx * dx + dy * dy
      const t =
        lengthSq === 0
          ? 0
          : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq))
      bestParam = total > 0 ? (acc + t * segLen) / total : 0.5
    }
    acc += segLen
  }
  return { distance: bestDist, pathParam: bestParam }
}

/**
 * Notes and other diagram-only visuals may glue onto an existing stroke.
 * Model-tree nodes stay node→node so the notation relation picker can open,
 * even when the drop lands on the outline next to another edge.
 */
export function shouldRemapConnectToExistingEdge(source: {
  isDiagramOnlyVisual: boolean
}): boolean {
  return source.isDiagramOnlyVisual
}

/**
 * When a drop lands on a node (often a pool/lane), pick the nearest visible
 * relation by path — including strokes that only cross the fill and are not
 * incident to the container.
 */
export function pickNearestEdgeForDrop(params: {
  targetPapNodeId: string
  targetCenter: NoteEdgeDropPoint
  dropPoint: NoteEdgeDropPoint
  edges: readonly NoteEdgeDropCandidate[]
  maxDistance?: number
}): { instanceEdgeId: string; pathParam: number } | null {
  const maxDistance = params.maxDistance ?? Number.POSITIVE_INFINITY
  void params.targetPapNodeId
  void params.targetCenter
  let best: { instanceEdgeId: string; pathParam: number; distance: number } | null = null

  for (const edge of params.edges) {
    if (edge.path.length < 2) continue
    const onPath = distanceToPath(params.dropPoint, edge.path)
    if (onPath.distance > maxDistance) continue
    if (!best || onPath.distance < best.distance) {
      best = {
        instanceEdgeId: edge.instanceEdgeId,
        pathParam: onPath.pathParam,
        distance: onPath.distance,
      }
    }
  }

  return best ? { instanceEdgeId: best.instanceEdgeId, pathParam: best.pathParam } : null
}

/** @deprecated Use pickNearestEdgeForDrop — it also matches crossing strokes. */
export const pickNearestIncidentEdgeForNoteDrop = pickNearestEdgeForDrop
