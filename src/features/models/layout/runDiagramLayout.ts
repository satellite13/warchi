import type { DiagramAttrs } from '../modelAttrs'
import {
  applyElkLayout,
  buildElkGraph,
  nodeBounds,
  type ElkGraphNode,
  type LayoutNode,
} from './diagramLayoutGraph'
import { getElk } from './elkLoader'
import {
  defaultLayoutUiOptions,
  toElkLayoutOptions,
  type LayoutUiOptions,
} from './layoutOptions'

export type DiagramLayoutMode = 'layered' | 'overlap'
export type LayoutDirection = 'RIGHT' | 'DOWN'

export type RunDiagramLayoutInput = {
  diagram: DiagramAttrs
  mode: DiagramLayoutMode
  /** @deprecated ignored — layout always uses full diagram */
  selectedInstanceIds?: string[]
  uiOptions?: LayoutUiOptions
}

export type RunDiagramLayoutResult =
  | { status: 'noop' }
  | { status: 'ok'; diagram: DiagramAttrs }
  | { status: 'error'; message: string }

type LayoutEdgeLike = {
  sourceInstanceId: string
  targetInstanceId: string
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2
  }
  return sorted[mid]!
}

export function resolveLayoutScopeIds(selectedIds: string[], allIds: string[]): Set<string> {
  if (selectedIds.length > 0) {
    return new Set(selectedIds)
  }
  return new Set(allIds)
}

export function inferLayoutDirection(
  nodes: LayoutNode[],
  edges: LayoutEdgeLike[],
  scopeIds: Set<string>
): LayoutDirection {
  const nodesById = new Map(nodes.filter(n => scopeIds.has(n.id)).map(n => [n.id, n] as const))

  const dxValues: number[] = []
  const dyValues: number[] = []

  for (const edge of edges) {
    if (!scopeIds.has(edge.sourceInstanceId) || !scopeIds.has(edge.targetInstanceId)) continue
    const source = nodesById.get(edge.sourceInstanceId)
    const target = nodesById.get(edge.targetInstanceId)
    if (!source || !target) continue

    const sb = nodeBounds(source)
    const tb = nodeBounds(target)
    const scx = sb.x + sb.width / 2
    const scy = sb.y + sb.height / 2
    const tcx = tb.x + tb.width / 2
    const tcy = tb.y + tb.height / 2

    dxValues.push(Math.abs(tcx - scx))
    dyValues.push(Math.abs(tcy - scy))
  }

  if (dxValues.length === 0) {
    return 'RIGHT'
  }

  const medianDx = median(dxValues)
  const medianDy = median(dyValues)

  return medianDx >= medianDy ? 'RIGHT' : 'DOWN'
}

export async function runDiagramLayout(
  input: RunDiagramLayoutInput
): Promise<RunDiagramLayoutResult> {
  const { diagram, mode, uiOptions: uiOptionsInput } = input
  const allIds = diagram.instances.nodes.map(n => n.id)
  const scopeIds = new Set(allIds)

  if (scopeIds.size < 2) {
    return { status: 'noop' }
  }

  try {
    const nodes: LayoutNode[] = diagram.instances.nodes.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }))

    const edges = diagram.instances.edges.map(e => ({
      id: e.id,
      sourceInstanceId: e.sourceInstanceId,
      targetInstanceId: e.targetInstanceId,
    }))

    const ui = { ...defaultLayoutUiOptions(mode), ...uiOptionsInput }
    let resolvedDirection: LayoutDirection | undefined
    if (mode === 'layered' && ui.direction === 'AUTO') {
      resolvedDirection = inferLayoutDirection(nodes, edges, scopeIds)
    }
    const layoutOptions = toElkLayoutOptions(mode, ui, resolvedDirection)

    const graph = buildElkGraph(nodes, edges, { scopeIds, layoutOptions })

    const elk = await getElk()
    const result = await elk.layout(graph)
    const nextDiagram = applyElkLayout(diagram, result as ElkGraphNode, scopeIds)
    return { status: 'ok', diagram: nextDiagram }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'error', message }
  }
}
