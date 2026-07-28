import type { DiagramAttrs } from '../modelAttrs'
import {
  DEFAULT_LAYOUT_NODE_HEIGHT,
  DEFAULT_LAYOUT_NODE_WIDTH,
} from './diagramLayoutGraph'

export type SketchPoint = { x: number; y: number }
export type SketchNode = { id: string; x: number; y: number; width: number; height: number }
export type SketchEdge = { id: string; points: SketchPoint[] }
export type LayoutSketchModel = {
  viewBox: { x: number; y: number; width: number; height: number }
  nodes: SketchNode[]
  edges: SketchEdge[]
}

function nodeCenter(n: SketchNode): SketchPoint {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
}

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
  const byId = new Map(nodes.map(n => [n.id, n]))

  const edges: SketchEdge[] = []
  for (const e of diagram.instances.edges) {
    const s = byId.get(e.sourceInstanceId)
    const t = byId.get(e.targetInstanceId)
    if (!s || !t) continue
    const cps = (e.attrs?.controlPoints as SketchPoint[] | undefined) ?? []
    const points = [nodeCenter(s), ...cps, nodeCenter(t)]
    edges.push({ id: e.id, points })
  }

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
  for (const e of edges) {
    for (const p of e.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (!Number.isFinite(minX)) {
    return { viewBox: { x: 0, y: 0, width: 100, height: 100 }, nodes, edges }
  }
  return {
    viewBox: {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    },
    nodes,
    edges,
  }
}

export function pointsToSvgPath(points: SketchPoint[]): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  return `M ${first!.x} ${first!.y}` + rest.map(p => ` L ${p.x} ${p.y}`).join('')
}
