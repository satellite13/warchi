export type CustomPropertyType = 'string' | 'number' | 'boolean' | 'enum'

export type InteractiveKind = 'url' | 'diagram' | 'document'

export type CustomProperty = {
  id: string
  name: string
  type: CustomPropertyType
  required: boolean
  system?: boolean
  regex?: string
  min: number | null
  max: number | null
  maxLength?: number | null
  enumValues?: string[]
  defaultValue?: string | number | boolean
  enumDefault?: string
  _fromType?: boolean
  /** Show as clickable badge on diagram when value is set */
  interactive?: boolean
  /** Action when badge is clicked */
  interactiveKind?: InteractiveKind
  /** Material symbol name for badge icon */
  interactiveIcon?: string
}

// Custom node shape outline — types live in src/types/shapes.ts to avoid layer violation (utils → features)
export type { OutlineSegmentLine, OutlineSegmentBezier, OutlineSegment } from '@/types/shapes'
import type { OutlineSegment } from '@/types/shapes'

export const DEFAULT_RECTANGLE_OUTLINE: OutlineSegment[] = [
  { type: "line", points: [[0, 0], [1, 0]] },
  { type: "line", points: [[1, 0], [1, 1]] },
  { type: "line", points: [[1, 1], [0, 1]] },
  { type: "line", points: [[0, 1], [0, 0]] }
]

export type CustomShapeDef = {
  id: string
  name: string
  outline: OutlineSegment[]
  ownerId?: string
}

export type NodeStyle = {
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  cornerRadius?: number
}

