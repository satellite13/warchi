import type { Ref } from 'vue'
import type { NodeStyle } from '../notationAttrs'
import type {
  NotationEditorState,
  EditorNodeType,
  EditorLinkType,
  EditorComponent,
  EditorRelation,
} from '../types'

export type ResolvedStyle = {
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeOpacity: number
  strokeWidth: number
}

export type ExtendedNotationNodeStyle = NodeStyle & {
  fillOpacity?: number
  strokeOpacity?: number
}

export type RelationEdgeStyle = {
  strokeColor: string
  strokeOpacity?: number
  strokeWidth: number
}

export const COMPONENT_STYLE: ResolvedStyle = {
  fillColor: '#e0f2fe',
  fillOpacity: 1,
  strokeColor: '#0284c7',
  strokeOpacity: 1,
  strokeWidth: 2,
}

export const RELATION_EDGE_STYLE: RelationEdgeStyle = {
  strokeColor: '#7c3aed',
  strokeOpacity: 1,
  strokeWidth: 2,
}

export const NODE_WIDTH = 140
export const NODE_HEIGHT = 50
export const COMPONENT_RADIUS = 8

export function useNotationStyles(state: Ref<NotationEditorState>) {
  function mergeStyle(base: ResolvedStyle, override?: ExtendedNotationNodeStyle): ResolvedStyle {
    return {
      fillColor: override?.fillColor ?? base.fillColor,
      fillOpacity: override?.fillOpacity ?? base.fillOpacity,
      strokeColor: override?.strokeColor ?? base.strokeColor,
      strokeOpacity: override?.strokeOpacity ?? base.strokeOpacity,
      strokeWidth: override?.strokeWidth ?? base.strokeWidth,
    }
  }

  function resolveComponentTypeStyle(typeItem: EditorNodeType | undefined) {
    const baseStyle = COMPONENT_STYLE
    const width =
      typeof typeItem?.parsedAttrs.width === 'number' ? typeItem.parsedAttrs.width : NODE_WIDTH
    const height =
      typeof typeItem?.parsedAttrs.height === 'number' ? typeItem.parsedAttrs.height : NODE_HEIGHT
    const style: ResolvedStyle = mergeStyle(baseStyle, typeItem?.parsedAttrs.style)
    const cornerRadius =
      typeof typeItem?.parsedAttrs.cornerRadius === 'number'
        ? typeItem.parsedAttrs.cornerRadius
        : typeof typeItem?.parsedAttrs.style?.cornerRadius === 'number'
          ? typeItem.parsedAttrs.style.cornerRadius
          : COMPONENT_RADIUS
    return { style, width, height, cornerRadius }
  }

  function resolveRelationEdgeStyle(typeItem: EditorLinkType | undefined) {
    const base = RELATION_EDGE_STYLE
    const rawStyle = typeItem?.parsedAttrs.style as ExtendedNotationNodeStyle | undefined
    const strokeColor = rawStyle?.strokeColor ?? base.strokeColor
    const strokeOpacity = rawStyle?.strokeOpacity ?? base.strokeOpacity
    const strokeWidth = rawStyle?.strokeWidth ?? base.strokeWidth
    return { strokeColor, strokeOpacity, strokeWidth }
  }

  function resolveComponentStyle(item: EditorComponent) {
    const typeItem = state.value.nodeTypes.find((type) => type.id === item.nodeTypeId)
    const base = resolveComponentTypeStyle(typeItem)
    const ds = item.parsedAttrs.diagramStyle
    if (!ds) return base
    return {
      style: {
        fillColor: ds.fillColor ?? base.style.fillColor,
        fillOpacity: ds.fillOpacity ?? base.style.fillOpacity ?? 1,
        strokeColor: ds.strokeColor ?? base.style.strokeColor,
        strokeOpacity: ds.strokeOpacity ?? base.style.strokeOpacity ?? 1,
        strokeWidth: ds.strokeWidth ?? base.style.strokeWidth,
        ...(ds.opacity != null ? { opacity: ds.opacity } : {}),
        ...(ds.lineDash ? { lineDash: ds.lineDash } : {}),
      } as ResolvedStyle,
      width: ds.width ?? base.width,
      height: ds.height ?? base.height,
      cornerRadius: ds.cornerRadius ?? base.cornerRadius,
    }
  }

  function resolveRelationStyle(item: EditorRelation) {
    const typeItem = state.value.linkTypes.find((type) => type.id === item.linkTypeId)
    const base = resolveRelationEdgeStyle(typeItem)
    const ds = item.parsedAttrs.diagramStyle
    if (!ds) return base
    return {
      strokeColor: ds.strokeColor ?? base.strokeColor,
      strokeOpacity: ds.strokeOpacity ?? base.strokeOpacity ?? 1,
      strokeWidth: ds.strokeWidth ?? base.strokeWidth,
    }
  }

  return {
    mergeStyle,
    resolveComponentTypeStyle,
    resolveRelationEdgeStyle,
    resolveComponentStyle,
    resolveRelationStyle,
  }
}
