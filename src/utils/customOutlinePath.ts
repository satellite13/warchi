/**
 * Build Path2D and SVG path string from custom outline segments.
 * Coordinates may be normalized 0–1 or in design space (e.g. 0–180, 0–80).
 * Контур растягивается по своему bounding box на полный размер узла (width × height).
 */
import type { OutlineSegment } from '@/types/shapes'

const DESIGN_WIDTH = 180
const DESIGN_HEIGHT = 80

/** Bounding box of all points in segments */
function getOutlineBounds(segments: OutlineSegment[]): { minX: number; maxX: number; minY: number; maxY: number } {
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

/** Map point from outline coords to node coords: fit bounding box to (0,0)-(width,height) */
function scalePoint(
  x: number,
  y: number,
  width: number,
  height: number,
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
  const tx = ((nx - bMinX) / rangeX) * width
  const ty = ((ny - bMinY) / rangeY) * height
  return [tx, ty]
}

export function customOutlineToPath2D(
  segments: OutlineSegment[],
  width: number,
  height: number
): Path2D {
  const path = new Path2D()
  if (segments.length === 0) return path
  const normalizeFromDesign = useDesignSpaceNormalize(segments)
  const bounds = getOutlineBounds(segments)
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const first = segments[0]!
  const [x0, y0] = scalePoint(first.points[0][0], first.points[0][1], w, h, normalizeFromDesign, bounds)
  path.moveTo(x0, y0)
  for (const seg of segments) {
    if (seg.type === "line") {
      const [x, y] = scalePoint(seg.points[1][0], seg.points[1][1], w, h, normalizeFromDesign, bounds)
      path.lineTo(x, y)
    } else {
      const [x1, y1] = scalePoint(seg.points[1][0], seg.points[1][1], w, h, normalizeFromDesign, bounds)
      const [x2, y2] = scalePoint(seg.points[2][0], seg.points[2][1], w, h, normalizeFromDesign, bounds)
      const [x3, y3] = scalePoint(seg.points[3][0], seg.points[3][1], w, h, normalizeFromDesign, bounds)
      path.bezierCurveTo(x1, y1, x2, y2, x3, y3)
    }
  }
  path.closePath()
  return path
}

export function customOutlineToSvgPath(
  segments: OutlineSegment[],
  width: number,
  height: number
): string {
  if (segments.length === 0) return ""
  const normalizeFromDesign = useDesignSpaceNormalize(segments)
  const bounds = getOutlineBounds(segments)
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const parts: string[] = []
  const first = segments[0]!
  const [x0, y0] = scalePoint(first.points[0][0], first.points[0][1], w, h, normalizeFromDesign, bounds)
  parts.push(`M ${x0} ${y0}`)
  for (const seg of segments) {
    if (seg.type === "line") {
      const [x, y] = scalePoint(seg.points[1][0], seg.points[1][1], w, h, normalizeFromDesign, bounds)
      parts.push(`L ${x} ${y}`)
    } else {
      const [x1, y1] = scalePoint(seg.points[1][0], seg.points[1][1], w, h, normalizeFromDesign, bounds)
      const [x2, y2] = scalePoint(seg.points[2][0], seg.points[2][1], w, h, normalizeFromDesign, bounds)
      const [x3, y3] = scalePoint(seg.points[3][0], seg.points[3][1], w, h, normalizeFromDesign, bounds)
      parts.push(`C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`)
    }
  }
  parts.push("Z")
  return parts.join(" ")
}
