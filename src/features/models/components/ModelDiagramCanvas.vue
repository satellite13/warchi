<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
  DiagramRenderer,
  RectangleNode,
  CircleNode,
  DiamondNode,
  CustomShapeNode,
  ShapeFactories,
  Node as DiagramNode,
  Edge,
  GridOverlay,
  MiniMap,
  InteractionManager,
  TextLabel,
  type ContextMenuTarget,
  type ArrowMarkerConfig,
  type NodeImageOptions,
  type TextStyle,
  type TextLabelOptions,
  type LabelPlacement,
  type EdgePathType,
  type EdgeStyle
} from "@ngroznykh/papirus"
import type { ComponentResponse, NodeTypeResponse, RelationResponse } from "../../../types/api"
import { parseEntityAttrs, type CustomProperty, type DiagramStyle } from "../../notations/notationAttrs"
import type { DiagramAttrs, DiagramNodeInstance, DiagramEdgeInstance } from "../modelAttrs"
import type { EditorDiagram, EditorLink, EditorNode } from "../types"

const props = defineProps<{
  activeDiagram: EditorDiagram | null
  nodes: EditorNode[]
  links: EditorLink[]
  relations: RelationResponse[]
  components: ComponentResponse[]
  nodeTypes: NodeTypeResponse[]
  selectedModelNodeIds: string[]
  selectedModelLinkId: string | null
  connectionValidator?: ((sourceModelNodeId: string, targetModelNodeId: string) => boolean) | null
}>()

const emit = defineEmits<{
  updateDiagram: [next: DiagramAttrs]
  selectNodes: [modelNodeIds: string[]]
  selectLink: [modelLinkId: string]
  selectCanvasElementId: [elementId: string | null]
  canvasContextChange: [ctx: { renderer: DiagramRenderer | null; interactionManager: InteractionManager | null }]
  createNodeFromComponent: [componentId: string, x: number, y: number]
  addExistingNode: [modelNodeId: string, x: number, y: number]
  connectNodes: [
    sourceModelNodeId: string,
    targetModelNodeId: string,
    sourceInstanceId: string,
    targetInstanceId: string,
    sourcePortId?: string,
    targetPortId?: string
  ]
  findInTree: [modelNodeId: string]
  nodeLabelChange: [modelNodeId: string, newLabel: string]
  requestDeleteNodeFromDiagram: [modelNodeId: string]
  requestDeleteLink: [modelLinkId: string]
}>()

// ── Refs ──
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const paletteVisible = ref(true)
const gridVisible = ref(true)
const miniMapVisible = ref(true)
const snapEnabled = ref(false)
const lockAnchorsEnabled = ref(true)
const canUndo = ref(false)
const canRedo = ref(false)

const GRID_SIZE = 20
const MIN_ZOOM = 0.3
const MAX_ZOOM = 2.5
const DEFAULT_NODE_WIDTH = 160
const DEFAULT_NODE_HEIGHT = 56
const COMPONENT_RADIUS = 8

let renderer: DiagramRenderer | null = null
let interactionManager: InteractionManager | null = null
let gridOverlay: GridOverlay | null = null
let miniMap: MiniMap | null = null
let resizeObserver: ResizeObserver | null = null
let cleanupSelectionOverlay: (() => void) | null = null
let suppressSelectionEvent = false

// Maps: papirus element ID → model entity
const nodeIdToInstance = new Map<string, { modelNodeId: string; instanceId: string }>()
const edgeIdToInstance = new Map<string, { modelLinkId: string; edgeId: string }>()

// ── Computed ──
const nodeById = computed(() => new Map(props.nodes.map((node) => [node.id, node])))
const activeNotationId = computed(() => props.activeDiagram?.notationId ?? null)


const instanceNodes = computed(() => props.activeDiagram?.parsedAttrs.instances.nodes ?? [])
const instanceEdges = computed(() => props.activeDiagram?.parsedAttrs.instances.edges ?? [])

const componentDiagramStyleById = computed(() => {
  const notationId = activeNotationId.value
  const map = new Map<string, DiagramStyle | undefined>()
  if (!notationId) return map
  for (const component of props.components) {
    if (component.notationId !== notationId) continue
    const parsedAttrs = parseEntityAttrs(component.attrs ?? null)
    map.set(component.id, parsedAttrs.diagramStyle)
  }
  return map
})

const linkById = computed(() => new Map(props.links.map(l => [l.id, l])))

const relationDiagramStyleById = computed(() => {
  const notationId = activeNotationId.value
  const map = new Map<string, DiagramStyle | undefined>()
  if (!notationId) return map
  for (const rel of props.relations) {
    if (rel.notationId !== notationId) continue
    const parsed = parseEntityAttrs(rel.attrs ?? null)
    map.set(rel.id, parsed.diagramStyle)
  }
  return map
})

const getBoundRelationStyle = (modelLinkId: string): DiagramStyle | undefined => {
  const link = linkById.value.get(modelLinkId)
  const notationId = activeNotationId.value
  if (!link || !notationId) return undefined
  const relationId = link.parsedAttrs.notationRelations[notationId]?.relationId
  if (!relationId) return undefined
  return relationDiagramStyleById.value.get(relationId)
}

const getEffectiveEdgeStyle = (edgeInst: DiagramEdgeInstance): DiagramStyle | undefined => {
  if (edgeInst.attrs?.diagramStyle && typeof edgeInst.attrs.diagramStyle === "object") {
    return edgeInst.attrs.diagramStyle as DiagramStyle
  }
  return getBoundRelationStyle(edgeInst.modelLinkId)
}

const getInstanceEdgeLabel = (edgeInst: DiagramEdgeInstance): string | undefined => {
  const raw = edgeInst.attrs?.label
  if (typeof raw === "string") return raw
  if (raw && typeof raw === "object" && typeof (raw as { text?: unknown }).text === "string") {
    return (raw as { text: string }).text
  }
  return undefined
}

const getPapEdgeLabelText = (edge: Edge): string =>
  typeof edge.label === "string" ? edge.label : edge.label?.text ?? ""

const buildEdgeLabel = (labelText: string | undefined): string | undefined => {
  const text = labelText?.trim()
  if (!text) return undefined
  return text
}

const buildEdgeLabelWithStyle = (labelText: string | undefined, ds?: DiagramStyle): string | TextLabel | undefined => {
  const text = labelText?.trim()
  if (!text) return undefined
  if (!ds?.labelColor && ds?.labelOpacity == null && !ds?.labelFontSize && ds?.labelPadding == null && ds?.labelMargin == null) {
    return text
  }
  const opts: TextLabelOptions = { text }
  const style: TextStyle = {}
  if (ds?.labelColor) style.color = ds.labelColor
  if (ds?.labelOpacity != null) style.opacity = ds.labelOpacity
  if (ds?.labelFontSize) style.fontSize = ds.labelFontSize
  if (Object.keys(style).length) opts.style = style
  if (ds?.labelPadding != null) opts.padding = ds.labelPadding
  if (ds?.labelMargin != null) opts.margin = ds.labelMargin
  return new TextLabel(opts)
}

