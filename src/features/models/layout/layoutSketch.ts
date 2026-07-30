import type { DiagramAttrs } from '../modelAttrs'
import {
  DEFAULT_LAYOUT_NODE_HEIGHT,
  DEFAULT_LAYOUT_NODE_WIDTH,
} from './diagramLayoutGraph'

export type SketchNode = { id: string; x: number; y: number; width: number; height: number }
export type LayoutSketchModel = {
  viewBox: { x: number; y: number; width: number; height: number }
  nodes: SketchNode[]
}

/** Node-only preview sketch — edges omit because papirus orthogonal routes ≠ center lines. */
export function buildLayoutSketchModel(
  diagram: DiagramAttrs,
  padding = 24
): LayoutSketchModel {
  const nodes: SketchNode[] = diagram.instances.nodes.map(n => ({
    id: n.id,
    x: n.x,
    y: n.y,
    width: n.width ?? DEFAULT_LAYOUT_NODE_WIDTH,
    height: n.height ?? DEFAULT_LAYOUT_NODE_HEIGHT,
  }))

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  if (!Number.isFinite(minX)) {
    return { viewBox: { x: 0, y: 0, width: 100, height: 100 }, nodes }
  }
  return {
    viewBox: {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    },
    nodes,
  }
}
