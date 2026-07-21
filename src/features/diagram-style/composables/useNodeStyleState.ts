import { ref } from 'vue'
import type { Node } from '@ngroznykh/papirus'
import type {
  DiagramStyle,
  CompositeSerializedCComponent,
  StylePropertyBindingGroup,
} from '@/domain/attrs/notationAttrs'
import type {
  ExtendedIconConfig,
  ExtendedNodeProps,
  ExtendedNodeStyle,
  ExtendedTextStyle,
} from '../types/papirusExtended'
import {
  normalizeIconPlacement,
  toInsetSides,
  toInsetNumber,
  insetToPlain,
  getLabelSpacing,
  type IconPlacement,
  type InsetSides,
} from '../utils/styleHelpers'
import { createDefaultCompositeContent } from '@/features/diagram-style/utils/compositeBindings'

export type NodeShape =
  | 'rectangle'
  | 'beveled-rectangle'
  | 'diamond'
  | 'circle'
  | 'trapezoid'
  | 'slanted-rectangle'
  | 'custom'
  | 'composite'

function getNodeIconOptions(node: ExtendedNodeProps): ExtendedIconConfig | undefined {
  const icon = node.icon
  if (!icon) return undefined
  if (typeof icon === 'object' && icon !== null && 'options' in icon) {
    return (icon as { options?: ExtendedIconConfig }).options
  }
  return icon as ExtendedIconConfig
}