export type InsetSides = {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export type StyleBindingValueSource = 'component' | 'nodeType'

export type StyleBindingWhen =
  | { op: 'equals'; value: string | number | boolean }
  | { op: 'contains'; value: string }
  | { op: 'matchesRegex'; value: string }
  | { op: 'isEmpty' }
  | { op: 'isNotEmpty' }
  | { op: 'is'; value: boolean }
  | { op: 'range'; min?: number; max?: number }
  | { op: 'lt' | 'lte' | 'gt' | 'gte'; value: number }

export type StyleBindingPatch = {
  targetId: string
  patch: Record<string, unknown>
}

export type StyleBindingBranch = {
  when: StyleBindingWhen
  patches: StyleBindingPatch[]
}

export type StylePropertyBindingGroup = {
  valueSource: StyleBindingValueSource
  propertyName: string
  branches: StyleBindingBranch[]
}

// Extension for notation-side serialization metadata.
export interface CompositeSerializedCComponent
  extends Omit<import('@ngroznykh/papirus').SerializedCComponent, 'children' | 'content'> {
  bindsNotationIcon?: boolean
  children?: CompositeSerializedCComponent[]
  content?: CompositeSerializedCComponent
}

export type DiagramStyle = {
  fillColor?: string
  fillOpacity?: number
  strokeColor?: string
  strokeOpacity?: number
  strokeWidth?: number
  cornerRadius?: number
  opacity?: number
  lineDash?: number[]
  edgeType?: string
  startMarkerType?: string
  endMarkerType?: string
  // Label properties (shared node+edge)
  labelColor?: string
  labelOpacity?: number
  labelFontSize?: number
  labelInset?: number | InsetSides
  labelPlacement?: string
  labelAlign?: string
  labelVerticalAlign?: string
  contentInset?: number | InsetSides
  // Edge label background
  labelBgColor?: string
  labelBgOpacity?: number
  labelBgPadding?: number
  labelBgBorderRadius?: number
  edgeLabelOffset?: number
  /** Position along the edge path (0 = source, 0.5 = midpoint, 1 = target) */
  edgeLabelPosition?: number
  /** Rotate label text to follow the edge path tangent */
  edgeLabelFollowPath?: boolean
  /** When true, the edge line is not drawn under the label (gap at label). */
  edgeLabelLineGap?: boolean
  // Marker details
  startMarkerSize?: number
  startMarkerFillColor?: string
  startMarkerFillOpacity?: number
  endMarkerSize?: number
  endMarkerFillColor?: string
  endMarkerFillOpacity?: number
  // Node icon
  iconName?: string
  iconPlacement?: string
  iconWidth?: number
  iconHeight?: number
  iconInset?: number | InsetSides
  iconOffsetX?: number
  iconOffsetY?: number
  iconPadding?: number
  iconMargin?: number
  iconGap?: number
  iconStrokeColor?: string
  iconFillColor?: string
  // Node dimensions
  width?: number
  height?: number
  // Node anchor points
  portsTop?: number
  portsBottom?: number
  portsLeft?: number
  portsRight?: number
  // Node base shape
  nodeShape?: string
  // Custom shape: copy of outline stored in component (for render); catalog reference optional
  customOutline?: OutlineSegment[]
  customShapeId?: string
  // Label template for composite labels
  labelTemplate?: string
  // Composite-only fields
  compositeContent?: CompositeSerializedCComponent
  compositeShapeType?: 'rectangle' | 'beveled-rectangle' | 'diamond' | 'circle' | 'trapezoid' | 'slanted-rectangle' | 'custom'
  compositeAutoSize?: boolean
  compositeMinWidth?: number
  compositeMinHeight?: number
  stylePropertyBindings?: StylePropertyBindingGroup[]
}

type RawRecord = Record<string, unknown>

const isRecord = (value: unknown): value is RawRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const createId = () => {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID()
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(tag => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean)
}

const normalizeCustomProperties = (value: unknown): CustomProperty[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map(item => {
    const record = isRecord(item) ? item : {}
    const type =
      record.type === 'number' || record.type === 'boolean' || record.type === 'enum'
        ? record.type
        : 'string'
    const defaultValueRaw = record.defaultValue
    const enumDefaultRaw = typeof record.enumDefault === 'string' ? record.enumDefault : undefined
    let defaultValue: string | number | boolean | undefined
    if ((type === 'string' || type === 'enum') && typeof defaultValueRaw === 'string') {
      defaultValue = defaultValueRaw
    } else if (
      type === 'number' &&
      typeof defaultValueRaw === 'number' &&
      Number.isFinite(defaultValueRaw)
    ) {
      defaultValue = defaultValueRaw
    } else if (type === 'boolean' && typeof defaultValueRaw === 'boolean') {
      defaultValue = defaultValueRaw
    } else if (type === 'enum' && typeof enumDefaultRaw === 'string') {
      // Backward compatibility for older payloads.
      defaultValue = enumDefaultRaw
    }

    const interactiveKindRaw = record.interactiveKind
    const interactiveKind: InteractiveKind | undefined =
      interactiveKindRaw === 'url' || interactiveKindRaw === 'diagram' || interactiveKindRaw === 'document'
        ? interactiveKindRaw
        : undefined
    const interactiveIconRaw = record.interactiveIcon
    const interactiveIcon =
      typeof interactiveIconRaw === 'string' && interactiveIconRaw.trim().length > 0
        ? interactiveIconRaw.trim()
        : undefined

    return {
      id: typeof record.id === 'string' ? record.id : createId(),
      name: typeof record.name === 'string' ? record.name : '',
      type,
      required: Boolean(record.required),
      system: Boolean(record.system),
      regex: typeof record.regex === 'string' ? record.regex : undefined,
      min: typeof record.min === 'number' ? record.min : null,
      max: typeof record.max === 'number' ? record.max : null,
      maxLength: typeof record.maxLength === 'number' ? record.maxLength : null,
      enumValues: Array.isArray(record.enumValues)
        ? record.enumValues.filter(val => typeof val === 'string')
        : undefined,
      defaultValue,
      enumDefault:
        type === 'enum' && typeof defaultValue === 'string' ? defaultValue : enumDefaultRaw,
      interactive: Boolean(record.interactive),
      interactiveKind,
      interactiveIcon,
    }
  })
}

const cloneRecord = (value: Record<string, unknown>): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>

const normalizeCompositeContent = (value: unknown): CompositeSerializedCComponent | undefined => {
  if (!isRecord(value)) return undefined
  if (value.type !== 'container') return undefined
  return cloneRecord(value) as unknown as CompositeSerializedCComponent
}

const normalizeStyleBindingWhen = (value: unknown): StyleBindingWhen | undefined => {
  if (!isRecord(value) || typeof value.op !== 'string') return undefined

  switch (value.op) {
    case 'equals':
      if (
        typeof value.value === 'string' ||
        typeof value.value === 'number' ||
        typeof value.value === 'boolean'
      ) {
        return { op: 'equals', value: value.value }
      }
      return undefined
    case 'contains':
    case 'matchesRegex':
      if (typeof value.value === 'string') return { op: value.op, value: value.value }
      return undefined
    case 'isEmpty':
    case 'isNotEmpty':
      return { op: value.op }
    case 'is':
      if (typeof value.value === 'boolean') return { op: 'is', value: value.value }
      return undefined
    case 'range': {
      const min = typeof value.min === 'number' ? value.min : undefined
      const max = typeof value.max === 'number' ? value.max : undefined
      if (min == null && max == null) return undefined
      return { op: 'range', ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) }
    }
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      if (typeof value.value === 'number') return { op: value.op, value: value.value }
      return undefined
    default:
      return undefined
  }
}

