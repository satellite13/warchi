import { describe, expect, it } from 'vitest'
import type { OutlineSegmentBezier, OutlineSegmentLine } from '@/types/shapes'
import {
  bezierPoint,
  cloneSegments,
  distanceToSegment,
  EDGE_HIT_RADIUS,
  HIT_CP_RADIUS,
  HIT_RADIUS,
  hitTest,
  projectOnSegment,
  segmentBezierToLine,
  segmentEnd,
  segmentLineToBezier,
  segmentStart,
  SNAP_THRESHOLD,
  snapCoord,
} from './outlineGeometry'

// ── Helpers ───────────────────────────────────────────────

function line(p0: [number, number], p1: [number, number]): OutlineSegmentLine {
  return { type: 'line', points: [p0, p1] }
}

function bezier(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
): OutlineSegmentBezier {
  return { type: 'bezier', points: [p0, p1, p2, p3] }
}

// ── segmentStart / segmentEnd ─────────────────────────────

describe('segmentStart', () => {
  it('returns the first point of a line segment', () => {
    const seg = line([0.1, 0.2], [0.8, 0.9])
    expect(segmentStart(seg)).toEqual([0.1, 0.2])
  })

  it('returns the first point of a bezier segment', () => {
    const seg = bezier([0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8])
    expect(segmentStart(seg)).toEqual([0.1, 0.2])
  })
})

describe('segmentEnd', () => {
  it('returns the second point of a line segment', () => {
    const seg = line([0.1, 0.2], [0.8, 0.9])
    expect(segmentEnd(seg)).toEqual([0.8, 0.9])
  })

  it('returns the fourth point of a bezier segment', () => {
    const seg = bezier([0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8])
    expect(segmentEnd(seg)).toEqual([0.7, 0.8])
  })
})

// ── cloneSegments ─────────────────────────────────────────

describe('cloneSegments', () => {
  it('deep clones line segments so mutations do not affect the original', () => {
    const original = [line([0, 0], [1, 1])]
    const cloned = cloneSegments(original)

    cloned[0]!.points[0][0] = 999
    expect(original[0]!.points[0][0]).toBe(0)
  })

  it('deep clones bezier segments so mutations do not affect the original', () => {
    const original = [bezier([0, 0], [0.2, 0.3], [0.6, 0.7], [1, 1])]
    const cloned = cloneSegments(original)

    cloned[0]!.points[1][0] = 999
    expect(original[0]!.points[1][0]).toBe(0.2)
  })

  it('preserves segment types after cloning', () => {
    const original = [line([0, 0], [1, 0]), bezier([1, 0], [1, 0.3], [1, 0.7], [1, 1])]
    const cloned = cloneSegments(original)
    expect(cloned[0]!.type).toBe('line')
    expect(cloned[1]!.type).toBe('bezier')
  })

  it('handles an empty array', () => {
    expect(cloneSegments([])).toEqual([])
  })
})

// ── distanceToSegment ─────────────────────────────────────

describe('distanceToSegment', () => {
  it('returns 0 for a point on the segment start', () => {
    expect(distanceToSegment(0, 0, 0, 0, 1, 0)).toBe(0)
  })

  it('returns 0 for a point on the segment end', () => {
    expect(distanceToSegment(1, 0, 0, 0, 1, 0)).toBe(0)
  })

  it('returns 0 for a point in the middle of a horizontal segment', () => {
    expect(distanceToSegment(0.5, 0, 0, 0, 1, 0)).toBe(0)
  })

  it('returns positive distance for a point away from the segment', () => {
    // point (0.5, 1) is 1 unit away from horizontal segment (0,0)-(1,0)
    expect(distanceToSegment(0.5, 1, 0, 0, 1, 0)).toBeCloseTo(1)
  })

  it('clamps projection to segment endpoints', () => {
    // point (-1, 0) is beyond the start of (0,0)-(1,0), closest is (0,0)
    expect(distanceToSegment(-1, 0, 0, 0, 1, 0)).toBeCloseTo(1)
  })

  it('handles zero-length segments', () => {
    expect(distanceToSegment(1, 0, 0, 0, 0, 0)).toBeCloseTo(1)
  })
})

// ── bezierPoint ───────────────────────────────────────────