const buildEdgeLabelBackground = (ds?: DiagramStyle): { color?: string; opacity?: number; padding?: number; borderRadius?: number } | undefined => {
  if (!ds) return undefined

  const background: Record<string, unknown> = {}
  if (ds.labelBgColor) background.color = ds.labelBgColor
  if (ds.labelBgOpacity != null) background.opacity = ds.labelBgOpacity
  if (ds.labelBgPadding != null) background.padding = ds.labelBgPadding
  if (ds.labelBgBorderRadius != null) background.borderRadius = ds.labelBgBorderRadius

  return Object.keys(background).length > 0 ? background : undefined
}

const resolveEdgeOptions = (ds?: DiagramStyle): Partial<{ type: EdgePathType; style: EdgeStyle; startMarker: ArrowMarkerConfig; endMarker: ArrowMarkerConfig; labelOffset: number }> => {
  if (!ds) return {}
  const opts: Partial<{ type: EdgePathType; style: EdgeStyle; startMarker: ArrowMarkerConfig; endMarker: ArrowMarkerConfig; labelOffset: number }> = {}
  const style: EdgeStyle = {}
  if (ds.strokeColor) style.strokeColor = ds.strokeColor
  if (ds.strokeWidth != null) style.strokeWidth = ds.strokeWidth
  if (ds.strokeOpacity != null) style.strokeOpacity = ds.strokeOpacity
  if (ds.opacity != null) style.opacity = ds.opacity
  if (ds.lineDash) style.lineDash = ds.lineDash
  if (Object.keys(style).length) opts.style = style
  if (ds.edgeType) opts.type = ds.edgeType as EdgePathType
  if (ds.startMarkerType) {
    opts.startMarker = {
      type: ds.startMarkerType as ArrowMarkerConfig["type"],
      ...(ds.startMarkerSize != null && { size: ds.startMarkerSize }),
      ...(ds.startMarkerFillColor && { fillColor: ds.startMarkerFillColor }),
      ...(ds.startMarkerFillOpacity != null && { fillOpacity: ds.startMarkerFillOpacity })
    }
  }
  if (ds.endMarkerType) {
    opts.endMarker = {
      type: ds.endMarkerType as ArrowMarkerConfig["type"],
      ...(ds.endMarkerSize != null && { size: ds.endMarkerSize }),
      ...(ds.endMarkerFillColor && { fillColor: ds.endMarkerFillColor }),
      ...(ds.endMarkerFillOpacity != null && { fillOpacity: ds.endMarkerFillOpacity })
    }
  }
  if (ds.edgeLabelOffset != null) opts.labelOffset = ds.edgeLabelOffset
  return opts
}

// ── Style resolution ──
const getBoundComponentStyle = (modelNodeId: string): DiagramStyle | undefined => {
  const node = nodeById.value.get(modelNodeId)
  const notationId = activeNotationId.value
  if (!node || !notationId) return undefined
  const componentId = node.parsedAttrs.notationComponents[notationId]?.componentId
  if (!componentId) return undefined
  return componentDiagramStyleById.value.get(componentId)
}

const getEffectiveStyle = (instance: DiagramNodeInstance): DiagramStyle | undefined => {
  if (instance.attrs?.diagramStyle && typeof instance.attrs.diagramStyle === "object") {
    return instance.attrs.diagramStyle as DiagramStyle
  }
  return getBoundComponentStyle(instance.modelNodeId)
}

const getInstanceDimensions = (instance: { modelNodeId: string; width?: number; height?: number; attrs?: Record<string, unknown> }) => {
  const ds = (instance as DiagramNodeInstance).attrs?.diagramStyle
    ? getEffectiveStyle(instance as DiagramNodeInstance)
    : getBoundComponentStyle(instance.modelNodeId)
  return {
    width: instance.width ?? (typeof ds?.width === "number" ? ds.width : DEFAULT_NODE_WIDTH),
    height: instance.height ?? (typeof ds?.height === "number" ? ds.height : DEFAULT_NODE_HEIGHT)
  }
}

const getComponentMinDimensions = (modelNodeId: string) => {
  const ds = getBoundComponentStyle(modelNodeId)
  return {
    width: typeof ds?.width === "number" ? ds.width : DEFAULT_NODE_WIDTH,
    height: typeof ds?.height === "number" ? ds.height : DEFAULT_NODE_HEIGHT
  }
}

function applyMinSizeConstraint(node: DiagramNode, modelNodeId: string) {
  const original = node.getContentMinSize.bind(node)
  node.getContentMinSize = (ctx: CanvasRenderingContext2D) => {
    const contentMin = original(ctx)
    const compMin = getComponentMinDimensions(modelNodeId)
    return {
      width: Math.max(contentMin.width, compMin.width),
      height: Math.max(contentMin.height, compMin.height)
    }
  }
}

type ComponentShape = "rectangle" | "beveled-rectangle" | "diamond" | "circle" | "trapezoid" | "slanted-rectangle"

const getInstanceArea = (instance: DiagramNodeInstance): number => {
  const { width, height } = getInstanceDimensions(instance)
  return width * height
}

const getInstanceZIndex = (instance: DiagramNodeInstance): number | null => {
  const raw = instance.attrs?.zIndex
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw
  }
  return null
}

const sortInstancesByZLayer = (instances: DiagramNodeInstance[]): DiagramNodeInstance[] =>
  [...instances].sort((a, b) => {
    const areaDiff = getInstanceArea(b) - getInstanceArea(a)
    if (areaDiff !== 0) return areaDiff
    const aSelected = props.selectedModelNodeIds.includes(a.modelNodeId)
    const bSelected = props.selectedModelNodeIds.includes(b.modelNodeId)
    if (aSelected !== bSelected) return aSelected ? 1 : -1
    const aZ = getInstanceZIndex(a)
    const bZ = getInstanceZIndex(b)
    if (aZ != null && bZ != null && aZ !== bZ) return aZ - bZ
    if (aZ != null && bZ == null) return 1
    if (aZ == null && bZ != null) return -1
    return a.id.localeCompare(b.id)
  })

const reorderRendererNodesBySize = (orderedInstances: DiagramNodeInstance[]) => {
  if (!renderer) return
  const nodesMap = renderer.nodes as Map<string, DiagramNode>
  const orderedNodeIds = orderedInstances.map((instance) => `instance-${instance.id}`)
  const orderedNodes: DiagramNode[] = []
  const orderedIdSet = new Set(orderedNodeIds)

  for (const nodeId of orderedNodeIds) {
    const node = nodesMap.get(nodeId)
    if (node) orderedNodes.push(node)
  }

  // Preserve any non-instance nodes (if ever added) after managed nodes.
  for (const [nodeId, node] of nodesMap) {
    if (!orderedIdSet.has(nodeId)) orderedNodes.push(node)
  }

  const currentOrder = Array.from(nodesMap.keys())
  const nextOrder = orderedNodes.map((node) => node.id)
  const sameOrder =
    currentOrder.length === nextOrder.length &&
    currentOrder.every((id, index) => id === nextOrder[index])

  if (sameOrder) return

  nodesMap.clear()
  for (const node of orderedNodes) {
    nodesMap.set(node.id, node)
  }
}

