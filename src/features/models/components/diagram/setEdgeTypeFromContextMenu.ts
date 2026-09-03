import type { EdgePathType } from '@ngroznykh/papirus'
import type { DiagramStyle } from '@/domain/attrs/notationAttrs'
import type { DiagramAttrs } from '../../modelAttrs'
import { mergeEffectiveDiagramStyle } from '../../utils/diagramCanvasBuilders'

/**
 * Mutates a cloned `next` diagram attrs to apply edge path type from the context menu.
 * Returns false when the edge is missing or the type is already current.
 */
export function applyEdgeTypeFromContextMenu(
  next: DiagramAttrs,
  edgeInstanceId: string,
  edgeType: EdgePathType,
  getBoundRelationStyle: (modelLinkId: string) => DiagramStyle | undefined
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
  return true
}