const normalizeStylePropertyBindings = (value: unknown): StylePropertyBindingGroup[] | undefined => {
  if (!Array.isArray(value)) return undefined

  const groups: StylePropertyBindingGroup[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const valueSource =
      item.valueSource === 'component' || item.valueSource === 'nodeType'
        ? item.valueSource
        : undefined
    const propertyName = typeof item.propertyName === 'string' ? item.propertyName.trim() : ''
    if (!valueSource || propertyName.length === 0) continue

    const branchesRaw = Array.isArray(item.branches) ? item.branches : []
    const branches: StyleBindingBranch[] = []
    for (const branchRaw of branchesRaw) {
      if (!isRecord(branchRaw)) continue
      const when = normalizeStyleBindingWhen(branchRaw.when)
      const patchesRaw = Array.isArray(branchRaw.patches) ? branchRaw.patches : []
      const patches: StyleBindingPatch[] = []
      for (const patchRaw of patchesRaw) {
        if (!isRecord(patchRaw)) continue
        const targetId = typeof patchRaw.targetId === 'string' ? patchRaw.targetId : ''
        if (targetId.length === 0 || !isRecord(patchRaw.patch)) continue
        patches.push({ targetId, patch: cloneRecord(patchRaw.patch) })
      }
      if (!when || patches.length === 0) continue
      branches.push({ when, patches })
    }
    if (branches.length === 0) continue
    groups.push({ valueSource, propertyName, branches })
  }
  return groups.length > 0 ? groups : undefined
}