const persistNodeZOrder = (orderedInstances: DiagramNodeInstance[]) => {
  if (!props.activeDiagram) return
  const next = cloneDiagramAttrs()
  const instanceById = new Map(next.instances.nodes.map((instance) => [instance.id, instance]))
  let changed = false

  for (const [zIndex, source] of orderedInstances.entries()) {
    const target = instanceById.get(source.id)
    if (!target) continue
    const current = typeof target.attrs?.zIndex === "number" ? target.attrs.zIndex : null
    if (current === zIndex) continue
    if (!target.attrs) target.attrs = {}
    target.attrs.zIndex = zIndex
    changed = true
  }

  if (changed) {
    emit("updateDiagram", next)
  }
}

function getComponentShape(ds?: DiagramStyle): ComponentShape {
  const shape = ds?.nodeShape as ComponentShape | undefined
  switch (shape) {
    case "beveled-rectangle":
    case "diamond":
    case "circle":
    case "trapezoid":
    case "slanted-rectangle":
      return shape
    default:
      return "rectangle"
  }
}

function createBeveledRectanglePath(width: number, height: number): Path2D {
  const path = new Path2D()
  const cut = Math.min(width, height) * 0.16
  path.moveTo(cut, 0)
  path.lineTo(width - cut, 0)
  path.lineTo(width, cut)
  path.lineTo(width, height - cut)
  path.lineTo(width - cut, height)
  path.lineTo(cut, height)
  path.lineTo(0, height - cut)
  path.lineTo(0, cut)
  path.closePath()
  return path
}

function createTrapezoidPath(width: number, height: number): Path2D {
  const path = new Path2D()
  const topInset = width * 0.18
  path.moveTo(topInset, 0)
  path.lineTo(width - topInset, 0)
  path.lineTo(width, height)
  path.lineTo(0, height)
  path.closePath()
  return path
}

function getNodeScopedPropertyValues(modelNodeId: string): Record<string, unknown> {
  const node = nodeById.value.get(modelNodeId)
  const notationId = activeNotationId.value
  if (!node || !notationId) return {}
  const componentId = node.parsedAttrs.notationComponents[notationId]?.componentId
  if (!componentId) return {}
  return node.parsedAttrs.componentProperties[notationId]?.[componentId] ?? {}
}

function getNodeComponentCustomProperties(modelNodeId: string): CustomProperty[] {
  const node = nodeById.value.get(modelNodeId)
  const notationId = activeNotationId.value
  if (!node || !notationId) return []
  const componentId = node.parsedAttrs.notationComponents[notationId]?.componentId
  if (!componentId) return []
  const component = props.components.find((c) => c.id === componentId)
  if (!component) return []
  return parseEntityAttrs(component.attrs ?? null).customProperties
}

function resolveLabelTemplate(
  template: string,
  name: string,
  customProperties: CustomProperty[],
  scopedValues: Record<string, unknown>
): string {
  return template.replace(/\$\{(\w+)\}/g, (_match, key: string) => {
    if (key === "name") return name
    const prop = customProperties.find((p) => p.name === key)
    if (prop) {
      const val = scopedValues[key] ?? prop.defaultValue
      return val != null ? String(val) : ""
    }
    return ""
  })
}

function buildNodeLabel(name: string, ds?: DiagramStyle, modelNodeId?: string): string | TextLabelOptions {
  const hasTemplate = !!ds?.labelTemplate
  let displayText = name
  if (hasTemplate && modelNodeId) {
    const customProps = getNodeComponentCustomProperties(modelNodeId)
    const scopedValues = getNodeScopedPropertyValues(modelNodeId)
    displayText = resolveLabelTemplate(ds!.labelTemplate!, name, customProps, scopedValues)
  }

  const hasStyle = !!(ds?.labelColor || ds?.labelOpacity != null || ds?.labelFontSize || ds?.labelPadding != null || ds?.labelMargin != null)

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
  if (Object.keys(style).length) opts.style = style
  if (ds?.labelPadding != null) opts.padding = ds.labelPadding
  if (ds?.labelMargin != null) opts.margin = ds.labelMargin
  return opts
}

function buildNodeIcon(ds?: DiagramStyle) {
  if (!ds?.iconName) return undefined
  const placement = ds.iconPlacement
  const resolvedPlacement: NodeImageOptions["placement"] =
    placement === "center" ||
    placement === "top" ||
    placement === "bottom" ||
    placement === "left" ||
    placement === "right" ||
    placement === "top-left" ||
    placement === "top-right" ||
    placement === "bottom-left" ||
    placement === "bottom-right"
      ? placement
      : "left"
  return {
    source: `/icons/${ds.iconName}.svg`,
    placement: resolvedPlacement,
    width: ds.iconWidth ?? 20,
    height: ds.iconHeight ?? 20,
    fit: "contain" as const,
    ...(ds.iconPadding != null ? { padding: ds.iconPadding } : {}),
    ...(ds.iconMargin != null ? { margin: ds.iconMargin } : {}),
    ...(ds.iconGap != null ? { gap: ds.iconGap } : {}),
    ...(ds.iconStrokeColor ? { strokeColor: ds.iconStrokeColor } : {}),
    ...(ds.iconFillColor ? { fillColor: ds.iconFillColor } : {})
  }
}

function resolveInstanceStyle(instance: DiagramNodeInstance, ds?: DiagramStyle) {
  const dims = getInstanceDimensions(instance)
  const style: Record<string, unknown> = {
    fillColor: ds?.fillColor ?? "#ffffff",
    strokeColor: ds?.strokeColor ?? "#d1d5db",
    strokeWidth: ds?.strokeWidth ?? 1
  }
  if (ds?.fillOpacity != null) style.fillOpacity = ds.fillOpacity
  if (ds?.strokeOpacity != null) style.strokeOpacity = ds.strokeOpacity
  if (ds?.opacity != null) style.opacity = ds.opacity
  if (ds?.lineDash) style.lineDash = ds.lineDash
  return {
    width: dims.width,
    height: dims.height,
    style,
    cornerRadius: ds?.cornerRadius ?? COMPONENT_RADIUS
  }
}

function resolveAnchorPoints(ds?: DiagramStyle): { top: number; bottom: number; left: number; right: number } {
  const normalize = (value: unknown, fallback: number): number => {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
  };
  return {
    top: normalize(ds?.portsTop, 3),
    bottom: normalize(ds?.portsBottom, 3),
    left: normalize(ds?.portsLeft, 1),
    right: normalize(ds?.portsRight, 1)
  };
}

function isCustomShapeNode(node: DiagramNode): node is CustomShapeNode {
  return node instanceof CustomShapeNode
}

function getNodeShapeFromNode(node: DiagramNode): ComponentShape {
  if (node instanceof DiamondNode) return "diamond"
  if (node instanceof CircleNode) return "circle"
  if (isCustomShapeNode(node)) return (node.shapeType as ComponentShape) ?? "rectangle"
  return "rectangle"
}

