import {
  CircleNode,
  CompositeNode,
  CustomShapeNode,
  DiamondNode,
  RectangleNode,
  Node as DiagramNode,
  type CContainer,
  type LabelPlacement,
  type NodeImageOptions,
  type TextLabelOptions,
} from '@ngroznykh/papirus'
import type { DiagramStyle } from '@/domain/attrs/notationAttrs'
import { customOutlineToPath2D, customOutlineToSvgPath } from '@/utils/customOutlinePath'
import { DEFAULT_CORNER_CUT_PX, diagramShapeFactories } from '@/utils/diagramShapes'
import { applyContentInsetFromStyle } from '@/features/diagram-style/utils/applyContentInsetFromStyle'

export type DiagramNodeShape =
  | 'rectangle'
  | 'beveled-rectangle'
  | 'diamond'
  | 'circle'
  | 'trapezoid'
  | 'slanted-rectangle'
  | 'custom'
  | 'composite'

export type SpecialRectangleShape = 'sticky-note' | 'folder-tab'

export type DiagramNodeStyle = Record<string, unknown>

export interface DiagramNodeCompositeOptions {
  content: CContainer
  stylePatch?: DiagramNodeStyle
}

export interface CreateDiagramNodeOptions {
  id: string
  x: number
  y: number
  width: number
  height: number
  style: DiagramNodeStyle
  diagramStyle?: DiagramStyle
  label?: string | TextLabelOptions
  icon?: NodeImageOptions
  anchorPoints?: { top: number; right: number; bottom: number; left: number }
  contentInset?: number | { top?: number; right?: number; bottom?: number; left?: number }
  /** Optional override; when omitted, taken from diagramStyle */
  contentInsetBaseStyle?: DiagramStyle
  badges?: Array<{ id: string; iconUrl: string }>
  cornerRadius?: number
  composite?: DiagramNodeCompositeOptions
  specialRectangleShape?: SpecialRectangleShape
}

type ShapeMarkedNode = CustomShapeNode & { noteShape?: boolean; folderShape?: boolean }
type CompositeShapeType = 'rectangle' | 'circle' | 'diamond' | 'custom'

export function resolveDiagramNodeShape(ds?: DiagramStyle): DiagramNodeShape {
  const shape = ds?.nodeShape as DiagramNodeShape | undefined
  switch (shape) {
    case 'beveled-rectangle':
    case 'diamond':
    case 'circle':
    case 'trapezoid':
    case 'slanted-rectangle':
    case 'custom':
    case 'composite':
      return shape
    default:
      return 'rectangle'
  }
}

export function isCustomDiagramNode(node: DiagramNode): node is CustomShapeNode {
  return node instanceof CustomShapeNode
}

export function getDiagramNodeShape(node: DiagramNode): DiagramNodeShape {
  if (node instanceof CompositeNode) return 'composite'
  if (node instanceof DiamondNode) return 'diamond'
  if (node instanceof CircleNode) return 'circle'
  if (isCustomDiagramNode(node)) return (node.shapeType as DiagramNodeShape) ?? 'rectangle'
  return 'rectangle'
}

export function hasSpecialRectangleShape(
  node: DiagramNode,
  specialShape: SpecialRectangleShape
): boolean {
  if (!isCustomDiagramNode(node)) return false
  const marked = node as ShapeMarkedNode
  return specialShape === 'sticky-note' ? marked.noteShape === true : marked.folderShape === true
}

export function resolveCornerCutPx(ds?: DiagramStyle): number {
  const v = ds?.cornerCut
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : DEFAULT_CORNER_CUT_PX
}

export function createDiagramNode(options: CreateDiagramNodeOptions): DiagramNode {
  const ds = options.diagramStyle
  const shape = resolveDiagramNodeShape(ds)
  const commonBase = {
    id: options.id,
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    style: options.style,
    ...(options.anchorPoints ? { anchorPoints: options.anchorPoints } : {}),
    ...(options.badges ? { badges: options.badges } : {}),
    ...(ds?.labelPlacement ? { labelPlacement: ds.labelPlacement as LabelPlacement } : {}),
    ...(typeof ds?.labelGap === 'number' ? { labelGap: ds.labelGap } : {}),
    ...(ds?.lockTransform === true ? { resizeHandlesEnabled: false } : {}),
  }
  const commonOptions = {
    ...commonBase,
    ...(options.label != null ? { label: options.label } : {}),
    ...(options.icon ? { icon: options.icon } : {}),
  }

  let node: DiagramNode
  if (shape === 'rectangle' && options.specialRectangleShape) {
    const factory = diagramShapeFactories[options.specialRectangleShape]
    const markedNode = new CustomShapeNode({
      ...commonOptions,
      path: factory.path,
      svgPath: factory.svgPath,
    }) as ShapeMarkedNode
    markedNode.shapeType = 'rectangle'
    if (options.specialRectangleShape === 'sticky-note') {
      markedNode.noteShape = true
    } else {
      markedNode.folderShape = true
    }
    node = markedNode
  } else if (shape === 'composite' && options.composite) {
    node = createCompositeDiagramNode(commonBase, options, options.composite)
  } else if (shape === 'diamond') {
    node = new DiamondNode(commonOptions)
  } else if (shape === 'circle') {
    node = new CircleNode(commonOptions)
  } else if (shape === 'beveled-rectangle') {
    const cut = resolveCornerCutPx(ds)
    const factory = diagramShapeFactories['beveled-rectangle']
    node = new CustomShapeNode({
      ...commonOptions,
      path: (w, h) => factory.path(w, h, cut),
      svgPath: (w, h) => factory.svgPath(w, h, cut),
    })
  } else if (shape === 'trapezoid') {
    node = createFactoryBackedCustomNode(commonOptions, shape)
  } else if (shape === 'slanted-rectangle') {
    node = createFactoryBackedCustomNode(commonOptions, shape)
  } else if (shape === 'custom' && ds?.customOutline?.length) {
    const segments = ds.customOutline
    const slice = ds.customScaleSlice
    node = new CustomShapeNode({
      ...commonOptions,
      path: (w, h) => customOutlineToPath2D(segments, w, h, slice),
      svgPath: (w, h) => customOutlineToSvgPath(segments, w, h, slice),
    })
  } else {
    node = new RectangleNode({
      ...commonOptions,
      cornerRadius: options.cornerRadius,
    })
  }

  if (node instanceof CustomShapeNode) {
    node.shapeType = shape
  }
  const insetStyle: DiagramStyle = {
    ...(ds ?? {}),
    ...(options.contentInset != null ? { contentInset: options.contentInset } : {}),
  }
  applyContentInsetFromStyle(node, insetStyle, options.contentInsetBaseStyle ?? ds)
  return node
}