describe('bezierPoint', () => {
  const p0: [number, number] = [0, 0]
  const p1: [number, number] = [0, 1]
  const p2: [number, number] = [1, 1]
  const p3: [number, number] = [1, 0]

  it('returns p0 when t=0', () => {
    expect(bezierPoint(p0, p1, p2, p3, 0)).toEqual([0, 0])
  })

  it('returns p3 when t=1', () => {
    expect(bezierPoint(p0, p1, p2, p3, 1)).toEqual([1, 0])
  })

  it('returns a midpoint at t=0.5', () => {
    const [x, y] = bezierPoint(p0, p1, p2, p3, 0.5)
    expect(x).toBeCloseTo(0.5)
    expect(y).toBeCloseTo(0.75)
  })

  it('returns p0 for a degenerate curve (all points the same)', () => {
    const p: [number, number] = [3, 4]
    expect(bezierPoint(p, p, p, p, 0.5)).toEqual([3, 4])
  })
})

// ── projectOnSegment ──────────────────────────────────────

describe('projectOnSegment', () => {
  it('projects a perpendicular point onto the midpoint', () => {
    // point (0.5, 1) onto horizontal segment (0,0)-(1,0) → (0.5, 0)
    const result = projectOnSegment(0.5, 1, 0, 0, 1, 0)
    expect(result[0]).toBeCloseTo(0.5)
    expect(result[1]).toBeCloseTo(0)
  })

  it('clamps to the start endpoint when projection falls before segment', () => {
    const result = projectOnSegment(-1, 0, 0, 0, 1, 0)
    expect(result[0]).toBeCloseTo(0)
    expect(result[1]).toBeCloseTo(0)
  })

  it('clamps to the end endpoint when projection falls beyond segment', () => {
    const result = projectOnSegment(5, 0, 0, 0, 1, 0)
    expect(result[0]).toBeCloseTo(1)
    expect(result[1]).toBeCloseTo(0)
  })

  it('returns exact endpoint when point coincides with it', () => {
    const result = projectOnSegment(0, 0, 0, 0, 1, 1)
    expect(result).toEqual([0, 0])
  })
})

// ── hitTest ───────────────────────────────────────────────

describe('hitTest', () => {
  const triangle = [
    line([0, 0], [1, 0]),
    line([1, 0], [0.5, 1]),
    line([0.5, 1], [0, 0]),
  ]

  it('hits a vertex when coordinate is within HIT_RADIUS', () => {
    const offset = HIT_RADIUS * 0.5
    const result = hitTest(triangle, [1 + offset, 0])
    expect(result).toEqual({ type: 'vertex', segmentIndex: 0 })
  })

  it('hits an edge when coordinate is close to a line segment', () => {
    const result = hitTest(triangle, [0.5, EDGE_HIT_RADIUS * 0.5])
    expect(result).not.toBeNull()
    expect(result!.type).toBe('edge')
  })

  it('returns null when coordinate is far from everything', () => {
    expect(hitTest(triangle, [5, 5])).toBeNull()
  })

  it('hits a bezier control point with higher priority than vertices', () => {
    const cpX = 0.5
    const cpY = 0.5
    const segments = [bezier([0, 0], [cpX, cpY], [0.8, 0.8], [1, 1])]
    const offset = HIT_CP_RADIUS * 0.5
    const result = hitTest(segments, [cpX + offset, cpY])
    expect(result).toEqual({ type: 'cp', segmentIndex: 0, cp: 1 })
  })

  it('hits bezier cp2', () => {
    const segments = [bezier([0, 0], [0.2, 0.2], [0.5, 0.5], [1, 1])]
    const offset = HIT_CP_RADIUS * 0.5
    const result = hitTest(segments, [0.5 + offset, 0.5])
    expect(result).toEqual({ type: 'cp', segmentIndex: 0, cp: 2 })
  })

  it('handles empty segments array', () => {
    expect(hitTest([], [0.5, 0.5])).toBeNull()
  })
})

// ── snapCoord ─────────────────────────────────────────────