const normalizeDiagramStyle = (value: unknown): DiagramStyle | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  const style: DiagramStyle = {}
  if (typeof value.fillColor === 'string') style.fillColor = value.fillColor
  if (typeof value.fillOpacity === 'number') style.fillOpacity = value.fillOpacity
  if (typeof value.strokeColor === 'string') style.strokeColor = value.strokeColor
  if (typeof value.strokeOpacity === 'number') style.strokeOpacity = value.strokeOpacity
  if (typeof value.strokeWidth === 'number') style.strokeWidth = value.strokeWidth
  if (typeof value.cornerRadius === 'number') style.cornerRadius = value.cornerRadius
  if (typeof value.opacity === 'number') style.opacity = value.opacity
  if (Array.isArray(value.lineDash)) {
    const arr = value.lineDash.filter((n: unknown) => typeof n === 'number') as number[]
    if (arr.length > 0) style.lineDash = arr
  }
  if (typeof value.edgeType === 'string') style.edgeType = value.edgeType
  if (typeof value.startMarkerType === 'string') style.startMarkerType = value.startMarkerType
  if (typeof value.endMarkerType === 'string') style.endMarkerType = value.endMarkerType
  if (typeof value.labelColor === 'string') style.labelColor = value.labelColor
  if (typeof value.labelOpacity === 'number') style.labelOpacity = value.labelOpacity
  if (typeof value.labelFontSize === 'number') style.labelFontSize = value.labelFontSize
  if (typeof value.labelInset === 'number') style.labelInset = value.labelInset
  else if (isInsetSides(value.labelInset)) style.labelInset = normalizeInsetSides(value.labelInset)
  if (typeof value.labelPlacement === 'string') style.labelPlacement = value.labelPlacement
  if (typeof value.labelAlign === 'string') style.labelAlign = value.labelAlign
  if (typeof value.labelVerticalAlign === 'string') style.labelVerticalAlign = value.labelVerticalAlign
  if (typeof value.contentInset === 'number') style.contentInset = value.contentInset
  else if (isInsetSides(value.contentInset))
    style.contentInset = normalizeInsetSides(value.contentInset)
  if (typeof value.labelBgColor === 'string') style.labelBgColor = value.labelBgColor
  if (typeof value.labelBgOpacity === 'number') style.labelBgOpacity = value.labelBgOpacity
  if (typeof value.labelBgPadding === 'number') style.labelBgPadding = value.labelBgPadding
  if (typeof value.labelBgBorderRadius === 'number')
    style.labelBgBorderRadius = value.labelBgBorderRadius
  if (typeof value.edgeLabelOffset === 'number') style.edgeLabelOffset = value.edgeLabelOffset
  if (typeof value.edgeLabelPosition === 'number') style.edgeLabelPosition = value.edgeLabelPosition
  if (typeof value.edgeLabelFollowPath === 'boolean') style.edgeLabelFollowPath = value.edgeLabelFollowPath
  if (typeof value.edgeLabelLineGap === 'boolean') style.edgeLabelLineGap = value.edgeLabelLineGap
  if (typeof value.startMarkerSize === 'number') style.startMarkerSize = value.startMarkerSize
  if (typeof value.startMarkerFillColor === 'string')
    style.startMarkerFillColor = value.startMarkerFillColor
  if (typeof value.startMarkerFillOpacity === 'number')
    style.startMarkerFillOpacity = value.startMarkerFillOpacity
  if (typeof value.endMarkerSize === 'number') style.endMarkerSize = value.endMarkerSize
  if (typeof value.endMarkerFillColor === 'string')
    style.endMarkerFillColor = value.endMarkerFillColor
  if (typeof value.endMarkerFillOpacity === 'number')
    style.endMarkerFillOpacity = value.endMarkerFillOpacity
  if (typeof value.iconName === 'string') style.iconName = value.iconName
  if (typeof value.iconPlacement === 'string') style.iconPlacement = value.iconPlacement
  if (typeof value.iconWidth === 'number') style.iconWidth = value.iconWidth
  if (typeof value.iconHeight === 'number') style.iconHeight = value.iconHeight
  if (typeof value.iconInset === 'number') style.iconInset = value.iconInset
  else if (isInsetSides(value.iconInset)) style.iconInset = normalizeInsetSides(value.iconInset)
  if (typeof value.iconOffsetX === 'number') style.iconOffsetX = value.iconOffsetX
  if (typeof value.iconOffsetY === 'number') style.iconOffsetY = value.iconOffsetY
  if (typeof value.iconPadding === 'number') style.iconPadding = value.iconPadding
  if (typeof value.iconMargin === 'number') style.iconMargin = value.iconMargin
  if (typeof value.iconGap === 'number') style.iconGap = value.iconGap
  if (typeof value.iconStrokeColor === 'string') style.iconStrokeColor = value.iconStrokeColor
  if (typeof value.iconFillColor === 'string') style.iconFillColor = value.iconFillColor
  if (typeof value.width === 'number') style.width = value.width
  if (typeof value.height === 'number') style.height = value.height
  if (typeof value.portsTop === 'number') style.portsTop = value.portsTop
  if (typeof value.portsBottom === 'number') style.portsBottom = value.portsBottom
  if (typeof value.portsLeft === 'number') style.portsLeft = value.portsLeft
  if (typeof value.portsRight === 'number') style.portsRight = value.portsRight
  if (typeof value.nodeShape === 'string') style.nodeShape = value.nodeShape
  const rawOutline = value.customOutline
  if (Array.isArray(rawOutline) && rawOutline.length > 0) {
    const segments = normalizeOutlineSegments(rawOutline)
    if (segments.length > 0) style.customOutline = segments
  }
  if (typeof value.customShapeId === 'string') style.customShapeId = value.customShapeId
  if (typeof value.labelTemplate === 'string') style.labelTemplate = value.labelTemplate
  const compositeContent = normalizeCompositeContent(value.compositeContent)
  if (compositeContent) style.compositeContent = compositeContent
  const allowedCompositeShapes: DiagramStyle['compositeShapeType'][] = [
    'rectangle',
    'beveled-rectangle',
    'diamond',
    'circle',
    'trapezoid',
    'slanted-rectangle',
    'custom',
  ]
  if (
    typeof value.compositeShapeType === 'string' &&
    (allowedCompositeShapes as string[]).includes(value.compositeShapeType)
  ) {
    style.compositeShapeType = value.compositeShapeType as NonNullable<DiagramStyle['compositeShapeType']>
  }
  if (typeof value.compositeAutoSize === 'boolean') style.compositeAutoSize = value.compositeAutoSize
  if (typeof value.compositeMinWidth === 'number') style.compositeMinWidth = value.compositeMinWidth
  if (typeof value.compositeMinHeight === 'number') style.compositeMinHeight = value.compositeMinHeight
  const styleBindings = normalizeStylePropertyBindings(value.stylePropertyBindings)
  if (styleBindings) style.stylePropertyBindings = styleBindings
  return Object.keys(style).length ? style : undefined
}

