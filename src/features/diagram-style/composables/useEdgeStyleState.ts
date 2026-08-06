import { ref } from 'vue'
import type { Edge } from '@ngroznykh/papirus'
import type { DiagramStyle } from '@/domain/attrs/notationAttrs'
import type {
  ExtendedEdgeProps,
  ExtendedEdgeStyle,
  ExtendedTextStyle,
} from '../types/papirusExtended'
import {
  toInsetSides,
  insetToPlain,
  getLabelSpacing,
  type InsetSides,
} from '../utils/styleHelpers'

export function useEdgeStyleState() {
  // --- Edge style refs ---
  const edgeLabel = ref('')
  const edgeStrokeColor = ref('#666666')
  const edgeStrokeOpacity = ref(1)
  const edgeStrokeWidth = ref(2)
  const edgeLineStyle = ref<'solid' | 'dashed'>('solid')
  const edgeLineDashPattern = ref('8,4')
  const edgeType = ref<'straight' | 'polyline' | 'editable-polyline' | 'bezier'>('polyline')
  const edgeEndMarker = ref<'none' | 'arrow' | 'open' | 'diamond' | 'circle' | 'square' | 'stealth'>('open')
  const edgeStartMarker = ref<'none' | 'arrow' | 'open' | 'diamond' | 'circle' | 'square' | 'stealth'>('none')
  const edgeOpacity = ref(1)
  const edgeLabelColor = ref('#333333')
  const edgeLabelOpacity = ref(1)
  const edgeLabelFontSize = ref(14)
  const edgeLabelInset = ref<InsetSides>({ top: 8, right: 8, bottom: 8, left: 8 })
  const edgeLabelOffset = ref(0)
  const edgeLabelPosition = ref(0.5)
  const edgeLabelFollowPath = ref(false)
  const edgeLabelLineGap = ref(false)
  const edgeLabelBgColor = ref('#ffffff')
  const edgeLabelBgOpacity = ref(1)
  const edgeLabelBgBorderRadius = ref(2)
  const edgeStartMarkerSize = ref(12)
  const edgeStartMarkerFillColor = ref('#000000')
  const edgeStartMarkerFillOpacity = ref(1)
  const edgeEndMarkerSize = ref(12)
  const edgeEndMarkerFillColor = ref('#000000')
  const edgeEndMarkerFillOpacity = ref(1)

  /** Populate all edge-style refs from a canvas Edge + optional DiagramStyle. */
  function loadEdgeProps(edge: Edge, currentDiagramStyle?: DiagramStyle): void {
    const styleFromDiagram = currentDiagramStyle
    const edgeRuntime = edge as unknown as ExtendedEdgeProps

    edgeLabel.value = typeof edge.label === 'string' ? edge.label : (edge.label?.text ?? '')
    const style = (edge.style || {}) as ExtendedEdgeStyle
    edgeStrokeColor.value = styleFromDiagram?.strokeColor ?? style.strokeColor ?? '#666666'
    edgeStrokeOpacity.value = styleFromDiagram?.strokeOpacity ?? style.strokeOpacity ?? 1
    edgeStrokeWidth.value = styleFromDiagram?.strokeWidth ?? style.strokeWidth ?? 2
    edgeOpacity.value = styleFromDiagram?.opacity ?? style.opacity ?? 1
    edgeType.value = (styleFromDiagram?.edgeType ?? edge.type ?? 'polyline') as
      | 'straight'
      | 'polyline'
      | 'editable-polyline'
      | 'bezier'

    const lineDash = style.lineDash ?? styleFromDiagram?.lineDash ?? []
    edgeLineStyle.value = lineDash.length > 0 ? 'dashed' : 'solid'
    edgeLineDashPattern.value = lineDash.length > 0 ? lineDash.join(',') : '8,4'

    edgeEndMarker.value = (styleFromDiagram?.endMarkerType ?? edge.endMarker?.type ?? 'none') as
      | 'none'
      | 'arrow'
      | 'open'
      | 'diamond'
      | 'circle'
      | 'square'
      | 'stealth'
    edgeStartMarker.value = (styleFromDiagram?.startMarkerType ??
      edge.startMarker?.type ??
      'none') as
      | 'none'
      | 'arrow'
      | 'open'
      | 'diamond'
      | 'circle'
      | 'square'
      | 'stealth'

    const eLabelStyle = edge.label?.style as ExtendedTextStyle | undefined
    edgeLabelColor.value = styleFromDiagram?.labelColor ?? eLabelStyle?.color ?? '#333333'
    edgeLabelOpacity.value = styleFromDiagram?.labelOpacity ?? eLabelStyle?.opacity ?? 1
    edgeLabelFontSize.value = styleFromDiagram?.labelFontSize ?? eLabelStyle?.fontSize ?? 14
    const edgeLabelSpacing = getLabelSpacing(edge.label)
    edgeLabelInset.value = toInsetSides(
      styleFromDiagram?.labelInset ?? edgeLabelSpacing.inset,
      8,
    )
    edgeLabelOffset.value = styleFromDiagram?.edgeLabelOffset ?? edge.labelOffset ?? 0
    edgeLabelPosition.value = styleFromDiagram?.edgeLabelPosition ?? edge.labelPosition ?? 0.5
    edgeLabelFollowPath.value =
      styleFromDiagram?.edgeLabelFollowPath ?? edge.labelFollowPath ?? false
    edgeLabelLineGap.value = styleFromDiagram?.edgeLabelLineGap ?? edge.labelLineGap ?? false
    edgeLabelBgColor.value =
      styleFromDiagram?.labelBgColor ?? edgeRuntime.labelBackground?.color ?? '#ffffff'
    edgeLabelBgOpacity.value =
      styleFromDiagram?.labelBgOpacity ?? edgeRuntime.labelBackground?.opacity ?? 1
    edgeLabelBgBorderRadius.value =
      styleFromDiagram?.labelBgBorderRadius ??
      edgeRuntime.labelBackground?.borderRadius ??
      2
    edgeStartMarkerSize.value = styleFromDiagram?.startMarkerSize ?? edge.startMarker?.size ?? 12
    edgeStartMarkerFillColor.value =
      styleFromDiagram?.startMarkerFillColor ?? edge.startMarker?.fillColor ?? '#000000'
    edgeStartMarkerFillOpacity.value =
      styleFromDiagram?.startMarkerFillOpacity ?? edge.startMarker?.fillOpacity ?? 1
    edgeEndMarkerSize.value = styleFromDiagram?.endMarkerSize ?? edge.endMarker?.size ?? 12
    edgeEndMarkerFillColor.value =
      styleFromDiagram?.endMarkerFillColor ?? edge.endMarker?.fillColor ?? '#000000'
    edgeEndMarkerFillOpacity.value =
      styleFromDiagram?.endMarkerFillOpacity ?? edge.endMarker?.fillOpacity ?? 1
  }

  /** Build a DiagramStyle object from current edge-style refs. */
  function buildEdgeStyle(): DiagramStyle {
    const style: DiagramStyle = {
      strokeColor: edgeStrokeColor.value,
      strokeOpacity: edgeStrokeOpacity.value,
      strokeWidth: edgeStrokeWidth.value,
      opacity: edgeOpacity.value,
      edgeType: edgeType.value,
      startMarkerType: edgeStartMarker.value,
      endMarkerType: edgeEndMarker.value,
      labelColor: edgeLabelColor.value,
      labelOpacity: edgeLabelOpacity.value,
      labelFontSize: edgeLabelFontSize.value,
      labelInset: insetToPlain(edgeLabelInset.value),
      edgeLabelOffset: edgeLabelOffset.value,
      edgeLabelPosition: edgeLabelPosition.value,
      edgeLabelFollowPath: edgeLabelFollowPath.value,
      edgeLabelLineGap: edgeLabelLineGap.value,
      labelBgColor: edgeLabelBgColor.value,
      labelBgOpacity: edgeLabelBgOpacity.value,
      labelBgBorderRadius: edgeLabelBgBorderRadius.value,
      startMarkerSize: edgeStartMarkerSize.value,
      startMarkerFillColor: edgeStartMarkerFillColor.value,
      startMarkerFillOpacity: edgeStartMarkerFillOpacity.value,
      endMarkerSize: edgeEndMarkerSize.value,
      endMarkerFillColor: edgeEndMarkerFillColor.value,
      endMarkerFillOpacity: edgeEndMarkerFillOpacity.value,
    }
    if (edgeLineStyle.value === 'dashed') {
      const pattern = edgeLineDashPattern.value.trim() || '8,4'
      style.lineDash = pattern
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n))
    }
    return style
  }

  return {
    // Refs
    edgeLabel,
    edgeStrokeColor,
    edgeStrokeOpacity,
    edgeStrokeWidth,
    edgeLineStyle,
    edgeLineDashPattern,
    edgeType,
    edgeEndMarker,
    edgeStartMarker,
    edgeOpacity,
    edgeLabelColor,
    edgeLabelOpacity,
    edgeLabelFontSize,
    edgeLabelInset,
    edgeLabelOffset,
    edgeLabelPosition,
    edgeLabelFollowPath,
    edgeLabelLineGap,
    edgeLabelBgColor,
    edgeLabelBgOpacity,
    edgeLabelBgBorderRadius,
    edgeStartMarkerSize,
    edgeStartMarkerFillColor,
    edgeStartMarkerFillOpacity,
    edgeEndMarkerSize,
    edgeEndMarkerFillColor,
    edgeEndMarkerFillOpacity,
    // Functions
    loadEdgeProps,
    buildEdgeStyle,
  }
}