// ── Node creation ──
function createInstanceNode(instance: DiagramNodeInstance): DiagramNode {
  const ds = getEffectiveStyle(instance)
  const visual = resolveInstanceStyle(instance, ds)
  const shape = getComponentShape(ds)
  const nodeName = nodeById.value.get(instance.modelNodeId)?.name ?? "Node"

  const commonOptions = {
    id: `instance-${instance.id}`,
    x: instance.x,
    y: instance.y,
    width: visual.width,
    height: visual.height,
    label: buildNodeLabel(nodeName, ds, instance.modelNodeId),
    style: visual.style,
    anchorPoints: resolveAnchorPoints(ds),
    ...(buildNodeIcon(ds) ? { icon: buildNodeIcon(ds) } : {})
  }

  let node: DiagramNode
  if (shape === "diamond") {
    node = new DiamondNode(commonOptions)
  } else if (shape === "circle") {
    node = new CircleNode(commonOptions)
  } else if (shape === "beveled-rectangle") {
    node = new CustomShapeNode({
      ...commonOptions,
      path: (w, h) => createBeveledRectanglePath(w, h)
    })
  } else if (shape === "trapezoid") {
    node = new CustomShapeNode({
      ...commonOptions,
      path: (w, h) => createTrapezoidPath(w, h)
    })
  } else if (shape === "slanted-rectangle") {
    node = new CustomShapeNode({
      ...commonOptions,
      path: (w, h) => ShapeFactories.parallelogram(w, h)
    })
  } else {
    node = new RectangleNode({
      ...commonOptions,
      cornerRadius: visual.cornerRadius
    })
  }

  if (node instanceof CustomShapeNode) {
    node.shapeType = shape
  }
  if (ds?.labelPlacement) {
    node.labelPlacement = ds.labelPlacement as LabelPlacement
  }
  applyMinSizeConstraint(node, instance.modelNodeId)
  return node
}

// ── Sync diagram ──
function syncDiagram() {
  if (!renderer) return
  const currentNodeIds = new Set<string>()
  const currentEdgeIds = new Set<string>()
  nodeIdToInstance.clear()
  edgeIdToInstance.clear()
  const orderedInstances = sortInstancesByZLayer(instanceNodes.value)

  // Sync nodes
  for (const instance of orderedInstances) {
    const papNodeId = `instance-${instance.id}`
    currentNodeIds.add(papNodeId)
    nodeIdToInstance.set(papNodeId, { modelNodeId: instance.modelNodeId, instanceId: instance.id })

    const existing = renderer.getNode(papNodeId)
    if (existing) {
      const ds = getEffectiveStyle(instance)
      const expectedShape = getComponentShape(ds)
      const existingShape = getNodeShapeFromNode(existing)

      if (expectedShape !== existingShape) {
        renderer.removeNode(papNodeId)
        renderer.addNode(createInstanceNode(instance))
        continue
      }

      // Update in-place
      const visual = resolveInstanceStyle(instance, ds)
      const nodeName = nodeById.value.get(instance.modelNodeId)?.name ?? "Node"

      existing.x = instance.x
      existing.y = instance.y
      existing.width = visual.width
      existing.height = visual.height
      existing.style = visual.style
      existing.anchorPoints = resolveAnchorPoints(ds)
      const newLabel = buildNodeLabel(nodeName, ds, instance.modelNodeId)
      if (typeof newLabel === "string") {
        existing.label = newLabel
      } else {
        existing.label = new TextLabel(newLabel)
      }
      if (existing instanceof RectangleNode) {
        existing.cornerRadius = visual.cornerRadius
      }
      existing.icon = buildNodeIcon(ds)
      if (ds?.labelPlacement) {
        existing.labelPlacement = ds.labelPlacement as LabelPlacement
      }
      applyMinSizeConstraint(existing, instance.modelNodeId)
    } else {
      renderer.addNode(createInstanceNode(instance))
    }
  }

  // Sync edges
  for (const edge of instanceEdges.value) {
    const papEdgeId = `edge-${edge.id}`
    currentEdgeIds.add(papEdgeId)
    edgeIdToInstance.set(papEdgeId, { modelLinkId: edge.modelLinkId, edgeId: edge.id })

    const sourcePapId = `instance-${edge.sourceInstanceId}`
    const targetPapId = `instance-${edge.targetInstanceId}`

    if (!currentNodeIds.has(sourcePapId) || !currentNodeIds.has(targetPapId)) continue

    const ds = getEffectiveEdgeStyle(edge)
    const edgeOpts = resolveEdgeOptions(ds)
    const edgeLabel = getInstanceEdgeLabel(edge)
    const edgeLabelConfig = buildEdgeLabelWithStyle(edgeLabel, ds) ?? buildEdgeLabel(edgeLabel)
    const edgeLabelBackground = buildEdgeLabelBackground(ds)

    const existing = renderer.getEdge(papEdgeId)
    if (existing) {
      if (existing.from.nodeId !== sourcePapId) {
        existing.from = {
          nodeId: sourcePapId,
          portId: (edge.attrs?.fromPortId as string | undefined) ?? existing.from.portId
        }
      }
      if (existing.to.nodeId !== targetPapId) {
        existing.to = {
          nodeId: targetPapId,
          portId: (edge.attrs?.toPortId as string | undefined) ?? existing.to.portId
        }
      }
      if (edgeOpts.style) existing.style = { ...existing.style, ...edgeOpts.style }
      if (edgeOpts.type) existing.type = edgeOpts.type
      if (edgeOpts.startMarker !== undefined) existing.startMarker = edgeOpts.startMarker
      if (edgeOpts.endMarker !== undefined) existing.endMarker = edgeOpts.endMarker
      existing.labelOffset = edgeOpts.labelOffset ?? existing.labelOffset
      existing.label = edgeLabelConfig
      if (existing.label) {
        existing.label.style = {
          ...(existing.label.style || {}),
          ...(ds?.labelColor ? { color: ds.labelColor } : {}),
          ...(ds?.labelOpacity != null ? { opacity: ds.labelOpacity } : {}),
          ...(ds?.labelFontSize ? { fontSize: ds.labelFontSize } : {})
        }
      }
      if (existing.label && ds?.labelPadding != null) {
        existing.label.padding = ds.labelPadding
      }
      if (existing.label && ds?.labelMargin != null) {
        existing.label.margin = ds.labelMargin
      }
      ;(existing as unknown as { labelBackground?: Record<string, unknown> }).labelBackground = edgeLabelBackground
    } else {
      const newEdge = new Edge({
        id: papEdgeId,
        from: { nodeId: sourcePapId, portId: edge.attrs?.fromPortId as string | undefined },
        to: { nodeId: targetPapId, portId: edge.attrs?.toPortId as string | undefined },
        type: edgeOpts.type ?? "bezier",
        arrowType: ds?.endMarkerType ? undefined : "single",
        style: edgeOpts.style,
        startMarker: edgeOpts.startMarker,
        endMarker: edgeOpts.endMarker,
        ...(edgeLabelConfig !== undefined ? { label: edgeLabelConfig } : {}),
        ...(edgeOpts.labelOffset != null ? { labelOffset: edgeOpts.labelOffset } : {}),
        ...(edgeLabelBackground ? { labelBackground: edgeLabelBackground } : {}),
        lockAnchors: lockAnchorsEnabled.value
      })
      if (newEdge.label) {
        newEdge.label.style = {
          ...(newEdge.label.style || {}),
          ...(ds?.labelColor ? { color: ds.labelColor } : {}),
          ...(ds?.labelOpacity != null ? { opacity: ds.labelOpacity } : {}),
          ...(ds?.labelFontSize ? { fontSize: ds.labelFontSize } : {})
        }
      }
      renderer.addEdge(newEdge)
    }
  }

  // Remove stale nodes and edges
  for (const [id] of renderer.nodes) {
    if (!currentNodeIds.has(id)) renderer.removeNode(id)
  }
  for (const [id] of renderer.edges) {
    if (!currentEdgeIds.has(id)) renderer.removeEdge(id)
  }

  reorderRendererNodesBySize(orderedInstances)
  renderer.markDirty()
  updateSelection()
}

