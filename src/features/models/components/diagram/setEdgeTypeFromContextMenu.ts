import type { EdgePathType } from '@ngroznykh/papirus'
import type { DiagramStyle } from '@/domain/attrs/notationAttrs'
import type { DiagramAttrs } from '../../modelAttrs'
import { mergeEffectiveDiagramStyle } from '../../utils/diagramCanvasBuilders'

export type DiagramPoint = { x: number; y: number }

/** Interior vertices of a routed polyline, without the two endpoints. */
export function polylineInteriorBends(
  path: ReadonlyArray<DiagramPoint> | undefined
): DiagramPoint[] {
  if (!path || path.length < 3) return []
  const bends: DiagramPoint[] = []
  for (let index = 1; index < path.length - 1; index++) {
    const point = path[index]!
    const prev = bends.length > 0 ? bends[bends.length - 1]! : path[0]!
    if (point.x === prev.x && point.y === prev.y) continue
    bends.push({ x: point.x, y: point.y })
  }
  return bends
}

/**
 * Mutates a cloned `next` diagram attrs to apply edge path type from the context menu.
 * Returns false when the edge is missing or the type is already current.
 *
 * `renderedPath` is the polyline currently on screen. Switching that route to an
 * editable polyline keeps those bends; otherwise the edge collapses to a midpoint
 * and the next sync draws the auto-route again.
 */
export function applyEdgeTypeFromContextMenu(
  next: DiagramAttrs,
  edgeInstanceId: string,
  edgeType: EdgePathType,
  getBoundRelationStyle: (modelLinkId: string) => DiagramStyle | undefined,
  renderedPath?: ReadonlyArray<DiagramPoint>
): boolean {
  const edgeInst = next.instances.edges.find(edge => edge.id === edgeInstanceId)
  if (!edgeInst) return false

  const instanceStyle =
    edgeInst.attrs?.diagramStyle && typeof edgeInst.attrs.diagramStyle === 'object'
      ? (edgeInst.attrs.diagramStyle as DiagramStyle)
      : undefined
  const effective =
    mergeEffectiveDiagramStyle(getBoundRelationStyle(edgeInst.modelLinkId), instanceStyle) ?? {}

  const currentType = (effective.edgeType as EdgePathType | undefined) ?? 'bezier'
  if (currentType === edgeType) return false

  if (!edgeInst.attrs) edgeInst.attrs = {}
  // Persist full effective style + new type so relation label/stroke fields are not dropped
  // when instance diagramStyle previously held only `{ edgeType }` (e.g. after auto-layout).
  edgeInst.attrs.diagramStyle = {
    ...effective,
    edgeType,
  }
  const fromPolyline = currentType === 'polyline' || currentType === 'editable-polyline'
  const toNonPolyline = edgeType === 'bezier' || edgeType === 'straight'
  if (fromPolyline && toNonPolyline && edgeInst.attrs.controlPoints) {
    delete edgeInst.attrs.controlPoints
  }
  if (currentType === 'polyline' && edgeType === 'editable-polyline') {
    const bends = polylineInteriorBends(renderedPath)
    if (bends.length > 0) {
      edgeInst.attrs.controlPoints = bends
    }
  }
  return true
}

type EdgeTypeHistory = {
  execute: (command: { execute: () => void; undo: () => void }) => void
}

/**
 * Context-menu type changes are papirus history commands. `history.change` then
 * persists the renderer from props that Vue has not flushed yet, so a port or
 * anchor diff used to emit the previous edge type and the first click did nothing.
 * Apply the snapshot while canvas persist is suppressed.
 */
export function commitEdgeTypeChange(input: {
  history: EdgeTypeHistory | null | undefined
  runWithoutCanvasPersist: (action: () => void) => void
  apply: (attrs: DiagramAttrs) => void
  before: DiagramAttrs
  after: DiagramAttrs
}): void {
  const { history, runWithoutCanvasPersist, apply, before, after } = input
  if (history && typeof history.execute === 'function') {
    history.execute({
      execute: () => runWithoutCanvasPersist(() => apply(after)),
      undo: () => runWithoutCanvasPersist(() => apply(before)),
    })
    return
  }
  apply(after)
}
