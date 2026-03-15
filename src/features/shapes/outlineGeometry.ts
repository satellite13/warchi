import type {
  OutlineSegment,
  OutlineSegmentBezier,
  OutlineSegmentLine,
} from '../notations/notationAttrs'

// ── Constants ──────────────────────────────────────────────

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.25

export const HIT_RADIUS = 0.06
export const EDGE_HIT_RADIUS = 0.05
export const SNAP_THRESHOLD = 0.025
export const HIT_CP_RADIUS = 0.04
export const MIN_SEGMENTS = 3

export const GUIDE_AXES = [0.25, 0.5, 0.75]

// ── Segment helpers ────────────────────────────────────────

export function segmentEnd(seg: OutlineSegment): [number, number] {
  if (seg.type === 'line') return seg.points[1]
  return seg.points[3]
}

export function segmentStart(seg: OutlineSegment): [number, number] {
  return seg.points[0]
}

export function cloneSegments(segments: OutlineSegment[]): OutlineSegment[] {
  return segments.map((seg) => {
    if (seg.type === 'line') {
      return {
        type: 'line' as const,
        points: [
          seg.points[0].slice() as [number, number],
          seg.points[1].slice() as [number, number],
        ],
      }
    }
    return {
      type: 'bezier' as const,
      points: seg.points.map((p) => p.slice() as [number, number]) as OutlineSegmentBezier['points'],
    }
  })
}

// ── Distance / hit detection ───────────────────────────────

export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1e-6
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)))
  const nx = ax + t * dx
  const ny = ay + t * dy
  return Math.hypot(px - nx, py - ny)
}

export function bezierPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const u = 1 - t
  const u2 = u * u
  const u3 = u2 * u
  const t2 = t * t
  const t3 = t2 * t
  return [
    u3 * p0[0] + 3 * u2 * t * p1[0] + 3 * u * t2 * p2[0] + t3 * p3[0],
    u3 * p0[1] + 3 * u2 * t * p1[1] + 3 * u * t2 * p2[1] + t3 * p3[1],
  ]
}

export function distanceToBezier(px: number, py: number, seg: OutlineSegmentBezier): number {
  const [p0, p1, p2, p3] = seg.points
  const steps = 12
  let best = Infinity
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps
    const t1 = (i + 1) / steps
    const a = bezierPoint(p0, p1, p2, p3, t0)
    const b = bezierPoint(p0, p1, p2, p3, t1)
    const d = distanceToSegment(px, py, a[0], a[1], b[0], b[1])
    if (d < best) best = d
  }
  return best
}

export function projectOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1e-6
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)))
  return [ax + t * dx, ay + t * dy]
}

// ── Hit test ───────────────────────────────────────────────

export type DragTarget =
  | { type: 'vertex'; segmentIndex: number }
  | { type: 'cp'; segmentIndex: number; cp: 1 | 2 }

export type HitResult = DragTarget | { type: 'edge'; segmentIndex: number } | null

export function hitTest(segments: OutlineSegment[], coord: [number, number]): HitResult {
  const [x, y] = coord
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    if (seg.type === 'bezier') {
      for (const cpIdx of [1, 2] as const) {
        const cp = seg.points[cpIdx]
        if (Math.hypot(cp[0] - x, cp[1] - y) <= HIT_CP_RADIUS) {
          return { type: 'cp', segmentIndex: i, cp: cpIdx }
        }
      }
    }
  }
  for (let i = 0; i < segments.length; i++) {
    const end = segmentEnd(segments[i]!)
    if (Math.hypot(end[0] - x, end[1] - y) <= HIT_RADIUS) {
      return { type: 'vertex', segmentIndex: i }
    }
  }
  let bestSeg = -1
  let bestD = EDGE_HIT_RADIUS
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    if (seg.type === 'line') {
      const d = distanceToSegment(
        x, y,
        seg.points[0][0], seg.points[0][1],
        seg.points[1][0], seg.points[1][1],
      )
      if (d < bestD) {
        bestD = d
        bestSeg = i
      }
    } else {
      const d = distanceToBezier(x, y, seg)
      if (d < bestD) {
        bestD = d
        bestSeg = i
      }
    }
  }
  if (bestSeg >= 0) return { type: 'edge', segmentIndex: bestSeg }
  return null
}

// ── Snapping ───────────────────────────────────────────────

export function snapCoord(
  segments: OutlineSegment[],
  coord: [number, number],
  excludeSegmentIndex: number | null,
  excludeCp: 1 | 2 | null,
): [number, number] {
  let x = coord[0]
  let y = coord[1]
  let bestDx = SNAP_THRESHOLD
  let bestDy = SNAP_THRESHOLD
  for (let i = 0; i < segments.length; i++) {
    const end = segmentEnd(segments[i]!)
    const skipVertex = excludeSegmentIndex === i && excludeCp === null
    if (!skipVertex) {
      const dx = Math.abs(coord[0] - end[0])
      const dy = Math.abs(coord[1] - end[1])
      if (dx < bestDx) {
        bestDx = dx
        x = end[0]
      }
      if (dy < bestDy) {
        bestDy = dy
        y = end[1]
      }
    }
    if (segments[i]!.type === 'bezier' && (excludeSegmentIndex !== i || excludeCp === null)) {
      for (const cpIdx of [1, 2] as const) {
        if (excludeSegmentIndex === i && excludeCp === cpIdx) continue
        const cp = segments[i]!.type === 'bezier' ? segments[i]!.points[cpIdx] : null
        if (cp) {
          const dcx = Math.abs(coord[0] - cp[0])
          const dcy = Math.abs(coord[1] - cp[1])
          if (dcx < bestDx) {
            bestDx = dcx
            x = cp[0]
          }
          if (dcy < bestDy) {
            bestDy = dcy
            y = cp[1]
          }
        }
      }
    }
  }
  for (const g of GUIDE_AXES) {
    if (Math.abs(coord[0] - g) < bestDx) {
      bestDx = Math.abs(coord[0] - g)
      x = g
    }
    if (Math.abs(coord[1] - g) < bestDy) {
      bestDy = Math.abs(coord[1] - g)
      y = g
    }
  }
  return [x, y]
}

// ── Segment conversion ─────────────────────────────────────

export function segmentLineToBezier(seg: OutlineSegmentLine): OutlineSegmentBezier {
  const [p0, p3] = [seg.points[0], seg.points[1]]
  const dx = (p3[0] - p0[0]) / 3
  const dy = (p3[1] - p0[1]) / 3
  return {
    type: 'bezier',
    points: [
      [p0[0], p0[1]],
      [p0[0] + dx, p0[1] + dy],
      [p3[0] - dx, p3[1] - dy],
      [p3[0], p3[1]],
    ],
  }
}

export function segmentBezierToLine(seg: OutlineSegmentBezier): OutlineSegmentLine {
  return {
    type: 'line',
    points: [
      seg.points[0].slice() as [number, number],
      seg.points[3].slice() as [number, number],
    ],
  }
}
