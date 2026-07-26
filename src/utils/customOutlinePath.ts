/**
 * Build Path2D and SVG path string from custom outline segments.
 * Coordinates may be normalized 0–1 or in design space (e.g. 0–180, 0–80).
 * Without scaleSlice the outline stretches uniformly to width × height.
 * With scaleSlice, corners stay at fixed px insets (9-slice).
 */
import type { OutlineSegment, ScaleSlice } from '@/types/shapes'
import { hasEffectiveScaleSlice } from '@/types/shapes'

const DESIGN_WIDTH = 180
const DESIGN_HEIGHT = 80

/** Bounding box of all points in segments */
function getOutlineBounds(segments: OutlineSegment[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const seg of segments) {
    for (const p of seg.points) {
      const [x, y] = p
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  return { minX, maxX, minY, maxY }
}

/** Detect if outline is in design-space (e.g. 0..180, 0..80) by sampling first point */
function useDesignSpaceNormalize(segments: OutlineSegment[]): boolean {
  if (segments.length === 0) return false
  const [x, y] = segments[0]!.points[0]!
  return x > 1.5 || y > 1.5
}

function toUnitCoords(
  x: number,
  y: number,
  normalizeFromDesign: boolean,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): [number, number] {
  const nx = normalizeFromDesign ? x / DESIGN_WIDTH : x
  const ny = normalizeFromDesign ? y / DESIGN_HEIGHT : y
  const bMinX = normalizeFromDesign ? bounds.minX / DESIGN_WIDTH : bounds.minX
  const bMaxX = normalizeFromDesign ? bounds.maxX / DESIGN_WIDTH : bounds.maxX
  const bMinY = normalizeFromDesign ? bounds.minY / DESIGN_HEIGHT : bounds.minY
  const bMaxY = normalizeFromDesign ? bounds.maxY / DESIGN_HEIGHT : bounds.maxY
  const rangeX = bMaxX - bMinX || 1
  const rangeY = bMaxY - bMinY || 1
  return [(nx - bMinX) / rangeX, (ny - bMinY) / rangeY]
}

/** Map one axis from unit [0,1] through 9-slice into [0, size]. */
export function mapSliceAxis(
  n: number,
  size: number,
  insetStart: number,
  insetEnd: number,
  refSize: number
): number {
  let startPx = Math.max(0, insetStart)
  let endPx = Math.max(0, insetEnd)
  if (startPx + endPx > size) {
    const scale = size / (startPx + endPx)
    startPx *= scale
    endPx *= scale
  }

  let startNorm = refSize > 0 ? insetStart / refSize : 0
  let endNorm = refSize > 0 ? insetEnd / refSize : 0
  if (startNorm + endNorm > 1) {
    const scale = 1 / (startNorm + endNorm)
    startNorm *= scale
    endNorm *= scale
  }

  if (n <= startNorm) {
    return startNorm > 0 ? (n / startNorm) * startPx : 0
  }
  if (n >= 1 - endNorm) {
    const t = endNorm > 0 ? (n - (1 - endNorm)) / endNorm : 1
    return size - endPx + t * endPx
  }

  const midNormStart = startNorm
  const midNormEnd = 1 - endNorm
  const midPxStart = startPx
  const midPxEnd = size - endPx
  const t =
    midNormEnd > midNormStart ? (n - midNormStart) / (midNormEnd - midNormStart) : 0
  return midPxStart + t * (midPxEnd - midPxStart)
}

function scalePoint(
  x: number,
  y: number,
  width: number,
  height: number,
  normalizeFromDesign: boolean,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  slice: ScaleSlice | null | undefined
): [number, number] {
  const [ux, uy] = toUnitCoords(x, y, normalizeFromDesign, bounds)
  if (!hasEffectiveScaleSlice(slice)) {
    return [ux * width, uy * height]
  }
  const s = slice!
  return [
    mapSliceAxis(ux, width, s.left, s.right, s.refWidth),
    mapSliceAxis(uy, height, s.top, s.bottom, s.refHeight),
  ]
}

export function customOutlineToPath2D(
  segments: OutlineSegment[],
  width: number,
  height: number,
  slice?: ScaleSlice | null
): Path2D {
  const path = new Path2D()
  if (segments.length === 0) return path
  const normalizeFromDesign = useDesignSpaceNormalize(segments)
  const bounds = getOutlineBounds(segments)
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const first = segments[0]!
  const [x0, y0] = scalePoint(
    first.points[0][0],
    first.points[0][1],
    w,
    h,
    normalizeFromDesign,
    bounds,
    slice
  )
  path.moveTo(x0, y0)
  for (const seg of segments) {
    if (seg.type === 'line') {
      const [x, y] = scalePoint(
        seg.points[1][0],
        seg.points[1][1],
        w,
        h,
        normalizeFromDesign,
        bounds,
        slice
      )
      path.lineTo(x, y)
    } else {
      const [x1, y1] = scalePoint(
        seg.points[1][0],
        seg.points[1][1],
        w,
        h,
        normalizeFromDesign,
        bounds,
        slice
      )
      const [x2, y2] = scalePoint(
        seg.points[2][0],
        seg.points[2][1],
        w,
        h,
        normalizeFromDesign,
        bounds,
        slice
      )
      const [x3, y3] = scalePoint(
        seg.points[3][0],
        seg.points[3][1],
        w,
        h,
        normalizeFromDesign,
        bounds,
        slice
      )
      path.bezierCurveTo(x1, y1, x2, y2, x3, y3)
    }
  }
  path.closePath()
  return path
}

export function customOutlineToSvgPath(
  segments: OutlineSegment[],
  width: number,
  height: number,
  slice?: ScaleSlice | null
): string {
  if (segments.length === 0) return ''
  const normalizeFromDesign = useDesignSpaceNormalize(segments)
  const bounds = getOutlineBounds(segments)
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const parts: string[] = []
  const first = segments[0]!
  const [x0, y0] = scalePoint(
    first.points[0][0],
    first.points[0][1],
    w,
    h,
    normalizeFromDesign,
    bounds,
    slice
  )
  parts.push(`M ${x0} ${y0}`)
  for (const seg of segments) {
    if (seg.type === 'line') {
      const [x, y] = scalePoint(
        seg.points[1][0],
        seg.points[1][1],
        w,
        h,
        normalizeFromDesign,
        bounds,
        slice
      )
      parts.push(`L ${x} ${y}`)
    } else {
      const [x1, y1] = scalePoint(
        seg.points[1][0],
        seg.points[1][1],
        w,
        h,
        normalizeFromDesign,
        bounds,
        slice
      )
      const [x2, y2] = scalePoint(
        seg.points[2][0],
        seg.points[2][1],
        w,
        h,
        normalizeFromDesign,
        bounds,
        slice
      )
      const [x3, y3] = scalePoint(
        seg.points[3][0],
        seg.points[3][1],
        w,
        h,
        normalizeFromDesign,
        bounds,
        slice
      )
      parts.push(`C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`)
    }
  }
  parts.push('Z')
  return parts.join(' ')
}