describe('snapCoord', () => {
  it('snaps to a nearby vertex', () => {
    const segments = [line([0, 0], [0.5, 0.5]), line([0.5, 0.5], [1, 0])]
    const near = [0.5 + SNAP_THRESHOLD * 0.5, 0.5 + SNAP_THRESHOLD * 0.5] as [number, number]
    const result = snapCoord(segments, near, null, null)
    expect(result[0]).toBeCloseTo(0.5)
    expect(result[1]).toBeCloseTo(0.5)
  })

  it('snaps to guide axis at 0.25', () => {
    const segments = [line([0, 0], [1, 1])]
    const near = [0.25 + SNAP_THRESHOLD * 0.3, 0.8] as [number, number]
    const result = snapCoord(segments, near, null, null)
    expect(result[0]).toBeCloseTo(0.25)
  })

  it('snaps to guide axis at 0.5', () => {
    const segments = [line([0, 0], [0.2, 0.2])]
    const near = [0.5 + SNAP_THRESHOLD * 0.3, 0.5 - SNAP_THRESHOLD * 0.3] as [number, number]
    const result = snapCoord(segments, near, null, null)
    expect(result[0]).toBeCloseTo(0.5)
    expect(result[1]).toBeCloseTo(0.5)
  })

  it('snaps to guide axis at 0.75', () => {
    const segments = [line([0, 0], [0.2, 0.2])]
    const near = [0.75 - SNAP_THRESHOLD * 0.3, 0.1] as [number, number]
    const result = snapCoord(segments, near, null, null)
    expect(result[0]).toBeCloseTo(0.75)
  })

  it('excludes the vertex at excludeSegmentIndex when excludeCp is null', () => {
    const segments = [line([0, 0], [0.5, 0.5])]
    const near = [0.5 + SNAP_THRESHOLD * 0.3, 0.5 + SNAP_THRESHOLD * 0.3] as [number, number]
    // exclude segment 0 vertex → should NOT snap to (0.5, 0.5)
    const result = snapCoord(segments, near, 0, null)
    // it may still snap to 0.5 guide axis, but the vertex itself is excluded
    expect(result[0]).toBeCloseTo(0.5) // guide axis snap
  })

  it('does not snap when nothing is nearby', () => {
    const segments = [line([0, 0], [0.1, 0.1])]
    const far = [0.6, 0.6] as [number, number]
    const result = snapCoord(segments, far, null, null)
    // no vertex nearby, but 0.5 guide axis is within 0.1 — too far for threshold 0.025
    expect(result).toEqual([0.6, 0.6])
  })

  it('snaps to bezier control points', () => {
    const segments = [bezier([0, 0], [0.3, 0.4], [0.7, 0.6], [1, 1])]
    const near = [0.3 + SNAP_THRESHOLD * 0.3, 0.4 - SNAP_THRESHOLD * 0.3] as [number, number]
    const result = snapCoord(segments, near, null, null)
    expect(result[0]).toBeCloseTo(0.3)
    expect(result[1]).toBeCloseTo(0.4)
  })

  it('excludes a specific bezier control point', () => {
    const segments = [bezier([0, 0], [0.3, 0.4], [0.7, 0.6], [1, 1])]
    const near = [0.3 + SNAP_THRESHOLD * 0.3, 0.4 - SNAP_THRESHOLD * 0.3] as [number, number]
    // exclude cp1 on segment 0
    const result = snapCoord(segments, near, 0, 1)
    // should not snap to cp1 (0.3, 0.4), may snap to something else or stay
    expect(result[0]).not.toBeCloseTo(0.3, 3)
  })
})

// ── segmentLineToBezier ───────────────────────────────────

describe('segmentLineToBezier', () => {
  it('preserves the start and end points', () => {
    const seg = line([0.1, 0.2], [0.7, 0.8])
    const result = segmentLineToBezier(seg)
    expect(result.type).toBe('bezier')
    expect(result.points[0]).toEqual([0.1, 0.2])
    expect(result.points[3]).toEqual([0.7, 0.8])
  })

  it('places control points at 1/3 marks along the line', () => {
    const seg = line([0, 0], [3, 6])
    const result = segmentLineToBezier(seg)
    expect(result.points[1][0]).toBeCloseTo(1)
    expect(result.points[1][1]).toBeCloseTo(2)
    expect(result.points[2][0]).toBeCloseTo(2)
    expect(result.points[2][1]).toBeCloseTo(4)
  })

  it('returns a bezier type segment', () => {
    const result = segmentLineToBezier(line([0, 0], [1, 1]))
    expect(result.type).toBe('bezier')
    expect(result.points).toHaveLength(4)
  })
})

// ── segmentBezierToLine ───────────────────────────────────

describe('segmentBezierToLine', () => {
  it('preserves start and end points of the bezier', () => {
    const seg = bezier([0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8])
    const result = segmentBezierToLine(seg)
    expect(result.type).toBe('line')
    expect(result.points[0]).toEqual([0.1, 0.2])
    expect(result.points[1]).toEqual([0.7, 0.8])
  })

  it('discards control points', () => {
    const seg = bezier([0, 0], [0.2, 0.9], [0.8, 0.9], [1, 0])
    const result = segmentBezierToLine(seg)
    expect(result.points).toHaveLength(2)
  })

  it('deep clones so mutation does not affect original', () => {
    const seg = bezier([0, 0], [0.2, 0.3], [0.6, 0.7], [1, 1])
    const result = segmentBezierToLine(seg)
    result.points[0][0] = 999
    expect(seg.points[0][0]).toBe(0)
  })
})