// ── Selection sync ──
function updateSelection() {
  if (!renderer || !interactionManager) return
  const selectionManager = interactionManager.selection

  // Sync selection from props
  const selectedNodeIds = props.selectedModelNodeIds
  const selectedLinkId = props.selectedModelLinkId

  const targetPapIds: string[] = []

  if (selectedNodeIds.length > 0) {
    const selectedSet = new Set(selectedNodeIds)
    for (const [papId, entity] of nodeIdToInstance) {
      if (selectedSet.has(entity.modelNodeId)) {
        targetPapIds.push(papId)
      }
    }
  } else if (selectedLinkId) {
    for (const [papId, entity] of edgeIdToInstance) {
      if (entity.modelLinkId === selectedLinkId) {
        targetPapIds.push(papId)
        break
      }
    }
  }

  if (targetPapIds.length > 0) {
    const currentIds = selectionManager.selectedIds
    const needsSync = targetPapIds.length !== currentIds.size ||
      targetPapIds.some((id) => !currentIds.has(id))
    if (needsSync) {
      suppressSelectionEvent = true
      try {
        selectionManager.selectMultiple(targetPapIds)
      } finally {
        suppressSelectionEvent = false
      }
    }
  } else {
    if (selectionManager.selectedIds.size > 0) {
      suppressSelectionEvent = true
      try {
        selectionManager.clearSelection()
      } finally {
        suppressSelectionEvent = false
      }
    }
  }
}

// ── Detect label changes from inline editing ──
function detectLabelChanges() {
  if (!renderer) return
  for (const [papNodeId, entity] of nodeIdToInstance) {
    const papNode = renderer.getNode(papNodeId)
    if (!papNode) continue
    const labelText = typeof papNode.label === "string"
      ? papNode.label
      : papNode.label?.editableText ?? papNode.label?.text ?? ""
    const modelNode = nodeById.value.get(entity.modelNodeId)
    if (modelNode && labelText !== modelNode.name) {
      emit("nodeLabelChange", entity.modelNodeId, labelText)
    }
  }
}

function detectEdgeLabelChanges() {
  if (!renderer) return

  const next = cloneDiagramAttrs()
  let changed = false

  for (const [papEdgeId, entity] of edgeIdToInstance) {
    const papEdge = renderer.getEdge(papEdgeId)
    if (!papEdge) continue

    const edgeInst = next.instances.edges.find((edge) => edge.id === entity.edgeId)
    if (!edgeInst) continue

    const nextLabel = getPapEdgeLabelText(papEdge)
    const currentLabel = getInstanceEdgeLabel(edgeInst) ?? ""
    if (nextLabel === currentLabel) continue

    if (!edgeInst.attrs) edgeInst.attrs = {}
    if (nextLabel.length > 0) edgeInst.attrs.label = nextLabel
    else delete edgeInst.attrs.label

    if (Object.keys(edgeInst.attrs).length === 0) {
      delete edgeInst.attrs
    }
    changed = true
  }

  if (changed) {
    syncEdgePortIds(next)
    emit("updateDiagram", next)
  }
}

function detectEdgePortChanges() {
  if (!renderer || !lockAnchorsEnabled.value) return

  const next = cloneDiagramAttrs()
  let changed = false

  for (const [papEdgeId, entity] of edgeIdToInstance) {
    const papEdge = renderer.getEdge(papEdgeId)
    if (!papEdge) continue

    const edgeInst = next.instances.edges.find((edge) => edge.id === entity.edgeId)
    if (!edgeInst) continue

    const nextFromPortId = papEdge.from.portId ?? undefined
    const nextToPortId = papEdge.to.portId ?? undefined
    const currentFromPortId = edgeInst.attrs?.fromPortId as string | undefined
    const currentToPortId = edgeInst.attrs?.toPortId as string | undefined

    if (nextFromPortId === currentFromPortId && nextToPortId === currentToPortId) {
      continue
    }

    if (!edgeInst.attrs) edgeInst.attrs = {}
    if (nextFromPortId) edgeInst.attrs.fromPortId = nextFromPortId
    else delete edgeInst.attrs.fromPortId
    if (nextToPortId) edgeInst.attrs.toPortId = nextToPortId
    else delete edgeInst.attrs.toPortId

    if (Object.keys(edgeInst.attrs).length === 0) {
      delete edgeInst.attrs
    }
    changed = true
  }

  if (changed) {
    emit("updateDiagram", next)
  }
}

function setEdgeTypeFromContext(edgeInstanceId: string, edgeType: EdgePathType) {
  const next = cloneDiagramAttrs()
  const edgeInst = next.instances.edges.find((edge) => edge.id === edgeInstanceId)
  if (!edgeInst) return

  const baseStyle =
    edgeInst.attrs?.diagramStyle && typeof edgeInst.attrs.diagramStyle === "object"
      ? (edgeInst.attrs.diagramStyle as Record<string, unknown>)
      : {}

  const currentType = (baseStyle.edgeType as EdgePathType | undefined) ?? "bezier"
  if (currentType === edgeType) return

  if (!edgeInst.attrs) edgeInst.attrs = {}
  edgeInst.attrs.diagramStyle = {
    ...baseStyle,
    edgeType
  }
  emit("updateDiagram", next)
}

// ── Persist positions from papirus back to model ──
function persistNodePositions(papNodeIds: string[]) {
  if (!renderer) return
  const next = cloneDiagramAttrs()
  let changed = false
  for (const papNodeId of papNodeIds) {
    const entity = nodeIdToInstance.get(papNodeId)
    if (!entity) continue
    const papNode = renderer.getNode(papNodeId)
    if (!papNode) continue
    const instance = next.instances.nodes.find((n) => n.id === entity.instanceId)
    if (!instance) continue
    instance.x = papNode.x
    instance.y = papNode.y
    instance.width = papNode.width
    instance.height = papNode.height
    changed = true
  }
  if (changed) {
    syncEdgePortIds(next)
    emit("updateDiagram", next)
  }
}

function syncEdgePortIds(diagramAttrs: DiagramAttrs) {
  if (!renderer || !lockAnchorsEnabled.value) return
  for (const edgeInst of diagramAttrs.instances.edges) {
    const papEdge = renderer.getEdge(`edge-${edgeInst.id}`)
    if (!papEdge) continue
    if (!edgeInst.attrs) edgeInst.attrs = {}
    if (papEdge.from.portId) edgeInst.attrs.fromPortId = papEdge.from.portId
    else delete edgeInst.attrs.fromPortId
    if (papEdge.to.portId) edgeInst.attrs.toPortId = papEdge.to.portId
    else delete edgeInst.attrs.toPortId
  }
}