const isInsetSides = (value: unknown): value is InsetSides =>
  isRecord(value) &&
  (typeof value.top === 'number' ||
    typeof value.right === 'number' ||
    typeof value.bottom === 'number' ||
    typeof value.left === 'number')

const normalizeInsetSides = (value: InsetSides): InsetSides => {
  const result: InsetSides = {}
  if (typeof value.top === 'number') result.top = value.top
  if (typeof value.right === 'number') result.right = value.right
  if (typeof value.bottom === 'number') result.bottom = value.bottom
  if (typeof value.left === 'number') result.left = value.left
  return result
}

function normalizeOutlineSegments(arr: unknown[]): OutlineSegment[] {
  const out: OutlineSegment[] = []
  for (const item of arr) {
    if (!isRecord(item) || typeof item.type !== 'string') continue
    const points = item.points
    if (!Array.isArray(points)) continue
    if (item.type === 'line' && points.length >= 2) {
      const p0 = toPoint(points[0])
      const p1 = toPoint(points[1])
      if (p0 != null && p1 != null) out.push({ type: 'line', points: [p0, p1] })
    } else if (item.type === 'bezier' && points.length >= 4) {
      const p0 = toPoint(points[0])
      const p1 = toPoint(points[1])
      const p2 = toPoint(points[2])
      const p3 = toPoint(points[3])
      if (p0 != null && p1 != null && p2 != null && p3 != null) {
        out.push({ type: 'bezier', points: [p0, p1, p2, p3] })
      }
    }
  }
  return out
}

function toPoint(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const x = typeof v[0] === 'number' && Number.isFinite(v[0]) ? v[0] : null
  const y = typeof v[1] === 'number' && Number.isFinite(v[1]) ? v[1] : null
  return x != null && y != null ? [x, y] : null
}

const normalizeStyle = (value: unknown): NodeStyle | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  const style: NodeStyle = {}
  if (typeof value.fillColor === 'string') {
    style.fillColor = value.fillColor
  }
  if (typeof value.strokeColor === 'string') {
    style.strokeColor = value.strokeColor
  }
  if (typeof value.strokeWidth === 'number') {
    style.strokeWidth = value.strokeWidth
  }
  if (typeof value.cornerRadius === 'number') {
    style.cornerRadius = value.cornerRadius
  }
  return Object.keys(style).length ? style : undefined
}

// Types for parsed attrs
export type EntityAttrs = {
  tags: string[]
  customProperties: CustomProperty[]
  diagramStyle?: DiagramStyle
  /** Группа в палитре (0 = note). По умолчанию 0. */
  paletteGroup?: number
  /** Имя символа Material Symbols для палитры (только при отсутствии diagramStyle.iconName) */
  paletteMaterialIcon?: string
  /** UUID файла markdown-документации */
  documentFileId?: string
}

export type TypeAttrs = {
  style?: NodeStyle
  width?: number
  height?: number
  cornerRadius?: number
  defaultDirectoryPath?: string
  /** SVG icon name from public/icons/ for tree display (e.g. actor, component, service) */
  icon?: string
  documentFileId?: string
  customProperties?: CustomProperty[]
}

// Parse entity attrs (for components/relations)
export const parseEntityAttrs = (attrs: string | null): EntityAttrs => {
  if (!attrs) {
    return { tags: [], customProperties: [] }
  }

  try {
    const parsed = JSON.parse(attrs) as unknown
    const record = isRecord(parsed) ? parsed : {}

    const result: EntityAttrs = {
      tags: normalizeTags(record.tags),
      customProperties: normalizeCustomProperties(record.customProperties),
    }
    const diagramStyle = normalizeDiagramStyle(record.diagramStyle)
    if (diagramStyle) {
      result.diagramStyle = diagramStyle
    }
    if (
      typeof record.paletteGroup === 'number' &&
      Number.isInteger(record.paletteGroup) &&
      record.paletteGroup >= 0
    ) {
      result.paletteGroup = record.paletteGroup
    }
    if (typeof record.paletteMaterialIcon === 'string') {
      const trimmed = record.paletteMaterialIcon.trim()
      if (trimmed.length > 0) result.paletteMaterialIcon = trimmed
    }
    if (typeof record.documentFileId === 'string' && record.documentFileId.trim().length > 0) {
      result.documentFileId = record.documentFileId.trim()
    }
    return result
  } catch {
    return { tags: [], customProperties: [] }
  }
}