export function useNodeStyleState() {
  // --- Node style refs ---
  const iconName = ref('')
  const iconPlacement = ref<IconPlacement>('top-left')
  const iconWidth = ref(20)
  const iconHeight = ref(20)
  const iconInset = ref(6)
  const iconStrokeColor = ref('#000000')
  const iconFillColor = ref('#000000')
  const nodeShape = ref<NodeShape>('rectangle')
  const label = ref('')
  const fillColor = ref('#ffffff')
  const fillOpacity = ref(1)
  const strokeColor = ref('#333333')
  const strokeOpacity = ref(1)
  const strokeWidth = ref(2)
  const cornerRadius = ref(0)
  const opacity = ref(1)
  const lineStyle = ref<'solid' | 'dashed'>('solid')
  const lineDashPattern = ref('8,4')
  const labelTemplate = ref('')
  const showLabel = ref(true)
  const labelColor = ref('#333333')
  const labelOpacity = ref(1)
  const labelFontSize = ref(14)
  const labelInset = ref<InsetSides>({ top: 8, right: 8, bottom: 8, left: 8 })
  const labelAlign = ref<'center' | 'left' | 'right'>('center')
  const labelVerticalAlign = ref<'top' | 'middle' | 'bottom'>('middle')
  const nodeWidth = ref(140)
  const nodeHeight = ref(50)
  const contentInset = ref<InsetSides>({ top: 0, right: 0, bottom: 0, left: 0 })
  const nodePortsTop = ref(3)
  const nodePortsBottom = ref(3)
  const nodePortsLeft = ref(1)
  const nodePortsRight = ref(1)
  const customOutlineRef = ref<DiagramStyle['customOutline']>(undefined)
  const customShapeIdRef = ref<string | null>(null)
  const compositeContentJson = ref('')
  const styleBindingsJson = ref('')
  const compositeJsonError = ref<string | null>(null)
  const styleBindingsJsonError = ref<string | null>(null)
  const compositeEditorMode = ref<'visual' | 'json'>('visual')
  const compositeTreeTargets = ref<Array<{ id: string; label: string }>>([])
  const compositeContentDraft = ref<CompositeSerializedCComponent>(createDefaultCompositeContent('Name'))
  const styleBindingsDraft = ref<StylePropertyBindingGroup[]>([])
  const compositeShapeType = ref<'rectangle' | 'circle' | 'diamond' | 'custom'>('rectangle')
  const compositeAutoSize = ref(false)
  const compositeMinWidth = ref(0)
  const compositeMinHeight = ref(0)

  /**
   * Populate all node-style refs from a canvas Node + optional DiagramStyle.
   * Returns `true` when the shape is "custom" (caller may need to trigger
   * catalog shape loading).
   */
  function loadNodeProps(node: Node, currentDiagramStyle?: DiagramStyle): boolean {
    let needsCatalogShapes = false
    const nodeRuntime = node as unknown as ExtendedNodeProps

    // Load icon
    const iconOptions = getNodeIconOptions(nodeRuntime)
    const iconSource = iconOptions?.source
    if (iconSource && typeof iconSource === 'string') {
      const match = iconSource.match(/\/icons\/(.+)\.svg$/)
      iconName.value = match?.[1] ?? ''
    } else {
      iconName.value = ''
    }
    iconPlacement.value = normalizeIconPlacement(
      iconOptions?.placement,
      normalizeIconPlacement(currentDiagramStyle?.iconPlacement, 'top-left'),
    )
    iconWidth.value = Math.round(Number(iconOptions?.width ?? 20))
    iconHeight.value = Math.round(Number(iconOptions?.height ?? 20))
    iconInset.value = toInsetNumber(
      iconOptions?.inset ?? iconOptions?.padding ?? iconOptions?.margin ?? iconOptions?.gap,
      6,
    )
    iconStrokeColor.value = (iconOptions?.strokeColor as string) ?? '#000000'
    iconFillColor.value = (iconOptions?.fillColor as string) ?? '#000000'

    const rawShape = nodeRuntime.shapeType as NodeShape | undefined
    if (
      rawShape === 'rectangle' ||
      rawShape === 'beveled-rectangle' ||
      rawShape === 'diamond' ||
      rawShape === 'circle' ||
      rawShape === 'trapezoid' ||
      rawShape === 'slanted-rectangle' ||
      rawShape === 'custom' ||
      rawShape === 'composite'
    ) {
      nodeShape.value = rawShape
      if (rawShape === 'custom') {
        customOutlineRef.value = currentDiagramStyle?.customOutline ?? undefined
        customShapeIdRef.value = currentDiagramStyle?.customShapeId ?? null
        needsCatalogShapes = true
      } else {
        customOutlineRef.value = undefined
        customShapeIdRef.value = null
      }
    } else {
      const typeName = nodeRuntime.typeName
      nodeShape.value =
        typeName === 'diamond' ? 'diamond' : typeName === 'circle' ? 'circle' : 'rectangle'
      customOutlineRef.value = undefined
      customShapeIdRef.value = null
    }

    label.value = node.label?.text ?? ''
    const style = (node.style || {}) as ExtendedNodeStyle
    fillColor.value = style.fillColor || '#ffffff'
    fillOpacity.value = style.fillOpacity ?? 1
    strokeColor.value = style.strokeColor || '#333333'
    strokeOpacity.value = style.strokeOpacity ?? 1
    strokeWidth.value = style.strokeWidth ?? 2
    opacity.value = style.opacity ?? 1

    const lineDash = style.lineDash || []
    lineStyle.value = lineDash.length > 0 ? 'dashed' : 'solid'
    lineDashPattern.value = lineDash.length > 0 ? lineDash.join(',') : '8,4'

    if ('cornerRadius' in node) {
      cornerRadius.value = nodeRuntime.cornerRadius ?? 0
    } else {
      cornerRadius.value = 0
    }

    const labelStyle = node.label?.style as ExtendedTextStyle | undefined
    labelColor.value = labelStyle?.color || '#333333'
    labelOpacity.value = labelStyle?.opacity ?? 1
    labelFontSize.value = labelStyle?.fontSize ?? 14
    const nodeLabelSpacing = getLabelSpacing(node.label)
    labelInset.value = toInsetSides(nodeLabelSpacing.inset, 8)
    labelAlign.value = (labelStyle?.align as 'center' | 'left' | 'right') ?? 'center'
    labelVerticalAlign.value =
      labelStyle?.verticalAlign ?? 'middle'
    labelTemplate.value = currentDiagramStyle?.labelTemplate ?? ''
    showLabel.value = currentDiagramStyle?.showLabel !== false
    compositeContentJson.value = currentDiagramStyle?.compositeContent
      ? JSON.stringify(currentDiagramStyle.compositeContent, null, 2)
      : ''
    styleBindingsJson.value = currentDiagramStyle?.stylePropertyBindings
      ? JSON.stringify(currentDiagramStyle.stylePropertyBindings, null, 2)
      : ''
    compositeContentDraft.value = currentDiagramStyle?.compositeContent
      ? JSON.parse(JSON.stringify(currentDiagramStyle.compositeContent))
      : createDefaultCompositeContent(label.value || 'Name')
    styleBindingsDraft.value = currentDiagramStyle?.stylePropertyBindings
      ? JSON.parse(JSON.stringify(currentDiagramStyle.stylePropertyBindings))
      : []
    compositeJsonError.value = null
    styleBindingsJsonError.value = null
    compositeShapeType.value =
      (currentDiagramStyle?.compositeShapeType as typeof compositeShapeType.value) ?? 'rectangle'
    compositeAutoSize.value = currentDiagramStyle?.compositeAutoSize ?? false
    compositeMinWidth.value = currentDiagramStyle?.compositeMinWidth ?? 0
    compositeMinHeight.value = currentDiagramStyle?.compositeMinHeight ?? 0

    // Load node dimensions
    nodeWidth.value = Math.round(node.width ?? 140)
    nodeHeight.value = Math.round(node.height ?? 50)
    contentInset.value = toInsetSides(
      nodeRuntime.contentInset ?? currentDiagramStyle?.contentInset,
      0,
    )
    const anchorPoints = nodeRuntime.anchorPoints || {}
    nodePortsTop.value = Math.max(0, Math.round(Number(anchorPoints.top ?? 3)))
    nodePortsBottom.value = Math.max(0, Math.round(Number(anchorPoints.bottom ?? 3)))
    nodePortsLeft.value = Math.max(0, Math.round(Number(anchorPoints.left ?? 1)))
    nodePortsRight.value = Math.max(0, Math.round(Number(anchorPoints.right ?? 1)))

    return needsCatalogShapes
  }

  /** Build a DiagramStyle object from current node-style refs. */
  function buildNodeStyle(): DiagramStyle {
    const compositeContent =
      nodeShape.value === 'composite' ? compositeContentDraft.value : undefined
    const stylePropertyBindings =
      nodeShape.value === 'composite' && styleBindingsDraft.value.length > 0
        ? styleBindingsDraft.value
        : undefined
    const style: DiagramStyle = {
      nodeShape: nodeShape.value,
      ...(nodeShape.value === 'custom'
        ? {
            customOutline: customOutlineRef.value,
            customShapeId: customShapeIdRef.value ?? undefined,
          }
        : {}),
      fillColor: fillColor.value,
      fillOpacity: fillOpacity.value,
      strokeColor: strokeColor.value,
      strokeOpacity: strokeOpacity.value,
      strokeWidth: strokeWidth.value,
      cornerRadius: cornerRadius.value,
      opacity: opacity.value,
      labelColor: labelColor.value,
      labelOpacity: labelOpacity.value,
      labelFontSize: labelFontSize.value,
      labelInset: insetToPlain(labelInset.value),
      labelAlign: labelAlign.value,
      labelVerticalAlign: labelVerticalAlign.value,
      showLabel: showLabel.value,
      ...(labelTemplate.value ? { labelTemplate: labelTemplate.value } : {}),
      ...(nodeShape.value === 'composite' && compositeContent ? { compositeContent } : {}),
      ...(nodeShape.value === 'composite' && stylePropertyBindings
        ? { stylePropertyBindings }
        : {}),
      ...(nodeShape.value === 'composite'
        ? {
            compositeShapeType: compositeShapeType.value,
            compositeAutoSize: compositeAutoSize.value,
            compositeMinWidth: compositeMinWidth.value,
            compositeMinHeight: compositeMinHeight.value,
          }
        : {}),
      width: nodeWidth.value,
      height: nodeHeight.value,
      contentInset: insetToPlain(contentInset.value),
      portsTop: nodePortsTop.value,
      portsBottom: nodePortsBottom.value,
      portsLeft: nodePortsLeft.value,
      portsRight: nodePortsRight.value,
      ...(iconName.value
        ? {
            iconName: iconName.value,
            iconPlacement: iconPlacement.value,
            iconWidth: iconWidth.value,
            iconHeight: iconHeight.value,
            iconInset: iconInset.value,
            iconStrokeColor: iconStrokeColor.value,
            iconFillColor: iconFillColor.value,
          }
        : {}),
    }
    if (lineStyle.value === 'dashed') {
      const pattern = lineDashPattern.value.trim() || '8,4'
      style.lineDash = pattern
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n))
    }
    return style
  }

  return {
    // Refs
    iconName,
    iconPlacement,
    iconWidth,
    iconHeight,
    iconInset,
    iconStrokeColor,
    iconFillColor,
    nodeShape,
    label,
    fillColor,
    fillOpacity,
    strokeColor,
    strokeOpacity,
    strokeWidth,
    cornerRadius,
    opacity,
    lineStyle,
    lineDashPattern,
    labelTemplate,
    showLabel,
    labelColor,
    labelOpacity,
    labelFontSize,
    labelInset,
    labelAlign,
    labelVerticalAlign,
    nodeWidth,
    nodeHeight,
    contentInset,
    nodePortsTop,
    nodePortsBottom,
    nodePortsLeft,
    nodePortsRight,
    customOutlineRef,
    customShapeIdRef,
    compositeContentJson,
    styleBindingsJson,
    compositeJsonError,
    styleBindingsJsonError,
    compositeEditorMode,
    compositeTreeTargets,
    compositeContentDraft,
    styleBindingsDraft,
    compositeShapeType,
    compositeAutoSize,
    compositeMinWidth,
    compositeMinHeight,
    // Functions
    loadNodeProps,
    buildNodeStyle,
  }
}