// ── Renderer init ──
function initRenderer(r: DiagramRenderer) {
  renderer = r

  // Grid overlay
  gridOverlay = new GridOverlay({ gridSize: 24, color: "#e2e8f0" })
  r.use(gridOverlay)

  // MiniMap
  miniMap = new MiniMap({
    enabled: miniMapVisible.value,
    width: 190,
    height: 128,
    padding: 12,
    backgroundColor: "transparent",
    anchor: "bottom-left"
  })
  r.use(miniMap)

  // Selection outline overlay — registered BEFORE enableInteractions so it
  // renders beneath anchor points and resize handles drawn by InteractionManager.
  cleanupSelectionOverlay = r.addOverlayRenderer((ctx) => {
    const selectedNodeIds = props.selectedModelNodeIds
    if (selectedNodeIds.length === 0) return

    const selectedSet = new Set(selectedNodeIds)
    const zoom = renderer?.zoom || 1

    ctx.save()

    for (const [papId, entity] of nodeIdToInstance) {
      if (!selectedSet.has(entity.modelNodeId)) continue
      const node = renderer?.getNode(papId)
      if (!node) continue
      const bounds = node.getBounds()
      ctx.shadowColor = "rgba(99, 102, 241, 0.45)"
      ctx.shadowBlur = 12 / zoom
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 2 / zoom
      ctx.fillStyle = "rgba(99, 102, 241, 0.08)"
      ctx.beginPath()
      ctx.roundRect(bounds.x - 2 / zoom, bounds.y - 2 / zoom, bounds.width + 4 / zoom, bounds.height + 4 / zoom, 4 / zoom)
      ctx.fill()
    }

    ctx.restore()
  })

  // Enable interactions (after selection overlay so anchors render on top)
  interactionManager = r.enableInteractions({
    snapToGrid: snapEnabled.value,
    gridSize: GRID_SIZE,
    keymap: { deleteKeys: [] }
  })
  emit("canvasContextChange", { renderer: r, interactionManager })

  // Selection events → emit selectNodes/selectLink
  interactionManager.selection.on("select", (elementIds: string[]) => {
    if (suppressSelectionEvent) return
    if (elementIds.length === 0) {
      emit("selectCanvasElementId", null)
      return
    }
    emit("selectCanvasElementId", elementIds[0] ?? null)

    const modelNodeIds: string[] = []
    for (const elementId of elementIds) {
      const nodeEntity = nodeIdToInstance.get(elementId)
      if (nodeEntity) {
        modelNodeIds.push(nodeEntity.modelNodeId)
      }
    }
    if (modelNodeIds.length > 0) {
      emit("selectNodes", modelNodeIds)
      return
    }

    if (elementIds.length === 1) {
      const edgeEntity = edgeIdToInstance.get(elementIds[0]!)
      if (edgeEntity) {
        emit("selectLink", edgeEntity.modelLinkId)
      }
    }
  })

  // Drag end → persist position changes
  interactionManager.drag.on("dragend", (nodeIds: string[]) => {
    persistNodePositions(nodeIds)
  })

  // Resize end → persist size changes
  interactionManager.resize.on("resizeEnd", (nodeId: string) => {
    persistNodePositions([nodeId])
  })

  // Connection validator: translate papirus node IDs to model node IDs and delegate
  interactionManager.connection.connectionValidator = (sourcePapId: string, targetPapId: string) => {
    if (!props.connectionValidator) return true
    const sourceEntity = nodeIdToInstance.get(sourcePapId)
    const targetEntity = nodeIdToInstance.get(targetPapId)
    if (!sourceEntity || !targetEntity) return false
    return props.connectionValidator(sourceEntity.modelNodeId, targetEntity.modelNodeId)
  }

  // History → sync canUndo/canRedo + detect label changes
  interactionManager.history.on("change", () => {
    canUndo.value = interactionManager!.history.canUndo
    canRedo.value = interactionManager!.history.canRedo
    detectEdgePortChanges()
    detectLabelChanges()
    detectEdgeLabelChanges()
  })

  // Connection → emit connectNodes
  interactionManager.connection.on("connect", (edge: Edge) => {
    const sourceEntity = nodeIdToInstance.get(edge.from.nodeId)
    const targetEntity = nodeIdToInstance.get(edge.to.nodeId)
    if (sourceEntity && targetEntity) {
      emit("connectNodes", sourceEntity.modelNodeId, targetEntity.modelNodeId,
           sourceEntity.instanceId, targetEntity.instanceId, edge.from.portId, edge.to.portId)
    }
    // Remove the edge papirus created — parent will add it through state
    renderer?.removeEdge(edge.id)
  })

  interactionManager.connection.on("edgeReconnect", () => {
    detectEdgePortChanges()
  })

  // Context menu
  r.enableContextMenu({
    menu: {
      node: (target: ContextMenuTarget) => {
        if (target.type !== "node") return []
        const entity = nodeIdToInstance.get(target.node.id)
        if (!entity) return []
        return [
          {
            label: "Найти в дереве",
            icon: "account_tree",
            action: () => emit("findInTree", entity.modelNodeId)
          },
          {
            label: "Удалить с диаграммы",
            icon: "delete",
            action: () => emit("requestDeleteNodeFromDiagram", entity.modelNodeId)
          }
        ]
      },
      edge: (target: ContextMenuTarget) => {
        if (target.type !== "edge") return []
        const entity = edgeIdToInstance.get(target.edge.id)
        if (!entity) return []

        const edgeInst = instanceEdges.value.find((edge) => edge.id === entity.edgeId)
        const currentType = ((getEffectiveEdgeStyle(edgeInst as DiagramEdgeInstance)?.edgeType as EdgePathType | undefined) ?? "bezier")

        return [
          {
            label: "Тип связи",
            icon: "conversion_path",
            items: [
              {
                label: "Прямая",
                icon: "remove",
                enabled: currentType !== "straight",
                action: () => setEdgeTypeFromContext(entity.edgeId, "straight")
              },
              {
                label: "Ломаная",
                icon: "timeline",
                enabled: currentType !== "polyline",
                action: () => setEdgeTypeFromContext(entity.edgeId, "polyline")
              },
              {
                label: "Безье",
                icon: "line_curve",
                enabled: currentType !== "bezier",
                action: () => setEdgeTypeFromContext(entity.edgeId, "bezier")
              }
            ]
          },
          {
            separator: true
          },
          {
            label: "Удалить",
            icon: "delete",
            action: () => emit("requestDeleteLink", entity.modelLinkId)
          }
        ]
      }
    }
  })

  syncDiagram()
}

// ── Helpers ──
const cloneDiagramAttrs = (): DiagramAttrs => {
  const source = props.activeDiagram?.parsedAttrs
  if (!source) return { instances: { nodes: [], edges: [] } }
  return JSON.parse(JSON.stringify(source)) as DiagramAttrs
}

