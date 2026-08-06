import type {
  ArrowMarkerConfig,
  EdgePathType,
  EdgeStyle,
  NodeImageOptions,
  TextLabelOptions,
  TextStyle,
} from '@ngroznykh/papirus'
import type { CustomProperty, DiagramStyle } from '@/domain/attrs/notationAttrs'
import { resolveDiagramEdgeLabelTemplate } from './edgeLabelTemplate'
import {
  buildEdgeLabel as buildNotationEdgeLabel,
  buildEdgeLabelBackground as buildNotationEdgeLabelBackground,
  buildMarker,
  buildNodeIcon,
} from '@/features/notations/utils/notationElementBuilders'

const VALID_ICON_PLACEMENTS = new Set<NodeImageOptions['placement']>([
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
])

export type ModelEdgeOptions = Partial<{
  type: EdgePathType
  style: EdgeStyle
  startMarker: ArrowMarkerConfig
  endMarker: ArrowMarkerConfig
  labelOffset: number
  labelPosition: number
  labelFollowPath: boolean
  labelLineGap: boolean
}>

export function buildModelNodeIcon(ds?: DiagramStyle): NodeImageOptions | undefined {
  const icon = buildNodeIcon(ds)
  if (!icon) return undefined
  if (ds?.iconPlacement && VALID_ICON_PLACEMENTS.has(ds.iconPlacement as NodeImageOptions['placement'])) {
    return icon
  }
  return { ...icon, placement: 'left' }
}

export function buildModelEdgeLabelConfig(
  labelText: string | undefined,
  ds?: DiagramStyle
): string | TextLabelOptions | undefined {
  const text = labelText?.trim()
  if (!text) return undefined
  return buildNotationEdgeLabel(text, ds)
}

export type ModelEdgeDisplayLabelInput = {
  /** Diagram edge attrs.label — ignored for display when labelTemplate is set. */
  instanceEdgeLabel?: string
  relationName?: string
  ds?: DiagramStyle
  relationProperties: CustomProperty[]
  linkTypeProperties: CustomProperty[]
  typeValues: Record<string, unknown>
  relationValues: Record<string, unknown>
}

export function buildModelEdgeDisplayLabel(
  input: ModelEdgeDisplayLabelInput
): string | TextLabelOptions | undefined {
  const {
    instanceEdgeLabel,
    relationName,
    ds,
    relationProperties,
    linkTypeProperties,
    typeValues,
    relationValues,
  } = input

  if (ds?.showLabel === false) {
    return undefined
  }

  const hasTemplate = !!ds?.labelTemplate
  if (!hasTemplate) {
    const fallback = (instanceEdgeLabel ?? relationName ?? '').trim()
    if (!fallback) return undefined
    return buildModelEdgeLabelConfig(fallback, ds)
  }

  const displayText = resolveDiagramEdgeLabelTemplate(ds!.labelTemplate!, relationName ?? '', {
    typeProperties: linkTypeProperties,
    typeValues,
    relationProperties,
    relationValues,
  })

  const labelInset = ds?.labelInset
  const hasStyle = !!(
    ds?.labelColor ||
    ds?.labelOpacity != null ||
    ds?.labelFontSize ||
    labelInset != null
  )

  if (!hasStyle) {
    return { text: displayText, editableText: relationName ?? '' }
  }

  const opts: TextLabelOptions = {
    text: displayText,
    editableText: relationName ?? '',
  }
  const style: TextStyle = {}
  if (ds?.labelColor) style.color = ds.labelColor
  if (ds?.labelOpacity != null) style.opacity = ds.labelOpacity
  if (ds?.labelFontSize) style.fontSize = ds.labelFontSize
  if (Object.keys(style).length) opts.style = style
  if (labelInset != null) opts.inset = labelInset
  return opts
}

export function buildModelEdgeLabelBackground(
  ds?: DiagramStyle
): { color?: string; opacity?: number; padding?: number; borderRadius?: number } | undefined {
  if (
    !ds ||
    (!ds.labelBgColor &&
      ds.labelBgOpacity == null &&
      ds.labelBgPadding == null &&
      ds.labelBgBorderRadius == null)
  ) {
    return undefined
  }
  return buildNotationEdgeLabelBackground(ds)
}

export function resolveModelEdgeOptions(ds?: DiagramStyle): ModelEdgeOptions {
  if (!ds) return {}
  const opts: ModelEdgeOptions = {}
  const style: EdgeStyle = {}
  if (ds.strokeColor) style.strokeColor = ds.strokeColor
  if (ds.strokeWidth != null) style.strokeWidth = ds.strokeWidth
  if (ds.strokeOpacity != null) style.strokeOpacity = ds.strokeOpacity
  if (ds.opacity != null) style.opacity = ds.opacity
  if (ds.lineDash) style.lineDash = ds.lineDash
  if (Object.keys(style).length) opts.style = style
  if (ds.edgeType) opts.type = ds.edgeType as EdgePathType

  const startMarker = buildMarker(ds.startMarkerType, ds, 'start')
  const endMarker = buildMarker(ds.endMarkerType, ds, 'end')
  if (startMarker) opts.startMarker = startMarker
  if (endMarker) opts.endMarker = endMarker

  if (ds.edgeLabelOffset != null) opts.labelOffset = ds.edgeLabelOffset
  if (ds.edgeLabelPosition != null) opts.labelPosition = ds.edgeLabelPosition
  if (ds.edgeLabelFollowPath != null) opts.labelFollowPath = ds.edgeLabelFollowPath
  if (ds.edgeLabelLineGap != null) opts.labelLineGap = ds.edgeLabelLineGap
  return opts
}

/**
 * Relation (bound) style + instance overrides. Instance-only `{ edgeType }` from layout
 * must not wipe label/stroke fields that live on the notation relation.
 */
export function mergeEffectiveDiagramStyle(
  bound: DiagramStyle | undefined,
  instanceStyle: DiagramStyle | undefined
): DiagramStyle | undefined {
  if (
    instanceStyle &&
    typeof instanceStyle === 'object' &&
    !Array.isArray(instanceStyle)
  ) {
    return { ...(bound ?? {}), ...instanceStyle }
  }
  return bound
}