// Serialize entity attrs (for components/relations)
const stripInternalFlags = (props: CustomProperty[]): Omit<CustomProperty, '_fromType'>[] =>
  props.map(({ _fromType, ...rest }) => rest)

export const serializeEntityAttrs = (attrs: EntityAttrs): string => {
  const result: Record<string, unknown> = {
    tags: attrs.tags,
    customProperties: stripInternalFlags(attrs.customProperties),
  }
  if (attrs.diagramStyle) {
    result.diagramStyle = attrs.diagramStyle
  }
  if (
    typeof attrs.paletteGroup === 'number' &&
    Number.isInteger(attrs.paletteGroup) &&
    attrs.paletteGroup >= 0
  ) {
    result.paletteGroup = attrs.paletteGroup
  }
  if (typeof attrs.paletteMaterialIcon === 'string' && attrs.paletteMaterialIcon.trim().length > 0) {
    result.paletteMaterialIcon = attrs.paletteMaterialIcon.trim()
  }
  if (typeof attrs.documentFileId === 'string' && attrs.documentFileId.trim().length > 0) {
    result.documentFileId = attrs.documentFileId.trim()
  }
  return JSON.stringify(result)
}

// Parse type attrs (for node-types/link-types)
export const parseTypeAttrs = (attrs: string | null): TypeAttrs => {
  if (!attrs) {
    return {}
  }

  try {
    const parsed = JSON.parse(attrs) as unknown
    const record = isRecord(parsed) ? parsed : {}

    const result: TypeAttrs = {}

    const style = normalizeStyle(record.style)
    if (style) {
      result.style = style
    }

    if (typeof record.width === 'number') {
      result.width = record.width
    }
    if (typeof record.height === 'number') {
      result.height = record.height
    }
    if (typeof record.cornerRadius === 'number') {
      result.cornerRadius = record.cornerRadius
    }
    if (typeof record.defaultDirectoryPath === 'string') {
      const normalizedPath = record.defaultDirectoryPath.trim()
      if (normalizedPath.length > 0) {
        result.defaultDirectoryPath = normalizedPath
      }
    }
    if (typeof record.icon === 'string' && record.icon.trim().length > 0) {
      result.icon = record.icon.trim()
    }
    if (typeof record.documentFileId === 'string' && record.documentFileId.trim().length > 0) {
      result.documentFileId = record.documentFileId.trim()
    }

    const customProperties = normalizeCustomProperties(record.customProperties)
    if (customProperties.length > 0) {
      result.customProperties = customProperties
    }

    return result
  } catch {
    return {}
  }
}

// Serialize type attrs (for node-types/link-types)
export const serializeTypeAttrs = (attrs: TypeAttrs): string => {
  const result: Record<string, unknown> = {}

  if (attrs.style) {
    result.style = attrs.style
  }
  if (typeof attrs.width === 'number') {
    result.width = attrs.width
  }
  if (typeof attrs.height === 'number') {
    result.height = attrs.height
  }
  if (typeof attrs.cornerRadius === 'number') {
    result.cornerRadius = attrs.cornerRadius
  }
  if (
    typeof attrs.defaultDirectoryPath === 'string' &&
    attrs.defaultDirectoryPath.trim().length > 0
  ) {
    result.defaultDirectoryPath = attrs.defaultDirectoryPath.trim()
  }
  if (typeof attrs.icon === 'string' && attrs.icon.trim().length > 0) {
    result.icon = attrs.icon.trim()
  }
  if (typeof attrs.documentFileId === 'string' && attrs.documentFileId.trim().length > 0) {
    result.documentFileId = attrs.documentFileId.trim()
  }
  if (attrs.customProperties && attrs.customProperties.length > 0) {
    result.customProperties = stripInternalFlags(attrs.customProperties)
  }
  return JSON.stringify(result)
}