const getCanvasCenter = (): { x: number; y: number } => {
  const el = containerRef.value
  if (!el) return { x: 0, y: 0 }
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

// ── Exposed API ──
const zoomIn = () => {
  interactionManager?.navigation.setZoom((renderer?.zoom ?? 1) * 1.2, getCanvasCenter())
}

const zoomOut = () => {
  interactionManager?.navigation.setZoom((renderer?.zoom ?? 1) / 1.2, getCanvasCenter())
}

const resetView = () => {
  interactionManager?.navigation.setZoom(1, getCanvasCenter())
}

const fitToView = () => {
  interactionManager?.navigation.fitToView(50)
}

const zoomToSelection = () => {
  if (!interactionManager || !renderer) return
  if (props.selectedModelNodeIds.length === 0) return
  const selectedSet = new Set(props.selectedModelNodeIds)
  const selectedInstances = instanceNodes.value.filter((node) => selectedSet.has(node.modelNodeId))
  if (selectedInstances.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const instance of selectedInstances) {
    const dims = getInstanceDimensions(instance)
    minX = Math.min(minX, instance.x)
    minY = Math.min(minY, instance.y)
    maxX = Math.max(maxX, instance.x + dims.width)
    maxY = Math.max(maxY, instance.y + dims.height)
  }
  interactionManager.navigation.zoomToRect(
    { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    64
  )
}

const autoLayoutNodes = () => {
  if (!props.activeDiagram) return
  const next = cloneDiagramAttrs()
  const paddingX = 48
  const paddingY = 40
  const columnGap = 48
  const rowGap = 28
  const columns = Math.max(1, Math.ceil(Math.sqrt(next.instances.nodes.length || 1)))
  next.instances.nodes.forEach((node, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    const width = node.width ?? DEFAULT_NODE_WIDTH
    const height = node.height ?? DEFAULT_NODE_HEIGHT
    node.x = paddingX + col * (width + columnGap)
    node.y = paddingY + row * (height + rowGap)
  })
  emit("updateDiagram", next)
  requestAnimationFrame(() => fitToView())
}

const toggleGrid = (): boolean => {
  gridVisible.value = !gridVisible.value
  gridOverlay?.setEnabled(gridVisible.value)
  renderer?.markDirty()
  return gridVisible.value
}

const getGridVisible = () => gridVisible.value

const toggleMiniMap = (): boolean => {
  miniMapVisible.value = !miniMapVisible.value
  miniMap?.setEnabled(miniMapVisible.value)
  renderer?.markDirty()
  return miniMapVisible.value
}

const getMiniMapVisible = () => miniMapVisible.value

const toggleSnap = (): boolean => {
  snapEnabled.value = !snapEnabled.value
  if (interactionManager) {
    interactionManager.drag.setSnapToGrid(snapEnabled.value)
    interactionManager.resize.setSnapToGrid(snapEnabled.value)
  }
  return snapEnabled.value
}

const getSnapEnabled = () => snapEnabled.value

const undo = () => {
  interactionManager?.history.undo()
}

const redo = () => {
  interactionManager?.history.redo()
}

const resetHistory = () => {
  interactionManager?.history.clear()
  canUndo.value = false
  canRedo.value = false
}

const getCanUndo = () => canUndo.value
const getCanRedo = () => canRedo.value

const toggleLockAnchors = (): boolean => {
  lockAnchorsEnabled.value = !lockAnchorsEnabled.value
  if (renderer) {
    for (const [, edge] of renderer.edges) {
      edge.lockAnchors = lockAnchorsEnabled.value
    }
  }
  return lockAnchorsEnabled.value
}

const getLockAnchorsEnabled = () => lockAnchorsEnabled.value

// ── Drop handling ──
const normalizeDropCoordinates = (event: DragEvent): { x: number; y: number } => {
  if (!renderer) return { x: 0, y: 0 }
  const world = renderer.screenToWorld(event.clientX, event.clientY)
  const snapTo = (value: number) => snapEnabled.value ? Math.round(value / GRID_SIZE) * GRID_SIZE : value
  return {
    x: Math.max(24, snapTo(world.x - 70)),
    y: Math.max(24, snapTo(world.y - 28))
  }
}

const onDragOver = (event: DragEvent) => {
  if (!props.activeDiagram) return
  event.preventDefault()
}

const onDrop = (event: DragEvent) => {
  if (!props.activeDiagram) return
  event.preventDefault()
  const { x, y } = normalizeDropCoordinates(event)

  const componentId = event.dataTransfer?.getData("application/x-notation-component-id")
  if (componentId) {
    emit("createNodeFromComponent", componentId, x, y)
    return
  }

  const modelNodeId = event.dataTransfer?.getData("application/x-model-node-id")
  if (modelNodeId) {
    emit("addExistingNode", modelNodeId, x, y)
  }
}

const onDragComponentStart = (event: DragEvent, componentId: string) => {
  event.dataTransfer?.setData("application/x-notation-component-id", componentId)
  event.dataTransfer?.setData("text/plain", `component:${componentId}`)
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 10, 10)
}

// ── Palette ──
const paletteItems = computed(() => {
  const notationId = props.activeDiagram?.notationId
  if (!notationId) return []
  return props.components
    .filter((component) => component.notationId === notationId)
    .map((component) => {
      const parsedAttrs = parseEntityAttrs(component.attrs ?? null)
      const iconName = parsedAttrs.diagramStyle?.iconName?.trim()
      const fillColor = parsedAttrs.diagramStyle?.fillColor?.trim()
      return {
        ...component,
        paletteIconName: iconName && iconName.length > 0 ? iconName : "component",
        paletteFillColor: fillColor && fillColor.length > 0 ? fillColor : "var(--accent)"
      }
    })
    .sort((a, b) => {
      const colorDiff = a.paletteFillColor.localeCompare(b.paletteFillColor, "ru", {
        sensitivity: "base"
      })
      if (colorDiff !== 0) return colorDiff
      return a.name.localeCompare(b.name, "ru", { sensitivity: "base" })
    })
})

const paletteEntries = computed(() => {
  const entries: Array<
    | { kind: "divider"; colorKey: string }
    | { kind: "item"; component: (typeof paletteItems.value)[number] }
  > = []
  let previousColorKey: string | null = null

  for (const component of paletteItems.value) {
    const colorKey = component.paletteFillColor.trim().toLowerCase()
    if (previousColorKey !== null && colorKey !== previousColorKey) {
      entries.push({ kind: "divider", colorKey })
    }
    entries.push({ kind: "item", component })
    previousColorKey = colorKey
  }

  return entries
})

const buildIconUrl = (iconName: string): string => {
  const normalized = iconName.trim()
  if (!normalized) return "/icons/component.svg"
  if (normalized.startsWith("/")) return normalized
  if (normalized.toLowerCase().endsWith(".svg")) return `/icons/${normalized}`
  return `/icons/${normalized}.svg`
}

const handlePaletteIconError = (event: Event, iconName: string) => {
  const img = event.target as HTMLImageElement | null
  if (!img) return
  const triedAltPath = img.dataset.iconFallbackTried === "1"
  if (!triedAltPath) {
    img.dataset.iconFallbackTried = "1"
    const normalized = iconName.trim()
    img.src = normalized.toLowerCase().endsWith(".svg")
      ? `/icon/${normalized}`
      : `/icon/${normalized}.svg`
    return
  }
  img.src = "/icons/component.svg"
}

// ── Lifecycle ──
onMounted(() => {
  const mount = () => {
    if (!containerRef.value || !canvasRef.value) return
    if (containerRef.value.clientWidth === 0 || containerRef.value.clientHeight === 0) {
      requestAnimationFrame(mount)
      return
    }

    const width = containerRef.value.clientWidth
    const height = containerRef.value.clientHeight

    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--base-bg').trim() || "#f4f2ef"
    const r = new DiagramRenderer(canvasRef.value, {
      width,
      height,
      backgroundColor: bgColor,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      scrollbarOverlay: true
    })
    initRenderer(r)

    resizeObserver = new ResizeObserver(() => {
      if (!renderer || !containerRef.value) return
      renderer.resize(containerRef.value.clientWidth, containerRef.value.clientHeight)
    })
    resizeObserver.observe(containerRef.value)
  }
  mount()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  cleanupSelectionOverlay?.()
  cleanupSelectionOverlay = null
  renderer?.destroy()
  renderer = null
  interactionManager = null
  emit("canvasContextChange", { renderer: null, interactionManager: null })
  gridOverlay = null
  miniMap = null
  nodeIdToInstance.clear()
  edgeIdToInstance.clear()
})

// Watch for data changes
watch([instanceNodes, instanceEdges], () => syncDiagram(), { deep: true })
watch(() => props.nodes, () => syncDiagram(), { deep: true })

watch(
  () => [props.activeDiagram?.id, props.activeDiagram?.notationId],
  () => syncDiagram()
)

watch(
  () => props.activeDiagram?.id ?? null,
  (nextId, prevId) => {
    if (nextId !== prevId) resetHistory()
  }
)

watch(
  () => props.selectedModelNodeIds,
  () => {
    updateSelection()
    const orderedInstances = sortInstancesByZLayer(instanceNodes.value)
    reorderRendererNodesBySize(orderedInstances)
    renderer?.markDirty()
    persistNodeZOrder(orderedInstances)
  },
  { deep: true }
)

watch(
  () => props.selectedModelLinkId,
  () => updateSelection()
)

defineExpose({
  zoomIn,
  zoomOut,
  fitToView,
  zoomToSelection,
  autoLayoutNodes,
  resetView,
  toggleGrid,
  getGridVisible,
  toggleMiniMap,
  getMiniMapVisible,
  toggleSnap,
  getSnapEnabled,
  toggleLockAnchors,
  getLockAnchorsEnabled,
  undo,
  redo,
  getCanUndo,
  getCanRedo
})
</script>

<template>
  <div
    ref="containerRef"
    class="diagram-canvas"
    :class="{ 'diagram-canvas--disabled': !activeDiagram }"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <canvas
      ref="canvasRef"
      class="diagram-canvas__canvas"
      :class="{ 'diagram-canvas__canvas--hidden': !activeDiagram }"
    />

    <div v-if="!activeDiagram" class="diagram-canvas__placeholder">
      <span class="material-symbols-outlined diagram-canvas__placeholder-icon">draw</span>
      <span class="diagram-canvas__placeholder-text">Откройте или создайте диаграмму</span>
      <span class="diagram-canvas__placeholder-hint">Выберите диаграмму в дереве слева</span>
    </div>

    <template v-if="activeDiagram">
      <button
        v-if="!paletteVisible"
        type="button"
        class="canvas-palette-toggle"
        title="Показать палитру нотации"
        @click="paletteVisible = true"
      >
        <span class="material-symbols-outlined">palette</span>
      </button>

      <div v-if="paletteVisible" class="canvas-palette">
        <div class="canvas-palette__header">
          <span class="material-symbols-outlined">palette</span>
          <span>Палитра</span>
          <button
            type="button"
            class="canvas-palette__hide"
            title="Скрыть палитру"
            @click="paletteVisible = false"
          >
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
        <div v-if="paletteItems.length === 0" class="canvas-palette__empty">
          В нотации нет компонентов
        </div>
        <div v-else class="canvas-palette__list">
          <template v-for="(entry, index) in paletteEntries" :key="entry.kind === 'item' ? entry.component.id : `divider-${entry.colorKey}-${index}`">
            <div v-if="entry.kind === 'divider'" class="canvas-palette__divider" />
            <button
              v-else
              type="button"
              class="canvas-palette__item"
              :title="entry.component.name"
              :style="{ '--palette-item-fill': entry.component.paletteFillColor }"
              draggable="true"
              @dragstart="onDragComponentStart($event, entry.component.id)"
            >
              <img
                class="canvas-palette__icon"
                :src="buildIconUrl(entry.component.paletteIconName)"
                :alt="entry.component.name"
                draggable="false"
                @error="handlePaletteIconError($event, entry.component.paletteIconName)"
              >
            </button>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.diagram-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: var(--base-bg);
}

