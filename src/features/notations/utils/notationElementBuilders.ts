import type {
  ArrowMarkerConfig,
  TextLabelOptions,
  TextStyle,
  NodeImageOptions,
  ArrowMarkerType,
} from '@ngroznykh/papirus'
import { resolveLabelTemplate } from '@/domain/attrs/labelTemplate'
import type { DiagramStyle, CustomProperty } from '@/domain/attrs/notationAttrs'

const DEFAULT_COMPONENT_ANCHORS = { top: 3, right: 1, bottom: 3, left: 1 }

export function resolveComponentAnchorPoints(
  ds?: DiagramStyle,
): { top: number; right: number; bottom: number; left: number } {
  const normalize = (value: unknown, fallback: number): number => {
    const parsed = Math.round(Number(value))
    if (!Number.isFinite(parsed) || parsed < 0) return fallback
    return parsed
  }

  return {
    top: normalize(ds?.portsTop, DEFAULT_COMPONENT_ANCHORS.top),
    right: normalize(ds?.portsRight, DEFAULT_COMPONENT_ANCHORS.right),
    bottom: normalize(ds?.portsBottom, DEFAULT_COMPONENT_ANCHORS.bottom),
    left: normalize(ds?.portsLeft, DEFAULT_COMPONENT_ANCHORS.left),
  }
}

/**
 * Превью шаблона в редакторе нотации (без значений модели):
 * - `#{prop}` — свойства **типа ноды** (передаётся `typeProperties`);
 * - `${prop}` — свойства **компонента**;
 * - `${name}` — имя элемента на палитре.
 */
export { resolveLabelTemplate }

export function buildNodeLabel(
  name: string,
  ds?: DiagramStyle,
  customProperties?: CustomProperty[],
  typeProperties?: CustomProperty[],
): string | TextLabelOptions | undefined {
  if (ds?.showLabel === false) {
    return undefined
  }

  const hasTemplate = !!ds?.labelTemplate
  const displayText = hasTemplate
    ? resolveLabelTemplate(
        ds!.labelTemplate!,
        name,
        customProperties ?? [],
        typeProperties ?? [],
      )
    : name

  const labelInset = ds?.labelInset
  const hasStyle = !!(
    ds?.labelColor ||
    ds?.labelOpacity != null ||
    ds?.labelFontSize ||
    labelInset != null ||
    ds?.labelAlign ||
    ds?.labelVerticalAlign
  )

  if (!hasStyle && !hasTemplate) {
    return displayText
  }
  const opts: TextLabelOptions = { text: displayText }
  if (hasTemplate) {
    opts.editableText = name
  }
  const style: TextStyle = {}
  if (ds?.labelColor) style.color = ds.labelColor
  if (ds?.labelOpacity != null) style.opacity = ds.labelOpacity
  if (ds?.labelFontSize) style.fontSize = ds.labelFontSize
  if (ds?.labelAlign) style.align = ds.labelAlign as TextStyle['align']
  if (ds?.labelVerticalAlign)
    style.verticalAlign = ds.labelVerticalAlign as TextStyle['verticalAlign']
  if (Object.keys(style).length) opts.style = style
  if (labelInset != null) opts.inset = labelInset
  return opts
}

export function buildEdgeLabel(name: string, ds?: DiagramStyle): string | TextLabelOptions {
  const labelInset = ds?.labelInset
  if (!ds?.labelColor && ds?.labelOpacity == null && !ds?.labelFontSize && labelInset == null) {
    return name
  }
  const opts: TextLabelOptions = { text: name }
  const style: TextStyle = {}
  if (ds?.labelColor) style.color = ds.labelColor
  if (ds?.labelOpacity != null) style.opacity = ds.labelOpacity
  if (ds?.labelFontSize) style.fontSize = ds.labelFontSize
  if (Object.keys(style).length) opts.style = style
  if (labelInset != null) opts.inset = labelInset
  return opts
}

/** Merge diagramStyle label fields into an existing TextLabel without dropping prior overrides. */
export function mergeEdgeLabelStyleFromDiagramStyle(
  currentOverrides: TextStyle | undefined,
  ds?: DiagramStyle
): TextStyle {
  return {
    ...(currentOverrides ?? {}),
    ...(ds?.labelColor ? { color: ds.labelColor } : {}),
    ...(ds?.labelOpacity != null ? { opacity: ds.labelOpacity } : {}),
    ...(ds?.labelFontSize ? { fontSize: ds.labelFontSize } : {}),
  }
}

export function buildEdgeLabelBackground(ds?: DiagramStyle) {
  return {
    color: ds?.labelBgColor || 'transparent',
    ...(ds?.labelBgOpacity != null ? { opacity: ds.labelBgOpacity } : {}),
    ...(ds?.labelBgPadding != null ? { padding: ds.labelBgPadding } : {}),
    ...(ds?.labelBgBorderRadius != null ? { borderRadius: ds.labelBgBorderRadius } : {}),
  }
}

export function buildNodeIcon(ds?: DiagramStyle) {
  if (!ds?.iconName) return undefined
  const placement = ds.iconPlacement
  const resolvedPlacement: NodeImageOptions['placement'] =
    placement === 'center' ||
    placement === 'top' ||
    placement === 'bottom' ||
    placement === 'left' ||
    placement === 'right' ||
    placement === 'top-left' ||
    placement === 'top-right' ||
    placement === 'bottom-left' ||
    placement === 'bottom-right'
      ? placement
      : 'top-left'
  const iconInset = ds.iconInset ?? ds.iconPadding ?? ds.iconMargin ?? ds.iconGap
  return {
    source: `/icons/${ds.iconName}.svg`,
    placement: resolvedPlacement,
    width: ds.iconWidth ?? 20,
    height: ds.iconHeight ?? 20,
    fit: 'contain' as const,
    ...(iconInset != null ? { inset: iconInset as unknown as number } : {}),
    ...(ds.iconOffsetX != null ? { offsetX: ds.iconOffsetX } : {}),
    ...(ds.iconOffsetY != null ? { offsetY: ds.iconOffsetY } : {}),
    ...(ds.iconStrokeColor ? { strokeColor: ds.iconStrokeColor } : {}),
    ...(ds.iconFillColor ? { fillColor: ds.iconFillColor } : {}),
  }
}

export function buildMarker(
  typeStr: string | undefined,
  ds: DiagramStyle | undefined,
  prefix: 'start' | 'end',
): ArrowMarkerConfig | undefined {
  if (typeStr === 'none') {
    return { type: 'none' }
  }
  const markerType =
    typeStr === 'arrow' ||
    typeStr === 'open' ||
    typeStr === 'diamond' ||
    typeStr === 'circle' ||
    typeStr === 'square'
      ? (typeStr as ArrowMarkerType)
      : undefined
  if (!markerType) return undefined
  const sizeKey = prefix === 'start' ? 'startMarkerSize' : 'endMarkerSize'
  const fillKey = prefix === 'start' ? 'startMarkerFillColor' : 'endMarkerFillColor'
  const opacityKey = prefix === 'start' ? 'startMarkerFillOpacity' : 'endMarkerFillOpacity'
  return {
    type: markerType,
    size: ds?.[sizeKey] ?? 12,
    ...(ds?.[fillKey] ? { fillColor: ds[fillKey] } : {}),
    ...(ds?.[opacityKey] != null ? { fillOpacity: ds[opacityKey] } : {}),
  }
}
