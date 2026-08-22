import type { DiagramAttrs } from '../modelAttrs'

export type ControlPoint = { x: number; y: number }

export type NodeInstanceBinding = { instanceId: string }

export type EdgeInstanceBinding = { edgeId: string }

export type DiagramNodeLike = {
  x: number
  y: number
  width: number
  height: number
}

export type DiagramEdgeLike = {
  type?: string
  controlPoints?: unknown
}

export const readControlPointsFromAttrs = (
  attrs: Record<string, unknown> | undefined
): ControlPoint[] => {
  const raw = attrs?.controlPoints
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (point): point is { x: number; y: number } =>
        Boolean(point) &&
        typeof point === 'object' &&
        typeof (point as { x?: unknown }).x === 'number' &&
        typeof (point as { y?: unknown }).y === 'number'
    )
    .map(point => ({ x: point.x, y: point.y }))
}

export const readControlPointsFromEdge = (edge: DiagramEdgeLike): ControlPoint[] => {
  const raw = edge.controlPoints
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (point): point is { x: number; y: number } =>
        Boolean(point) &&
        typeof point === 'object' &&
        typeof (point as { x?: unknown }).x === 'number' &&
        typeof (point as { y?: unknown }).y === 'number'
    )
    .map(point => ({ x: point.x, y: point.y }))
}

export const areControlPointsEqual = (a: ControlPoint[], b: ControlPoint[]): boolean =>
  a.length === b.length &&
  a.every((point, index) => point.x === b[index]?.x && point.y === b[index]?.y)

export function applyNodePositionsToDiagram(
  diagramAttrs: DiagramAttrs,
  papNodeIds: string[],
  nodeIdToInstance: Map<string, NodeInstanceBinding>,
  getNodeByPapId: (papNodeId: string) => DiagramNodeLike | null | undefined
): boolean {
  let changed = false
  for (const papNodeId of papNodeIds) {
    const entity = nodeIdToInstance.get(papNodeId)
    if (!entity) continue
    const papNode = getNodeByPapId(papNodeId)
    if (!papNode) continue
    const instance = diagramAttrs.instances.nodes.find(n => n.id === entity.instanceId)
    if (!instance) continue
    if (
      instance.x !== papNode.x ||
      instance.y !== papNode.y ||
      instance.width !== papNode.width ||
      instance.height !== papNode.height
    ) {
      instance.x = papNode.x
      instance.y = papNode.y
      instance.width = papNode.width
      instance.height = papNode.height
      changed = true
    }
  }
  return changed
}

export function applyEditablePolylineControlPointChangesToDiagram(
  diagramAttrs: DiagramAttrs,
  edgeIdToInstance: Map<string, EdgeInstanceBinding>,
  getEdgeByPapId: (papEdgeId: string) => DiagramEdgeLike | null | undefined
): boolean {
  let changed = false

  for (const [papEdgeId, entity] of edgeIdToInstance) {
    const papEdge = getEdgeByPapId(papEdgeId)
    if (!papEdge || papEdge.type !== 'editable-polyline') continue

    const edgeInst = diagramAttrs.instances.edges.find(edge => edge.id === entity.edgeId)
    if (!edgeInst) continue

    const nextControlPoints = readControlPointsFromEdge(papEdge)
    const currentControlPoints = readControlPointsFromAttrs(edgeInst.attrs)
    if (areControlPointsEqual(nextControlPoints, currentControlPoints)) continue

    if (!edgeInst.attrs) edgeInst.attrs = {}
    if (nextControlPoints.length > 0) edgeInst.attrs.controlPoints = nextControlPoints
    else delete edgeInst.attrs.controlPoints

    if (Object.keys(edgeInst.attrs).length === 0) {
      delete edgeInst.attrs
    }
    changed = true
  }

  return changed
}

export function applyNodeAndEditablePolylineChangesToDiagram(
  diagramAttrs: DiagramAttrs,
  papNodeIds: string[],
  nodeIdToInstance: Map<string, NodeInstanceBinding>,
  edgeIdToInstance: Map<string, EdgeInstanceBinding>,
  getNodeByPapId: (papNodeId: string) => DiagramNodeLike | null | undefined,
  getEdgeByPapId: (papEdgeId: string) => DiagramEdgeLike | null | undefined
): { nodeChanged: boolean; controlPointsChanged: boolean } {
  const nodeChanged = applyNodePositionsToDiagram(
    diagramAttrs,
    papNodeIds,
    nodeIdToInstance,
    getNodeByPapId
  )
  const controlPointsChanged = applyEditablePolylineControlPointChangesToDiagram(
    diagramAttrs,
    edgeIdToInstance,
    getEdgeByPapId
  )
  return { nodeChanged, controlPointsChanged }
}

export type PersistHistoryRendererLayoutInput = {
  source: DiagramAttrs
  papNodeIds: string[]
  nodeIdToInstance: Map<string, NodeInstanceBinding>
  edgeIdToInstance: Map<string, EdgeInstanceBinding>
  getNodeByPapId: (papNodeId: string) => DiagramNodeLike | null | undefined
  getEdgeByPapId: (papEdgeId: string) => DiagramEdgeLike | null | undefined
}

/**
 * After papirus undo/redo, write current renderer nodes and editable-polyline
 * bends into one attrs snapshot. Splitting those writes lets syncDiagram
 * re-apply stale controlPoints from the first emit.
 */
export function persistHistoryRendererLayout(
  input: PersistHistoryRendererLayoutInput
): { next: DiagramAttrs; changed: boolean } {
  const next = JSON.parse(JSON.stringify(input.source)) as DiagramAttrs
  const { nodeChanged, controlPointsChanged } = applyNodeAndEditablePolylineChangesToDiagram(
    next,
    input.papNodeIds,
    input.nodeIdToInstance,
    input.edgeIdToInstance,
    input.getNodeByPapId,
    input.getEdgeByPapId
  )
  return { next, changed: nodeChanged || controlPointsChanged }
}