.diagram-canvas__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.diagram-canvas__canvas--hidden {
  display: none;
}

.diagram-canvas--disabled {
  background: var(--surface-muted);
}

.diagram-canvas__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  animation: fadeIn 0.4s ease;
}

.diagram-canvas__placeholder-icon {
  font-size: 48px;
  color: var(--border-strong);
  margin-bottom: 4px;
}

.diagram-canvas__placeholder-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-muted);
}

.diagram-canvas__placeholder-hint {
  font-size: 13px;
  color: var(--text-subtle);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.canvas-palette-toggle {
  position: absolute;
  right: 24px;
  top: 12px;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 6;
}

.canvas-palette-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.canvas-palette {
  position: absolute;
  right: 24px;
  top: 12px;
  bottom: 12px;
  width: 152px;
  padding: 8px 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 6;
}

.canvas-palette__header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
}

.canvas-palette__header .material-symbols-outlined {
  font-size: 14px;
}

.canvas-palette__hide {
  position: absolute;
  right: -1px;
  top: -1px;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border);
  border-radius: 0 10px 0 8px;
  background: var(--surface);
  color: var(--text-subtle);
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.canvas-palette__hide .material-symbols-outlined {
  font-size: 16px;
}

.canvas-palette__list {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  overflow: auto;
  align-content: start;
}

.canvas-palette__divider {
  grid-column: 1 / -1;
  height: 1px;
  background: var(--border);
  margin: 2px 0;
}

.canvas-palette__item {
  --palette-item-bg: color-mix(in srgb, var(--palette-item-fill) 18%, var(--surface));
  width: 100%;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--palette-item-bg);
  color: var(--base-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  transition: all 0.15s ease;
}

.canvas-palette__item:hover {
  border-color: var(--palette-item-fill, var(--accent));
  background: color-mix(in srgb, var(--palette-item-fill) 28%, var(--surface));
}

.canvas-palette__icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  pointer-events: none;
}

.canvas-palette__empty {
  font-size: 11px;
  color: var(--text-subtle);
  text-align: center;
  line-height: 1.3;
}
</style>
