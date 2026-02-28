/**
 * Build Path2D and SVG path string from custom outline segments (normalized 0–1).
 * Used for canvas rendering and SVG export when nodeShape === 'custom'.
 * Контур рассчитан на базовый размер 180×80; вписывается в (width, height) с сохранением пропорций (contain).
 */
import type { OutlineSegment } from "../features/notations/notationAttrs"

const BASE_DESIGN_WIDTH = 180
const BASE_DESIGN_HEIGHT = 80

function fitContain(
  nodeWidth: number,
  nodeHeight: number
): { offsetX: number; offsetY: number; contentW: number; contentH: number } {
  const scale = Math.min(
    nodeWidth / BASE_DESIGN_WIDTH,
    nodeHeight / BASE_DESIGN_HEIGHT
  )
  const contentW = BASE_DESIGN_WIDTH * scale
  const contentH = BASE_DESIGN_HEIGHT * scale
  const offsetX = (nodeWidth - contentW) / 2
  const offsetY = (nodeHeight - contentH) / 2
  return { offsetX, offsetY, contentW, contentH }
}

function scalePoint(
  x: number,
  y: number,
  offsetX: number,
  offsetY: number,
  contentW: number,
  contentH: number
): [number, number] {
  return [offsetX + x * contentW, offsetY + y * contentH]
}

export function customOutlineToPath2D(
  segments: OutlineSegment[],
  width: number,
  height: number
): Path2D {
  const path = new Path2D()
  if (segments.length === 0) return path
  const { offsetX, offsetY, contentW, contentH } = fitContain(width, height)
  const first = segments[0]!
  const [x0, y0] = scalePoint(
    first.points[0][0],
    first.points[0][1],
    offsetX,
    offsetY,
    contentW,
    contentH
  )
  path.moveTo(x0, y0)
  for (const seg of segments) {
    if (seg.type === "line") {
      const [x, y] = scalePoint(
        seg.points[1][0],
        seg.points[1][1],
        offsetX,
        offsetY,
        contentW,
        contentH
      )
      path.lineTo(x, y)
    } else {
      const [x1, y1] = scalePoint(
        seg.points[1][0],
        seg.points[1][1],
        offsetX,
        offsetY,
        contentW,
        contentH
      )
      const [x2, y2] = scalePoint(
        seg.points[2][0],
        seg.points[2][1],
        offsetX,
        offsetY,
        contentW,
        contentH
      )
      const [x3, y3] = scalePoint(
        seg.points[3][0],
        seg.points[3][1],
        offsetX,
        offsetY,
        contentW,
        contentH
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
  height: number
): string {
  if (segments.length === 0) return ""
  const { offsetX, offsetY, contentW, contentH } = fitContain(width, height)
  const parts: string[] = []
  const first = segments[0]!
  const [x0, y0] = scalePoint(
    first.points[0][0],
    first.points[0][1],
    offsetX,
    offsetY,
    contentW,
    contentH
  )
  parts.push(`M ${x0} ${y0}`)
  for (const seg of segments) {
    if (seg.type === "line") {
      const [x, y] = scalePoint(
        seg.points[1][0],
        seg.points[1][1],
        offsetX,
        offsetY,
        contentW,
        contentH
      )
      parts.push(`L ${x} ${y}`)
    } else {
      const [x1, y1] = scalePoint(
        seg.points[1][0],
        seg.points[1][1],
        offsetX,
        offsetY,
        contentW,
        contentH
      )
      const [x2, y2] = scalePoint(
        seg.points[2][0],
        seg.points[2][1],
        offsetX,
        offsetY,
        contentW,
        contentH
      )
      const [x3, y3] = scalePoint(
        seg.points[3][0],
        seg.points[3][1],
        offsetX,
        offsetY,
        contentW,
        contentH
      )
      parts.push(`C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`)
    }
  }
  parts.push("Z")
  return parts.join(" ")
}