function createFactoryBackedCustomNode(
  options: Omit<ConstructorParameters<typeof CustomShapeNode>[0], 'path' | 'svgPath'>,
  shape: 'trapezoid' | 'slanted-rectangle'
): CustomShapeNode {
  const factory = diagramShapeFactories[shape]
  return new CustomShapeNode({
    ...options,
    path: factory.path,
    svgPath: factory.svgPath,
  })
}

function createCompositeDiagramNode(
  commonBase: {
    id: string
    x: number
    y: number
    width: number
    height: number
    style: DiagramNodeStyle
    anchorPoints?: { top: number; right: number; bottom: number; left: number }
    contentInset?: number | { top?: number; right?: number; bottom?: number; left?: number }
    badges?: Array<{ id: string; iconUrl: string }>
  },
  options: CreateDiagramNodeOptions,
  composite: DiagramNodeCompositeOptions
): CompositeNode {
  const ds = options.diagramStyle
  const rawCompositeShape = ds?.compositeShapeType ?? 'rectangle'
  const compositeShapeMappedToCustom =
    rawCompositeShape === 'beveled-rectangle' ||
    rawCompositeShape === 'trapezoid' ||
    rawCompositeShape === 'slanted-rectangle'
  let compositePathFactory: ((w: number, h: number) => Path2D) | undefined
  let compositeSvgPathFactory: ((w: number, h: number) => string) | undefined
  if (rawCompositeShape === 'beveled-rectangle') {
    const cut = resolveCornerCutPx(ds)
    const factory = diagramShapeFactories['beveled-rectangle']
    compositePathFactory = (w, h) => factory.path(w, h, cut)
    compositeSvgPathFactory = (w, h) => factory.svgPath(w, h, cut)
  } else if (rawCompositeShape === 'trapezoid' || rawCompositeShape === 'slanted-rectangle') {
    compositePathFactory = diagramShapeFactories[rawCompositeShape]?.path
    compositeSvgPathFactory = diagramShapeFactories[rawCompositeShape]?.svgPath
  } else if (rawCompositeShape === 'custom' && ds?.customOutline?.length) {
    const segments = ds.customOutline
    const slice = ds.customScaleSlice
    compositePathFactory = (w, h) => customOutlineToPath2D(segments, w, h, slice)
    compositeSvgPathFactory = (w, h) => customOutlineToSvgPath(segments, w, h, slice)
  }

  return new CompositeNode({
    ...commonBase,
    ...(options.label != null ? { label: options.label } : {}),
    style: {
      ...commonBase.style,
      ...composite.stylePatch,
      ...(ds?.fillOpacity != null ? { fillOpacity: ds.fillOpacity } : {}),
      ...(ds?.strokeOpacity != null ? { strokeOpacity: ds.strokeOpacity } : {}),
      ...(ds?.opacity != null ? { opacity: ds.opacity } : {}),
      ...(ds?.lineDash ? { lineDash: ds.lineDash } : {}),
    },
    shapeType:
      compositeShapeMappedToCustom || (rawCompositeShape === 'custom' && compositePathFactory)
        ? 'custom'
        : (rawCompositeShape as CompositeShapeType),
    cornerRadius: options.cornerRadius,
    autoSize: ds?.compositeAutoSize ?? false,
    minWidth: ds?.compositeMinWidth ?? 0,
    minHeight: ds?.compositeMinHeight ?? 0,
    content: composite.content,
    ...(compositePathFactory ? { pathFactory: compositePathFactory } : {}),
    ...(compositeSvgPathFactory ? { svgPath: compositeSvgPathFactory } : {}),
  })
}
