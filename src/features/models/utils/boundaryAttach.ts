import { parseBoundaryAttach, type BoundaryAttach } from '../modelAttrs'

export { parseBoundaryAttach }

export const BOUNDARY_SNAP_DISTANCE = 28

export type Point2 = { x: number; y: number }

export function distance2(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function guestCenter(guest: { x: number; y: number; width: number; height: number }): Point2 {
  return { x: guest.x + guest.width / 2, y: guest.y + guest.height / 2 }
}

export function placeGuestCenterAt(
  guest: { x: number; y: number; width: number; height: number },
  point: Point2,
): void {
  guest.x = point.x - guest.width / 2
  guest.y = point.y - guest.height / 2
}

export type OutlineCandidate = {
  id: string
  point: Point2
  param: number
}

export function pickNearestOutlineHost(
  center: Point2,
  candidates: OutlineCandidate[],
  snapDistance = BOUNDARY_SNAP_DISTANCE,
): (OutlineCandidate & { dist: number }) | null {
  let best: (OutlineCandidate & { dist: number }) | null = null
  for (const candidate of candidates) {
    const dist = distance2(center, candidate.point)
    if (dist > snapDistance) continue
    if (!best || dist < best.dist) {
      best = { ...candidate, dist }
    }
  }
  return best
}

export type BoundaryLinkCandidate = {
  id: string
  sourceId: string
  targetId: string
  _isDeleted?: boolean
  parsedAttrs: { notationRelations: Record<string, { relationId?: string }> }
}

export function listBoundaryLinksToGuest(args: {
  links: BoundaryLinkCandidate[]
  boundaryRelationIds: Set<string>
  notationId: string
  guestModelNodeId: string
  hostModelNodeId?: string | null
}): BoundaryLinkCandidate[] {
  return args.links.filter(link => {
    if (link._isDeleted) return false
    if (link.targetId !== args.guestModelNodeId) return false
    if (args.hostModelNodeId && link.sourceId !== args.hostModelNodeId) return false
    const relationId = link.parsedAttrs.notationRelations[args.notationId]?.relationId
    return !!relationId && args.boundaryRelationIds.has(relationId)
  })
}

export function retargetBoundaryEdges<T extends {
  modelLinkId: string
  sourceInstanceId: string
  targetInstanceId: string
}>(args: {
  edges: T[]
  linkIds: Set<string>
  guestInstanceId: string
  newHostInstanceId: string
}): boolean {
  let changed = false
  for (const edge of args.edges) {
    if (!args.linkIds.has(edge.modelLinkId)) continue
    if (
      edge.targetInstanceId !== args.guestInstanceId &&
      edge.sourceInstanceId !== args.guestInstanceId
    ) {
      continue
    }
    if (edge.sourceInstanceId !== args.newHostInstanceId) {
      edge.sourceInstanceId = args.newHostInstanceId
      changed = true
    }
    if (edge.targetInstanceId !== args.guestInstanceId) {
      edge.targetInstanceId = args.guestInstanceId
      changed = true
    }
  }
  return changed
}

/** Hide the structural boundary edge while the guest stays glued to that host. */
export function shouldHideBoundaryEdge(args: {
  sourceInstanceId: string
  targetInstanceId: string
  attach: BoundaryAttach | undefined
}): boolean {
  if (!args.attach) return false
  return (
    args.attach.hostInstanceId === args.sourceInstanceId ||
    args.attach.hostInstanceId === args.targetInstanceId
  )
}
