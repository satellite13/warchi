import { clonePlainDeep } from '@/utils/clonePlainDeep'
import type { DiagramAttrs } from '../modelAttrs'

export const DEFAULT_LAYOUT_NODE_WIDTH = 160
export const DEFAULT_LAYOUT_NODE_HEIGHT = 90

export type LayoutNode = {
  id: string
  x: number
  y: number
  width?: number
  height?: number
}

export type LayoutBounds = { x: number; y: number; width: number; height: number }

export type ElkLayoutOptions = Record<string, string>

export type ElkGraphEdge = {
  id: string
  /** Present on input edges from buildElkGraph; ELK result edges may omit them. */
  sources?: string[]
  targets?: string[]
  sections?: Array<{
    startPoint: { x: number; y: number }
    endPoint: { x: number; y: number }
    bendPoints?: Array<{ x: number; y: number }>
  }>
}

export type ElkGraphNode = {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
  children?: ElkGraphNode[]
  edges?: ElkGraphEdge[]
  layoutOptions?: ElkLayoutOptions
}

export function nodeBounds(node: LayoutNode): LayoutBounds {
  return {
    x: node.x,
    y: node.y,
    width: node.width ?? DEFAULT_LAYOUT_NODE_WIDTH,
    height: node.height ?? DEFAULT_LAYOUT_NODE_HEIGHT,
  }
}

function area(b: LayoutBounds): number {
  return b.width * b.height
}

function fullyContains(outer: LayoutBounds, inner: LayoutBounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** Map childId → parentId for nodes in scope. Parent = smallest-area fully containing peer in scope. */
export function buildCompoundParentMap(
  nodes: LayoutNode[],
  scopeIds: Set<string>
): Map<string, string> {
  const scoped = nodes.filter(n => scopeIds.has(n.id))
  const bounds = new Map(scoped.map(n => [n.id, nodeBounds(n)] as const))
  const parent = new Map<string, string>()

  for (const child of scoped) {
    const cb = bounds.get(child.id)!
    let bestId: string | undefined
    let bestArea = Infinity
    for (const cand of scoped) {
      if (cand.id === child.id) continue
      const ob = bounds.get(cand.id)!
      if (area(ob) <= area(cb)) continue
      if (!fullyContains(ob, cb)) continue
      const a = area(ob)
      if (a < bestArea) {
        bestArea = a
        bestId = cand.id
      }
    }
    if (bestId) parent.set(child.id, bestId)
  }
  return parent
}

type LayoutEdgeInput = {
  id: string
  sourceInstanceId: string
  targetInstanceId: string
}

function childIdsOf(parentId: string, parentMap: Map<string, string>): string[] {
  const ids: string[] = []
  for (const [childId, pid] of parentMap) {
    if (pid === parentId) ids.push(childId)
  }
  return ids
}

function buildElkSubtree(
  nodeId: string,
  nodesById: Map<string, LayoutNode>,
  parentMap: Map<string, string>,
  parentWorld: { x: number; y: number }
): ElkGraphNode {
  const node = nodesById.get(nodeId)!
  const bounds = nodeBounds(node)
  const childIds = childIdsOf(nodeId, parentMap)
  return {
    id: nodeId,
    x: bounds.x - parentWorld.x,
    y: bounds.y - parentWorld.y,
    width: bounds.width,
    height: bounds.height,
    children:
      childIds.length > 0
        ? childIds.map(childId =>
            buildElkSubtree(childId, nodesById, parentMap, { x: bounds.x, y: bounds.y })
          )
        : undefined,
  }
}

export function buildElkGraph(
  nodes: LayoutNode[],
  edges: LayoutEdgeInput[],
  options: { scopeIds: Set<string>; layoutOptions: ElkLayoutOptions }
): ElkGraphNode {
  const { scopeIds, layoutOptions } = options
  const scoped = nodes.filter(n => scopeIds.has(n.id))
  const nodesById = new Map(scoped.map(n => [n.id, n] as const))
  const parentMap = buildCompoundParentMap(nodes, scopeIds)
  const rootIds = scoped.filter(n => !parentMap.has(n.id)).map(n => n.id)

  const scopedEdges = edges.filter(
    e => scopeIds.has(e.sourceInstanceId) && scopeIds.has(e.targetInstanceId)
  )

  return {
    id: 'root',
    layoutOptions,
    children: rootIds.map(id => buildElkSubtree(id, nodesById, parentMap, { x: 0, y: 0 })),
    edges: scopedEdges.map(e => ({
      id: e.id,
      sources: [e.sourceInstanceId],
      targets: [e.targetInstanceId],
    })),
  }
}

function flattenAbsolute(
  node: ElkGraphNode,
  offsetX: number,
  offsetY: number,
  out: Map<string, { x: number; y: number; width: number; height: number }>
): void {
  const x = offsetX + (node.x ?? 0)
  const y = offsetY + (node.y ?? 0)
  if (node.id !== 'root') {
    out.set(node.id, {
      x,
      y,
      width: node.width ?? DEFAULT_LAYOUT_NODE_WIDTH,
      height: node.height ?? DEFAULT_LAYOUT_NODE_HEIGHT,
    })
  }
  for (const child of node.children ?? []) {
    // Root children: ELK x/y are already absolute world coords.
    flattenAbsolute(child, node.id === 'root' ? 0 : x, node.id === 'root' ? 0 : y, out)
  }
}

function collectElkEdges(node: ElkGraphNode, out: Map<string, ElkGraphEdge>): void {
  for (const edge of node.edges ?? []) {
    out.set(edge.id, edge)
  }
  for (const child of node.children ?? []) {
    collectElkEdges(child, out)
  }
}

export function applyElkLayout(
  diagram: DiagramAttrs,
  elkResult: ElkGraphNode,
  scopeIds: Set<string>
): DiagramAttrs {
  const next = clonePlainDeep(diagram)

  const positions = new Map<string, { x: number; y: number; width: number; height: number }>()
  flattenAbsolute(elkResult, 0, 0, positions)

  for (const node of next.instances.nodes) {
    if (!scopeIds.has(node.id)) continue
    const pos = positions.get(node.id)
    if (!pos) continue
    node.x = pos.x
    node.y = pos.y
    node.width = pos.width
    node.height = pos.height
  }

  const elkEdges = new Map<string, ElkGraphEdge>()
  collectElkEdges(elkResult, elkEdges)

  for (const edge of next.instances.edges) {
    const elkEdge = elkEdges.get(edge.id)
    if (!elkEdge) continue
    if (!scopeIds.has(edge.sourceInstanceId) || !scopeIds.has(edge.targetInstanceId)) continue

    // Do not copy ELK bendPoints into editable-polyline: papirus anchors differ from
    // ELK start/end, so middle bends produce slanted first/last segments. Use papirus
    // orthogonal `polyline` routing instead (straight when aligned, right-angle bends otherwise).
    if (!edge.attrs) edge.attrs = {}
    const existingStyle =
      edge.attrs.diagramStyle && typeof edge.attrs.diagramStyle === 'object'
        ? (edge.attrs.diagramStyle as Record<string, unknown>)
        : {}
    delete edge.attrs.controlPoints
    edge.attrs.diagramStyle = { ...existingStyle, edgeType: 'polyline' }
  }

  return next
}
