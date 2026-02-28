<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DiagramRenderer,
  RectangleNode,
  CircleNode,
  DiamondNode,
  CustomShapeNode,
  Node as DiagramNode,
  Edge,
  GridOverlay,
  MiniMap,
  RulersOverlay,
  InteractionManager,
  TextLabel,
  type ContextMenuTarget,
  type ContextMenuItem,
  type ArrowMarkerConfig,
  type NodeImageOptions,
  type TextStyle,
  type TextLabelOptions,
  type LabelPlacement,
  type EdgePathType,
  type EdgeStyle,
} from '@ngroznykh/papirus'
import { diagramShapeFactories } from '@/utils/diagramShapes'
import {
  customOutlineToPath2D,
  customOutlineToSvgPath,
} from '@/utils/customOutlinePath'
import type { ComponentResponse, NodeTypeResponse, RelationResponse, RelationRuleResponse } from '../../../types/api'
import {
  parseEntityAttrs,
  type CustomProperty,
  type DiagramStyle,
} from '../../notations/notationAttrs'
import type { DiagramAttrs, DiagramNodeInstance, DiagramEdgeInstance } from '../modelAttrs'
import type { EditorDiagram, EditorLink, EditorNode } from '../types'

const props = withDefaults(
  defineProps<{
    activeDiagram: EditorDiagram | null
    nodes: EditorNode[]
    links: EditorLink[]
    relations: RelationResponse[]
    components: ComponentResponse[]
    nodeTypes: NodeTypeResponse[]
    relationRules?: RelationRuleResponse[]
    selectedModelNodeIds: string[]
    selectedModelLinkId: string | null
    selectedEdgeInstanceId?: string | null
    selectedInstanceIds?: string[]
    connectionValidator?: ((sourceModelNodeId: string, targetModelNodeId: string) => boolean) | null
    gridVisible?: boolean
    miniMapVisible?: boolean
    snapEnabled?: boolean
    alignEnabled?: boolean
    rulersEnabled?: boolean
    paletteVisible?: boolean
    lockAnchorsEnabled?: boolean
    attachToOutlineEnabled?: boolean
    autoLinkInGroups?: boolean
    readOnly?: boolean
  }>(),
  {
    connectionValidator: null,
    gridVisible: true,
    miniMapVisible: true,
    snapEnabled: false,
    alignEnabled: true,
    rulersEnabled: true,
    paletteVisible: true,
    lockAnchorsEnabled: true,
    attachToOutlineEnabled: true,
    relationRules: () => [],
    autoLinkInGroups: true,
    readOnly: false,
  }
)

const emit = defineEmits<{
  updateDiagram: [next: DiagramAttrs]
  selectNodes: [modelNodeIds: string[]]
  selectInstanceIds: [instanceIds: string[]]
  selectLink: [modelLinkId: string]
  selectEdgeInstanceId: [edgeInstanceId: string | null]
  selectCanvasElementId: [elementId: string | null]
  canvasContextChange: [
    ctx: { renderer: DiagramRenderer | null; interactionManager: InteractionManager | null },
  ]
  createNodeFromComponent: [componentId: string, x: number, y: number]
  createNote: [x: number, y: number]
  addExistingNode: [modelNodeId: string, x: number, y: number]
  connectNodes: [
    sourceModelNodeId: string,
    targetModelNodeId: string,
    sourceInstanceId: string,
    targetInstanceId: string,
    sourcePortId?: string,
    targetPortId?: string,
    sourceOutlineParam?: number,
    targetOutlineParam?: number,
  ]
  reconnectEdge: [
    edgeInstanceId: string,
    endpoint: 'start' | 'end',
    newInstanceId: string,
    portId?: string,
    outlineParam?: number,
  ]
  findInTree: [modelNodeId: string]
  nodeLabelChange: [modelNodeId: string, newLabel: string]
  requestDeleteNodeFromDiagram: [instanceId: string]
  requestEditNote: [instanceId: string]
  requestDeleteLink: [modelLinkId: string, edgeInstanceId?: string]
  paletteVisibleChange: [visible: boolean]
  requestAutoLink: [
    sourceModelNodeId: string,
    targetModelNodeId: string,
    sourceInstanceId: string,
    targetInstanceId: string,
    availableRelations: RelationResponse[],
    existingLinksNotOnDiagram: EditorLink[],
  ]
}>()
const { t } = useI18n()

// ── Refs ──
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const paletteVisible = ref(props.paletteVisible)
const gridVisible = ref(props.gridVisible)
const miniMapVisible = ref(props.miniMapVisible)
const snapEnabled = ref(props.snapEnabled)
const alignEnabled = ref(props.alignEnabled)
const rulersEnabled = ref(props.rulersEnabled)
const lockAnchorsEnabled = ref(props.lockAnchorsEnabled)
const attachToOutlineEnabled = ref(props.attachToOutlineEnabled)
const canUndo = ref(false)
const canRedo = ref(false)

const GRID_SIZE = 20
const MIN_ZOOM = 0.3
const MAX_ZOOM = 2.5
const DEFAULT_NODE_WIDTH = 160
const DEFAULT_NODE_HEIGHT = 56
const COMPONENT_RADIUS = 8
const EDGE_HIT_TOLERANCE_MIN = 8

let renderer: DiagramRenderer | null = null
let interactionManager: InteractionManager | null = null
let gridOverlay: GridOverlay | null = null
let miniMap: MiniMap | null = null
let rulersOverlay: RulersOverlay | null = null
let resizeObserver: ResizeObserver | null = null
let suppressSelectionEvent = false

// Maps: papirus element ID → model entity
const nodeIdToInstance = new Map<string, { modelNodeId: string; instanceId: string }>()
const edgeIdToInstance = new Map<string, { modelLinkId: string; edgeId: string }>()

// ── Computed ──
const nodeById = computed(() => new Map(props.nodes.map(node => [node.id, node])))
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

const getBoundRelation = (modelLinkId: string): RelationResponse | undefined => {
  const link = linkById.value.get(modelLinkId)
  const notationId = activeNotationId.value
  if (!link || !notationId) return undefined
  const relationId = link.parsedAttrs.notationRelations[notationId]?.relationId
  if (!relationId) return undefined
  return props.relations.find(r => r.id === relationId)
}

const hasGroupProperty = (relation: RelationResponse | undefined): boolean => {
  if (!relation) return false
  const parsed = parseEntityAttrs(relation.attrs ?? null)
  return parsed.customProperties.some(
    p => p.name === 'group' && p.type === 'boolean' && p.defaultValue === true
  )
}

const isTargetInsideSource = (
  sourceInstanceId: string,
  targetInstanceId: string
): boolean => {
  const sourceInst = instanceNodes.value.find(i => i.id === sourceInstanceId)
  const targetInst = instanceNodes.value.find(i => i.id === targetInstanceId)
  if (!sourceInst || !targetInst) return false

  const sourceDims = getInstanceDimensions(sourceInst)
  const targetDims = getInstanceDimensions(targetInst)

  const sourceLeft = sourceInst.x
  const sourceRight = sourceInst.x + sourceDims.width
  const sourceTop = sourceInst.y
  const sourceBottom = sourceInst.y + sourceDims.height

  const targetLeft = targetInst.x
  const targetRight = targetInst.x + targetDims.width
  const targetTop = targetInst.y
  const targetBottom = targetInst.y + targetDims.height

  // Check if target is fully inside source
  return (
    targetLeft >= sourceLeft &&
    targetRight <= sourceRight &&
    targetTop >= sourceTop &&
    targetBottom <= sourceBottom
  )
}

const shouldSkipEdgeRendering = (edge: DiagramEdgeInstance): boolean => {
  const relation = getBoundRelation(edge.modelLinkId)
  if (!hasGroupProperty(relation)) return false
  return isTargetInsideSource(edge.sourceInstanceId, edge.targetInstanceId)
}

// ── Group drag state ──
let groupDragData: {
  leaderPapNodeId: string
  followerIds: string[]
  startPositions: Map<string, { x: number; y: number }>
} | null = null

const isNodeGroupingEnabled = (papNodeId: string): boolean => {
  const entity = nodeIdToInstance.get(papNodeId)
  if (!entity) return false
  const notationId = activeNotationId.value
  if (!notationId) return false
  const node = nodeById.value.get(entity.modelNodeId)
  if (!node) return false
  const componentId = node.parsedAttrs.notationComponents[notationId]?.componentId
  if (!componentId) return false
  const component = props.components.find(c => c.id === componentId)
  if (!component) return false
  const parsed = parseEntityAttrs(component.attrs ?? null)
  return parsed.customProperties.some(
    p => p.name === 'group' && p.type === 'boolean' && p.defaultValue === true
  )
}

const getNodeBounds = (papNodeId: string): { x: number; y: number; width: number; height: number } | null => {
  if (!renderer) return null
  const papNode = renderer.getNode(papNodeId)
  if (!papNode) return null
  return {
    x: papNode.x,
    y: papNode.y,
    width: papNode.width,
    height: papNode.height
  }
}

const isNodeFullyInside = (
  innerPapNodeId: string,
  outerPapNodeId: string
): boolean => {
  const inner = getNodeBounds(innerPapNodeId)
  const outer = getNodeBounds(outerPapNodeId)
  if (!inner || !outer) return false

  return (
    inner.x >= outer.x &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y >= outer.y &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

const findContainedNodes = (containerPapNodeId: string): string[] => {
  if (!renderer) return []
  const contained: string[] = []
  for (const [papNodeId] of renderer.nodes) {
    if (papNodeId === containerPapNodeId) continue
    if (isNodeFullyInside(papNodeId, containerPapNodeId)) {
      contained.push(papNodeId)
    }
  }
  return contained
}

const startGroupDrag = (leaderPapNodeId: string) => {
  if (!isNodeGroupingEnabled(leaderPapNodeId)) {
    groupDragData = null
    return
  }
  const followers = findContainedNodes(leaderPapNodeId)
  if (followers.length === 0) {
    groupDragData = null
    return
  }
  const startPositions = new Map<string, { x: number; y: number }>()
  for (const id of [leaderPapNodeId, ...followers]) {
    const bounds = getNodeBounds(id)
    if (bounds) {
      startPositions.set(id, { x: bounds.x, y: bounds.y })
    }
  }
  groupDragData = {
    leaderPapNodeId,
    followerIds: followers,
    startPositions
  }
}

const applyGroupDragDelta = (deltaX: number, deltaY: number) => {
  if (!groupDragData || !renderer) return
  for (const followerId of groupDragData.followerIds) {
    const papNode = renderer.getNode(followerId)
    const startPos = groupDragData.startPositions.get(followerId)
    if (!papNode || !startPos) continue
    papNode.x = startPos.x + deltaX
    papNode.y = startPos.y + deltaY
  }
}

const endGroupDrag = (): string[] => {
  if (!groupDragData) return []
  const allIds = [groupDragData.leaderPapNodeId, ...groupDragData.followerIds]
  groupDragData = null
  return allIds
}

// ── Auto-link on drop inside container ──
const getNodeArea = (papNodeId: string): number => {
  const bounds = getNodeBounds(papNodeId)
  if (!bounds) return 0
  return bounds.width * bounds.height
}

const findDirectContainer = (innerPapNodeId: string): string | null => {
  if (!renderer) return null
  
  // Находим все контейнеры, внутри которых находится компонент
  const allContainers: string[] = []
  for (const [papNodeId] of renderer.nodes) {
    if (papNodeId === innerPapNodeId) continue
    if (isNodeFullyInside(innerPapNodeId, papNodeId)) {
      allContainers.push(papNodeId)
    }
  }
  
  if (allContainers.length === 0) return null
  
  // Выбираем самый маленький контейнер - это прямой родитель
  // (более маленький контейнер глубже в иерархии)
  return allContainers.reduce((smallest, current) => {
    return getNodeArea(current) < getNodeArea(smallest) ? current : smallest
  }, allContainers[0]!)
}

const getComponentIdByModelNodeId = (modelNodeId: string): string | undefined => {
  const notationId = activeNotationId.value
  if (!notationId) return undefined
  const node = nodeById.value.get(modelNodeId)
  if (!node) return undefined
  return node.parsedAttrs.notationComponents[notationId]?.componentId
}

const findGroupRelations = (
  sourceComponentId: string,
  targetComponentId: string
): RelationResponse[] => {
  const notationId = activeNotationId.value
  if (!notationId) return []

  // Find relation rules that allow connection between these components
  const matchingRules = props.relationRules?.filter(rule => 
    rule.fromComponentId === sourceComponentId && 
    rule.toComponentId === targetComponentId
  ) ?? []

  // Get allowed relation IDs from rules
  const allowedRelationIds = new Set(matchingRules.map(rule => rule.relationId))

  // Find all relations with group=true property among allowed
  const result: RelationResponse[] = []
  for (const rel of props.relations) {
    if (rel.notationId !== notationId) continue
    if (!allowedRelationIds.has(rel.id)) continue
    
    const parsed = parseEntityAttrs(rel.attrs ?? null)
    const hasGroup = parsed.customProperties.some(
      p => p.name === 'group' && p.type === 'boolean' && p.defaultValue === true
    )
    if (hasGroup) result.push(rel)
  }
  return result
}

const findExistingLinksForRelations = (
  sourceModelNodeId: string,
  targetModelNodeId: string,
  relations: RelationResponse[]
): EditorLink[] => {
  const notationId = activeNotationId.value
  if (!notationId) return []
  
  const relationIds = new Set(relations.map(r => r.id))
  return props.links.filter(link => {
    if (link._isDeleted) return false
    if (link.sourceId !== sourceModelNodeId || link.targetId !== targetModelNodeId) {
      return false
    }
    const linkRelationId = link.parsedAttrs.notationRelations[notationId]?.relationId
    return linkRelationId ? relationIds.has(linkRelationId) : false
  })
}

const isLinkOnDiagram = (modelLinkId: string): boolean => {
  return instanceEdges.value.some(edge => edge.modelLinkId === modelLinkId)
}

const tryCreateAutoLink = (draggedPapNodeId: string) => {
  // Проверяем настройку автолинков
  if (!props.autoLinkInGroups) return
  
  const notationId = activeNotationId.value
  if (!notationId || !renderer) return

  const entity = nodeIdToInstance.get(draggedPapNodeId)
  if (!entity) return

  // Находим только прямой контейнер (самый маленький, в который поместили компонент)
  const directContainerPapNodeId = findDirectContainer(draggedPapNodeId)
  if (!directContainerPapNodeId) return

  const targetModelNodeId = entity.modelNodeId
  const targetComponentId = getComponentIdByModelNodeId(targetModelNodeId)
  if (!targetComponentId) return

  const containerEntity = nodeIdToInstance.get(directContainerPapNodeId)
  if (!containerEntity) return

  const sourceModelNodeId = containerEntity.modelNodeId
  const sourceComponentId = getComponentIdByModelNodeId(sourceModelNodeId)
  if (!sourceComponentId) return

  // Find all relations with group=true between these component types
  const groupRelations = findGroupRelations(sourceComponentId, targetComponentId)
  if (groupRelations.length === 0) return

  // Find existing links for these relations
  const existingLinks = findExistingLinksForRelations(sourceModelNodeId, targetModelNodeId, groupRelations)

  // Разделяем связи: на диаграмме и не на диаграмме
  const existingLinksOnDiagram = existingLinks.filter(link => isLinkOnDiagram(link.id))
  const existingLinksNotOnDiagram = existingLinks.filter(link => !isLinkOnDiagram(link.id))

  // Если связь уже есть на диаграмме - ничего не делаем
  if (existingLinksOnDiagram.length > 0) {
    return
  }

  // Если связь существует но не на диаграмме - показываем диалог с использованием существующей
  if (existingLinksNotOnDiagram.length > 0) {
    emit('requestAutoLink', 
      sourceModelNodeId,
      targetModelNodeId,
      containerEntity.instanceId,
      entity.instanceId,
      [], // Не нужно выбирать relation
      existingLinksNotOnDiagram
    )
    return
  }

  // Связей нет - нужно создать новую
  emit('requestAutoLink', 
    sourceModelNodeId,
    targetModelNodeId,
    containerEntity.instanceId,
    entity.instanceId,
    groupRelations,
    [] // Нет существующих связей
  )
}

const getEffectiveEdgeStyle = (edgeInst: DiagramEdgeInstance): DiagramStyle | undefined => {
  if (edgeInst.attrs?.diagramStyle && typeof edgeInst.attrs.diagramStyle === 'object') {
    return edgeInst.attrs.diagramStyle as DiagramStyle
  }
  return getBoundRelationStyle(edgeInst.modelLinkId)
}

const getInstanceEdgeLabel = (edgeInst: DiagramEdgeInstance): string | undefined => {
  const raw = edgeInst.attrs?.label
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && typeof (raw as { text?: unknown }).text === 'string') {
    return (raw as { text: string }).text
  }
  return undefined
}

const getPapEdgeLabelText = (edge: Edge): string =>
  typeof edge.label === 'string'
    ? edge.label
    : (edge.label?.editableText ?? edge.label?.text ?? '')

type ControlPoint = { x: number; y: number }

const readControlPointsFromAttrs = (attrs: Record<string, unknown> | undefined): ControlPoint[] => {
  const raw = attrs?.controlPoints
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (point): point is { x: number; y: number } =>
        Boolean(point) &&
        typeof point === 'object' &&
        typeof (point as { x?: unknown }).x === 'number' &&
        typeof (point as { y?: unknown }).y === 'number'
    )
    .map(point => ({ x: point.x, y: point.y }))
}

const readControlPointsFromEdge = (edge: Edge): ControlPoint[] => {
  const raw = (edge as unknown as { controlPoints?: unknown }).controlPoints
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (point): point is { x: number; y: number } =>
        Boolean(point) &&
        typeof point === 'object' &&
        typeof (point as { x?: unknown }).x === 'number' &&
        typeof (point as { y?: unknown }).y === 'number'
    )
    .map(point => ({ x: point.x, y: point.y }))
}

const areControlPointsEqual = (a: ControlPoint[], b: ControlPoint[]): boolean =>
  a.length === b.length &&
  a.every((point, index) => point.x === b[index]?.x && point.y === b[index]?.y)

const buildEdgeLabel = (labelText: string | undefined): string | undefined => {
  const text = labelText?.trim()
  if (!text) return undefined
  return text
}

const buildEdgeLabelWithStyle = (
  labelText: string | undefined,
  ds?: DiagramStyle
): string | TextLabel | undefined => {
  const text = labelText?.trim()
  if (!text) return undefined
  if (
    !ds?.labelColor &&
    ds?.labelOpacity == null &&
    !ds?.labelFontSize &&
    ds?.labelPadding == null &&
    ds?.labelMargin == null
  ) {
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

const buildEdgeLabelBackground = (
  ds?: DiagramStyle
): { color?: string; opacity?: number; padding?: number; borderRadius?: number } | undefined => {
  if (!ds) return undefined

  const background: Record<string, unknown> = {}
  if (ds.labelBgColor) background.color = ds.labelBgColor
  if (ds.labelBgOpacity != null) background.opacity = ds.labelBgOpacity
  if (ds.labelBgPadding != null) background.padding = ds.labelBgPadding
  if (ds.labelBgBorderRadius != null) background.borderRadius = ds.labelBgBorderRadius

  return Object.keys(background).length > 0 ? background : undefined
}

const resolveEdgeOptions = (
  ds?: DiagramStyle
): Partial<{
  type: EdgePathType
  style: EdgeStyle
  startMarker: ArrowMarkerConfig
  endMarker: ArrowMarkerConfig
  labelOffset: number
}> => {
  if (!ds) return {}
  const opts: Partial<{
    type: EdgePathType
    style: EdgeStyle
    startMarker: ArrowMarkerConfig
    endMarker: ArrowMarkerConfig
    labelOffset: number
  }> = {}
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
      type: ds.startMarkerType as ArrowMarkerConfig['type'],
      ...(ds.startMarkerSize != null && { size: ds.startMarkerSize }),
      ...(ds.startMarkerFillColor && { fillColor: ds.startMarkerFillColor }),
      ...(ds.startMarkerFillOpacity != null && { fillOpacity: ds.startMarkerFillOpacity }),
    }
  }
  if (ds.endMarkerType) {
    opts.endMarker = {
      type: ds.endMarkerType as ArrowMarkerConfig['type'],
      ...(ds.endMarkerSize != null && { size: ds.endMarkerSize }),
      ...(ds.endMarkerFillColor && { fillColor: ds.endMarkerFillColor }),
      ...(ds.endMarkerFillOpacity != null && { fillOpacity: ds.endMarkerFillOpacity }),
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
  if (instance.attrs?.diagramStyle && typeof instance.attrs.diagramStyle === 'object') {
    return instance.attrs.diagramStyle as DiagramStyle
  }
  return getBoundComponentStyle(instance.modelNodeId)
}

const isNoteInstance = (instance: DiagramNodeInstance): boolean => instance.attrs?.isNote === true

const getNoteText = (instance: DiagramNodeInstance): string => {
  const value = instance.attrs?.noteText
  return typeof value === 'string' && value.trim().length > 0 ? value : t('diagram.newNote')
}

const getInstanceDimensions = (instance: {
  modelNodeId: string
  width?: number
  height?: number
  attrs?: Record<string, unknown>
}) => {
  const ds = (instance as DiagramNodeInstance).attrs?.diagramStyle
    ? getEffectiveStyle(instance as DiagramNodeInstance)
    : getBoundComponentStyle(instance.modelNodeId)
  return {
    width: instance.width ?? (typeof ds?.width === 'number' ? ds.width : DEFAULT_NODE_WIDTH),
    height: instance.height ?? (typeof ds?.height === 'number' ? ds.height : DEFAULT_NODE_HEIGHT),
  }
}

const getComponentMinDimensions = (modelNodeId: string) => {
  const ds = getBoundComponentStyle(modelNodeId)
  return {
    width: typeof ds?.width === 'number' ? ds.width : DEFAULT_NODE_WIDTH,
    height: typeof ds?.height === 'number' ? ds.height : DEFAULT_NODE_HEIGHT,
  }
}

function applyMinSizeConstraint(node: DiagramNode, modelNodeId: string) {
  const original = node.getContentMinSize.bind(node)
  node.getContentMinSize = (ctx: CanvasRenderingContext2D) => {
    const contentMin = original(ctx)
    const compMin = getComponentMinDimensions(modelNodeId)
    return {
      width: Math.max(contentMin.width, compMin.width),
      height: Math.max(contentMin.height, compMin.height),
    }
  }
}

type ComponentShape =
  | 'rectangle'
  | 'beveled-rectangle'
  | 'diamond'
  | 'circle'
  | 'trapezoid'
  | 'slanted-rectangle'
  | 'custom'

const getInstanceArea = (instance: DiagramNodeInstance): number => {
  const { width, height } = getInstanceDimensions(instance)
  return width * height
}

const getInstanceZIndex = (instance: DiagramNodeInstance): number | null => {
  const raw = instance.attrs?.zIndex
  if (typeof raw === 'number' && Number.isFinite(raw)) {
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
  const orderedNodeIds = orderedInstances.map(instance => `instance-${instance.id}`)
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
  const nextOrder = orderedNodes.map(node => node.id)
  const sameOrder =
    currentOrder.length === nextOrder.length &&
    currentOrder.every((id, index) => id === nextOrder[index])

  if (sameOrder) return

  nodesMap.clear()
  for (const node of orderedNodes) {
    nodesMap.set(node.id, node)
  }
}

function getComponentShape(ds?: DiagramStyle): ComponentShape {
  const shape = ds?.nodeShape as ComponentShape | undefined
  switch (shape) {
    case 'beveled-rectangle':
    case 'diamond':
    case 'circle':
    case 'trapezoid':
    case 'slanted-rectangle':
    case 'custom':
      return shape
    default:
      return 'rectangle'
  }
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
  const component = props.components.find(c => c.id === componentId)
  if (!component) return []
  return parseEntityAttrs(component.attrs ?? null).customProperties
}

function resolveLabelTemplate(
  template: string,
  name: string,
  customProperties: CustomProperty[],
  scopedValues: Record<string, unknown>
): string {
  return template
    .replace(/\$\{(\w+)\}/g, (_match, key: string) => {
      if (key === 'name') return name
      const prop = customProperties.find(p => p.name === key)
      if (prop) {
        const val = scopedValues[key] ?? prop.defaultValue
        return val != null ? String(val) : ''
      }
      return ''
    })
    .replace(/\\n/g, '\n')
}

function buildNodeLabel(
  name: string,
  ds?: DiagramStyle,
  modelNodeId?: string
): string | TextLabelOptions {
  const hasTemplate = !!ds?.labelTemplate
  let displayText = name
  if (hasTemplate && modelNodeId) {
    const customProps = getNodeComponentCustomProperties(modelNodeId)
    const scopedValues = getNodeScopedPropertyValues(modelNodeId)
    displayText = resolveLabelTemplate(ds!.labelTemplate!, name, customProps, scopedValues)
  }

  const hasStyle = !!(
    ds?.labelColor ||
    ds?.labelOpacity != null ||
    ds?.labelFontSize ||
    ds?.labelPadding != null ||
    ds?.labelMargin != null ||
    ds?.labelAlign
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
  if (Object.keys(style).length) opts.style = style
  if (ds?.labelPadding != null) opts.padding = ds.labelPadding
  if (ds?.labelMargin != null) opts.margin = ds.labelMargin
  return opts
}

function buildNodeIcon(ds?: DiagramStyle) {
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
      : 'left'
  return {
    source: `/icons/${ds.iconName}.svg`,
    placement: resolvedPlacement,
    width: ds.iconWidth ?? 20,
    height: ds.iconHeight ?? 20,
    fit: 'contain' as const,
    ...(ds.iconPadding != null ? { padding: ds.iconPadding } : {}),
    ...(ds.iconMargin != null ? { margin: ds.iconMargin } : {}),
    ...(ds.iconGap != null ? { gap: ds.iconGap } : {}),
    ...(ds.iconStrokeColor ? { strokeColor: ds.iconStrokeColor } : {}),
    ...(ds.iconFillColor ? { fillColor: ds.iconFillColor } : {}),
  }
}

function resolveInstanceStyle(instance: DiagramNodeInstance, ds?: DiagramStyle) {
  const dims = getInstanceDimensions(instance)
  const style: Record<string, unknown> = {
    fillColor: ds?.fillColor ?? '#ffffff',
    strokeColor: ds?.strokeColor ?? '#d1d5db',
    strokeWidth: ds?.strokeWidth ?? 1,
  }
  if (ds?.fillOpacity != null) style.fillOpacity = ds.fillOpacity
  if (ds?.strokeOpacity != null) style.strokeOpacity = ds.strokeOpacity
  if (ds?.opacity != null) style.opacity = ds.opacity
  if (ds?.lineDash) style.lineDash = ds.lineDash
  return {
    width: dims.width,
    height: dims.height,
    style,
    cornerRadius: ds?.cornerRadius ?? COMPONENT_RADIUS,
  }
}

function resolveAnchorPoints(ds?: DiagramStyle): {
  top: number
  bottom: number
  left: number
  right: number
} {
  const normalize = (value: unknown, fallback: number): number => {
    const parsed = Math.round(Number(value))
    if (!Number.isFinite(parsed) || parsed < 0) return fallback
    return parsed
  }
  return {
    top: normalize(ds?.portsTop, 3),
    bottom: normalize(ds?.portsBottom, 3),
    left: normalize(ds?.portsLeft, 1),
    right: normalize(ds?.portsRight, 1),
  }
}

function isCustomShapeNode(node: DiagramNode): node is CustomShapeNode {
  return node instanceof CustomShapeNode
}

function isStickyNoteNode(node: DiagramNode): boolean {
  return isCustomShapeNode(node) && (node as unknown as { noteShape?: boolean }).noteShape === true
}

function getNodeShapeFromNode(node: DiagramNode): ComponentShape {
  if (node instanceof DiamondNode) return 'diamond'
  if (node instanceof CircleNode) return 'circle'
  if (isCustomShapeNode(node)) return (node.shapeType as ComponentShape) ?? 'rectangle'
  return 'rectangle'
}

// ── Node creation ──
function createInstanceNode(instance: DiagramNodeInstance): DiagramNode {
  const ds = getEffectiveStyle(instance)
  const visual = resolveInstanceStyle(instance, ds)
  const shape = getComponentShape(ds)
  const nodeName = isNoteInstance(instance)
    ? getNoteText(instance)
    : (nodeById.value.get(instance.modelNodeId)?.name ?? 'Node')

  const commonOptions = {
    id: `instance-${instance.id}`,
    x: instance.x,
    y: instance.y,
    width: visual.width,
    height: visual.height,
    label: buildNodeLabel(nodeName, ds, instance.modelNodeId),
    style: visual.style,
    anchorPoints: resolveAnchorPoints(ds),
    ...(buildNodeIcon(ds) ? { icon: buildNodeIcon(ds) } : {}),
  }

  const stickyNoteFactory = diagramShapeFactories['sticky-note']
  const beveledFactory = diagramShapeFactories['beveled-rectangle']
  const trapezoidFactory = diagramShapeFactories['trapezoid']
  const slantedFactory = diagramShapeFactories['slanted-rectangle']

  let node: DiagramNode
  if (isNoteInstance(instance) && shape === 'rectangle') {
    const noteNode = new CustomShapeNode({
      ...commonOptions,
      path: stickyNoteFactory.path,
      svgPath: stickyNoteFactory.svgPath,
    })
    noteNode.shapeType = 'rectangle'
    ;(noteNode as unknown as { noteShape?: boolean }).noteShape = true
    node = noteNode
  } else if (shape === 'diamond') {
    node = new DiamondNode(commonOptions)
  } else if (shape === 'circle') {
    node = new CircleNode(commonOptions)
  } else if (shape === 'beveled-rectangle') {
    node = new CustomShapeNode({
      ...commonOptions,
      path: beveledFactory.path,
      svgPath: beveledFactory.svgPath,
    })
  } else if (shape === 'trapezoid') {
    node = new CustomShapeNode({
      ...commonOptions,
      path: trapezoidFactory.path,
      svgPath: trapezoidFactory.svgPath,
    })
  } else if (shape === 'slanted-rectangle') {
    node = new CustomShapeNode({
      ...commonOptions,
      path: slantedFactory.path,
      svgPath: slantedFactory.svgPath,
    })
  } else if (shape === 'custom' && ds?.customOutline?.length) {
    const segments = ds.customOutline
    node = new CustomShapeNode({
      ...commonOptions,
      path: (w, h) => customOutlineToPath2D(segments, w, h),
      svgPath: (w, h) => customOutlineToSvgPath(segments, w, h),
    })
  } else {
    node = new RectangleNode({
      ...commonOptions,
      cornerRadius: visual.cornerRadius,
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
    const modelNode = nodeById.value.get(instance.modelNodeId)
    if (!isNoteInstance(instance) && (!modelNode || modelNode._isDeleted)) continue

    const papNodeId = `instance-${instance.id}`
    currentNodeIds.add(papNodeId)
    nodeIdToInstance.set(papNodeId, {
      modelNodeId: instance.modelNodeId,
      instanceId: instance.id,
    })

    const existing = renderer.getNode(papNodeId)
    if (existing) {
      const ds = getEffectiveStyle(instance)
      const expectedShape = getComponentShape(ds)
      const existingShape = getNodeShapeFromNode(existing)
      const shouldUseStickyNote = isNoteInstance(instance) && expectedShape === 'rectangle'
      const needsStickyNoteRebuild = shouldUseStickyNote && !isStickyNoteNode(existing)

      if (expectedShape !== existingShape || needsStickyNoteRebuild) {
        renderer.removeNode(papNodeId)
        renderer.addNode(createInstanceNode(instance))
        continue
      }

      // Update in-place
      const visual = resolveInstanceStyle(instance, ds)
      const nodeName = isNoteInstance(instance)
        ? getNoteText(instance)
        : (nodeById.value.get(instance.modelNodeId)?.name ?? 'Node')

      existing.x = instance.x
      existing.y = instance.y
      existing.width = visual.width
      existing.height = visual.height
      existing.style = visual.style
      existing.anchorPoints = resolveAnchorPoints(ds)
      const newLabel = buildNodeLabel(nodeName, ds, instance.modelNodeId)
      if (typeof newLabel === 'string') {
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
    const modelLink = linkById.value.get(edge.modelLinkId)
    const isDiagramOnlyEdge = edge.attrs?.isDiagramOnly === true
    if (!isDiagramOnlyEdge && (!modelLink || modelLink._isDeleted)) continue

    // Skip rendering if relation has group=true and target is inside source
    if (shouldSkipEdgeRendering(edge)) continue

    const papEdgeId = `edge-${edge.id}`
    currentEdgeIds.add(papEdgeId)
    edgeIdToInstance.set(papEdgeId, { modelLinkId: edge.modelLinkId, edgeId: edge.id })

    const sourcePapId = `instance-${edge.sourceInstanceId}`
    const targetPapId = `instance-${edge.targetInstanceId}`

    if (!currentNodeIds.has(sourcePapId) || !currentNodeIds.has(targetPapId)) continue

    const ds = getEffectiveEdgeStyle(edge)
    const edgeOpts = resolveEdgeOptions(ds)
    const edgeLabel =
      getInstanceEdgeLabel(edge) ?? getBoundRelation(edge.modelLinkId)?.name ?? undefined
    const edgeLabelText = buildEdgeLabel(edgeLabel)
    const edgeLabelConfig = buildEdgeLabelWithStyle(edgeLabel, ds) ?? buildEdgeLabel(edgeLabel)
    const edgeLabelBackground = buildEdgeLabelBackground(ds)
    const controlPoints = readControlPointsFromAttrs(edge.attrs)

    const existing = renderer.getEdge(papEdgeId)
    if (existing) {
      const fromOutline = edge.attrs?.fromOutlineParam as number | undefined
      const toOutline = edge.attrs?.toOutlineParam as number | undefined
      existing.from =
        fromOutline !== undefined
          ? { nodeId: sourcePapId, outlineParam: fromOutline }
          : {
              nodeId: sourcePapId,
              portId: (edge.attrs?.fromPortId as string | undefined) ?? existing.from.portId,
            }
      existing.to =
        toOutline !== undefined
          ? { nodeId: targetPapId, outlineParam: toOutline }
          : {
              nodeId: targetPapId,
              portId: (edge.attrs?.toPortId as string | undefined) ?? existing.to.portId,
            }
      if (edgeOpts.style) existing.style = { ...existing.style, ...edgeOpts.style }
      if (edgeOpts.type) existing.type = edgeOpts.type
      if (edgeOpts.startMarker !== undefined) existing.startMarker = edgeOpts.startMarker
      if (edgeOpts.endMarker !== undefined) existing.endMarker = edgeOpts.endMarker
      if (!areControlPointsEqual(readControlPointsFromEdge(existing), controlPoints)) {
        ;(existing as unknown as { controlPoints?: ControlPoint[] }).controlPoints = controlPoints
      }
      existing.labelOffset = edgeOpts.labelOffset ?? existing.labelOffset
      existing.label = edgeLabelConfig
      if (existing.label) {
        existing.label.style = {
          ...(existing.label.style || {}),
          ...(ds?.labelColor ? { color: ds.labelColor } : {}),
          ...(ds?.labelOpacity != null ? { opacity: ds.labelOpacity } : {}),
          ...(ds?.labelFontSize ? { fontSize: ds.labelFontSize } : {}),
        }
      }
      if (existing.label && ds?.labelPadding != null) {
        existing.label.padding = ds.labelPadding
      }
      if (existing.label && ds?.labelMargin != null) {
        existing.label.margin = ds.labelMargin
      }
      existing.lockAnchors = lockAnchorsEnabled.value
      ;(existing as unknown as { labelBackground?: Record<string, unknown> }).labelBackground =
        edgeLabelBackground
    } else {
      const fromOutline = edge.attrs?.fromOutlineParam as number | undefined
      const toOutline = edge.attrs?.toOutlineParam as number | undefined
      const newEdge = new Edge({
        id: papEdgeId,
        from:
          fromOutline !== undefined
            ? { nodeId: sourcePapId, outlineParam: fromOutline }
            : { nodeId: sourcePapId, portId: edge.attrs?.fromPortId as string | undefined },
        to:
          toOutline !== undefined
            ? { nodeId: targetPapId, outlineParam: toOutline }
            : { nodeId: targetPapId, portId: edge.attrs?.toPortId as string | undefined },
        type: edgeOpts.type ?? 'bezier',
        arrowType: ds?.endMarkerType ? undefined : 'single',
        style: edgeOpts.style,
        startMarker: edgeOpts.startMarker,
        endMarker: edgeOpts.endMarker,
        ...(edgeLabelText !== undefined ? { label: edgeLabelText } : {}),
        ...(edgeOpts.labelOffset != null ? { labelOffset: edgeOpts.labelOffset } : {}),
        ...(edgeLabelBackground ? { labelBackground: edgeLabelBackground } : {}),
        ...(controlPoints.length > 0 ? { controlPoints } : {}),
        lockAnchors: lockAnchorsEnabled.value,
      })
      if (newEdge.label) {
        newEdge.label.style = {
          ...(newEdge.label.style || {}),
          ...(ds?.labelColor ? { color: ds.labelColor } : {}),
          ...(ds?.labelOpacity != null ? { opacity: ds.labelOpacity } : {}),
          ...(ds?.labelFontSize ? { fontSize: ds.labelFontSize } : {}),
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
  const selectedInstanceIds = props.selectedInstanceIds ?? []
  const selectedLinkId = props.selectedModelLinkId
  const selectedEdgeInstanceId = props.selectedEdgeInstanceId ?? null

  const targetPapIds: string[] = []

  if (selectedInstanceIds.length > 0) {
    const instanceSet = new Set(selectedInstanceIds)
    for (const [papId, entity] of nodeIdToInstance) {
      if (instanceSet.has(entity.instanceId)) {
        targetPapIds.push(papId)
      }
    }
  } else if (selectedNodeIds.length > 0) {
    const selectedSet = new Set(selectedNodeIds)
    for (const [papId, entity] of nodeIdToInstance) {
      if (selectedSet.has(entity.modelNodeId)) {
        targetPapIds.push(papId)
      }
    }
  } else if (selectedEdgeInstanceId) {
    const papId = `edge-${selectedEdgeInstanceId}`
    if (edgeIdToInstance.has(papId)) {
      targetPapIds.push(papId)
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
    const needsSync =
      targetPapIds.length !== currentIds.size || targetPapIds.some(id => !currentIds.has(id))
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

function findTopEdgeAtPoint(worldPoint: { x: number; y: number }): Edge | null {
  if (!renderer) return null
  const edges = Array.from(renderer.edges.values())
  for (let i = edges.length - 1; i >= 0; i--) {
    const edge = edges[i]
    if (!edge || !edge.visible) continue
    const baseTolerance = Math.max((edge.style.strokeWidth ?? 2) * 2, EDGE_HIT_TOLERANCE_MIN)
    const tolerance = baseTolerance / Math.max(renderer.zoom, 0.0001)
    if (edge.hitTestWithTolerance(worldPoint, tolerance)) {
      return edge
    }
  }
  return null
}

function handleCanvasClickPrioritizeEdge(event: MouseEvent) {
  if (!renderer || !interactionManager || !props.activeDiagram) return
  if (event.ctrlKey || event.metaKey || event.shiftKey) return

  const worldPoint = renderer.screenToWorld(event.clientX, event.clientY)
  const hitEdge = findTopEdgeAtPoint(worldPoint)
  if (!hitEdge) return

  // Prevent InteractionManager click handler from re-selecting underlying node.
  event.preventDefault()
  event.stopImmediatePropagation()

  const selection = interactionManager.selection
  if (selection.selectedIds.size === 1 && selection.selectedIds.has(hitEdge.id)) return

  suppressSelectionEvent = true
  try {
    selection.select(hitEdge.id)
  } finally {
    suppressSelectionEvent = false
  }

  emit('selectCanvasElementId', hitEdge.id)
  const edgeEntity = edgeIdToInstance.get(hitEdge.id)
  if (edgeEntity) {
    emit('selectLink', edgeEntity.modelLinkId)
    emit('selectEdgeInstanceId', edgeEntity.edgeId)
  }
}

function handleCanvasMouseUpSyncEditablePolyline() {
  detectEditablePolylineControlPointChanges()
}

// ── Detect label changes from inline editing ──
function detectLabelChanges() {
  if (!renderer) return
  const next = cloneDiagramAttrs()
  let notesChanged = false
  for (const [papNodeId, entity] of nodeIdToInstance) {
    const papNode = renderer.getNode(papNodeId)
    if (!papNode) continue
    const labelText =
      typeof papNode.label === 'string'
        ? papNode.label
        : (papNode.label?.editableText ?? papNode.label?.text ?? '')
    const instance = next.instances.nodes.find(item => item.id === entity.instanceId)
    if (instance && isNoteInstance(instance)) {
      if (labelText !== getNoteText(instance)) {
        if (!instance.attrs) instance.attrs = {}
        instance.attrs.noteText = labelText
        notesChanged = true
      }
      continue
    }

    const modelNode = nodeById.value.get(entity.modelNodeId)
    if (modelNode && labelText !== modelNode.name) {
      emit('nodeLabelChange', entity.modelNodeId, labelText)
    }
  }
  if (notesChanged) {
    emit('updateDiagram', next)
  }
}

function detectEdgeLabelChanges() {
  if (!renderer) return

  const next = cloneDiagramAttrs()
  let changed = false

  for (const [papEdgeId, entity] of edgeIdToInstance) {
    const papEdge = renderer.getEdge(papEdgeId)
    if (!papEdge) continue

    const edgeInst = next.instances.edges.find(edge => edge.id === entity.edgeId)
    if (!edgeInst) continue

    const nextLabel = getPapEdgeLabelText(papEdge)
    const currentLabel = getInstanceEdgeLabel(edgeInst) ?? ''
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
    emit('updateDiagram', next)
  }
}

function detectEdgePortChanges() {
  if (!renderer) return

  const next = cloneDiagramAttrs()
  let changed = false

  for (const [papEdgeId, entity] of edgeIdToInstance) {
    const papEdge = renderer.getEdge(papEdgeId)
    if (!papEdge) continue

    const edgeInst = next.instances.edges.find(edge => edge.id === entity.edgeId)
    if (!edgeInst) continue

    const nextFromPortId = papEdge.from.portId ?? undefined
    const nextToPortId = papEdge.to.portId ?? undefined
    const nextFromOutline = papEdge.from.outlineParam
    const nextToOutline = papEdge.to.outlineParam
    const currentFromPortId = edgeInst.attrs?.fromPortId as string | undefined
    const currentToPortId = edgeInst.attrs?.toPortId as string | undefined
    const currentFromOutline = edgeInst.attrs?.fromOutlineParam as number | undefined
    const currentToOutline = edgeInst.attrs?.toOutlineParam as number | undefined

    const portMatch = nextFromPortId === currentFromPortId && nextToPortId === currentToPortId
    const outlineMatch =
      nextFromOutline === currentFromOutline && nextToOutline === currentToOutline
    if (portMatch && outlineMatch) continue

    if (!edgeInst.attrs) edgeInst.attrs = {}
    if (lockAnchorsEnabled.value) {
      if (nextFromPortId) edgeInst.attrs.fromPortId = nextFromPortId
      else delete edgeInst.attrs.fromPortId
      if (nextToPortId) edgeInst.attrs.toPortId = nextToPortId
      else delete edgeInst.attrs.toPortId
    }
    if (attachToOutlineEnabled.value) {
      if (nextFromOutline !== undefined) edgeInst.attrs.fromOutlineParam = nextFromOutline
      else delete edgeInst.attrs.fromOutlineParam
      if (nextToOutline !== undefined) edgeInst.attrs.toOutlineParam = nextToOutline
      else delete edgeInst.attrs.toOutlineParam
    }

    if (Object.keys(edgeInst.attrs).length === 0) {
      delete edgeInst.attrs
    }
    changed = true
  }

  if (changed) {
    emit('updateDiagram', next)
  }
}

function detectEditablePolylineControlPointChanges() {
  if (!renderer) return

  const next = cloneDiagramAttrs()
  let changed = false

  for (const [papEdgeId, entity] of edgeIdToInstance) {
    const papEdge = renderer.getEdge(papEdgeId)
    if (!papEdge || papEdge.type !== 'editable-polyline') continue

    const edgeInst = next.instances.edges.find(edge => edge.id === entity.edgeId)
    if (!edgeInst) continue

    const nextControlPoints = readControlPointsFromEdge(papEdge)
    const currentControlPoints = readControlPointsFromAttrs(edgeInst.attrs)
    if (areControlPointsEqual(nextControlPoints, currentControlPoints)) continue

    if (!edgeInst.attrs) edgeInst.attrs = {}
    if (nextControlPoints.length > 0) edgeInst.attrs.controlPoints = nextControlPoints
    else delete edgeInst.attrs.controlPoints

    if (Object.keys(edgeInst.attrs).length === 0) {
      delete edgeInst.attrs
    }
    changed = true
  }

  if (changed) {
    emit('updateDiagram', next)
  }
}

function setEdgeTypeFromContext(edgeInstanceId: string, edgeType: EdgePathType) {
  const next = cloneDiagramAttrs()
  const edgeInst = next.instances.edges.find(edge => edge.id === edgeInstanceId)
  if (!edgeInst) return

  const baseStyle =
    edgeInst.attrs?.diagramStyle && typeof edgeInst.attrs.diagramStyle === 'object'
      ? (edgeInst.attrs.diagramStyle as Record<string, unknown>)
      : {}

  const currentType = (baseStyle.edgeType as EdgePathType | undefined) ?? 'bezier'
  if (currentType === edgeType) return

  if (!edgeInst.attrs) edgeInst.attrs = {}
  edgeInst.attrs.diagramStyle = {
    ...baseStyle,
    edgeType,
  }
  // При смене с polyline/editable-polyline на bezier или straight удаляем промежуточные точки:
  // они имеют другой формат/семантику и искажают отрисовку стрелки
  const fromPolyline = currentType === 'polyline' || currentType === 'editable-polyline'
  const toNonPolyline = edgeType === 'bezier' || edgeType === 'straight'
  if (fromPolyline && toNonPolyline && edgeInst.attrs.controlPoints) {
    delete edgeInst.attrs.controlPoints
  }
  emit('updateDiagram', next)
}

// ── Persist positions from papirus back to model ──
function persistNodePositions(papNodeIds: string[]) {
  if (props.readOnly || !renderer) return
  const next = cloneDiagramAttrs()
  let changed = false
  for (const papNodeId of papNodeIds) {
    const entity = nodeIdToInstance.get(papNodeId)
    if (!entity) continue
    const papNode = renderer.getNode(papNodeId)
    if (!papNode) continue
    const instance = next.instances.nodes.find(n => n.id === entity.instanceId)
    if (!instance) continue
    if (
      instance.x !== papNode.x ||
      instance.y !== papNode.y ||
      instance.width !== papNode.width ||
      instance.height !== papNode.height
    ) {
      instance.x = papNode.x
      instance.y = papNode.y
      instance.width = papNode.width
      instance.height = papNode.height
      changed = true
    }
  }
  if (changed) {
    syncEdgePortIds(next)
    emit('updateDiagram', next)
  }
}

/**
 * Syncs all in-renderer state (positions, edge labels, ports, control points) into diagram attrs
 * and emits updateDiagram. Call before save so that recent edits are persisted.
 */
function flushCanvasState() {
  if (props.readOnly || !renderer) return
  persistNodePositions(Array.from(nodeIdToInstance.keys()))
  detectEdgeLabelChanges()
  detectEdgePortChanges()
  detectEditablePolylineControlPointChanges()
}

function syncEdgePortIds(diagramAttrs: DiagramAttrs) {
  if (!renderer) return
  for (const edgeInst of diagramAttrs.instances.edges) {
    const papEdge = renderer.getEdge(`edge-${edgeInst.id}`)
    if (!papEdge) continue
    if (!edgeInst.attrs) edgeInst.attrs = {}
    if (papEdge.from.portId) edgeInst.attrs.fromPortId = papEdge.from.portId
    else delete edgeInst.attrs.fromPortId
    if (papEdge.to.portId) edgeInst.attrs.toPortId = papEdge.to.portId
    else delete edgeInst.attrs.toPortId
    if (papEdge.from.outlineParam !== undefined)
      edgeInst.attrs.fromOutlineParam = papEdge.from.outlineParam
    else delete edgeInst.attrs.fromOutlineParam
    if (papEdge.to.outlineParam !== undefined)
      edgeInst.attrs.toOutlineParam = papEdge.to.outlineParam
    else delete edgeInst.attrs.toOutlineParam
  }
}

// ── Renderer init ──
function initRenderer(r: DiagramRenderer) {
  renderer = r
  r.getCanvas().addEventListener('click', handleCanvasClickPrioritizeEdge)
  window.addEventListener('mouseup', handleCanvasMouseUpSyncEditablePolyline)

  // Grid overlay
  gridOverlay = new GridOverlay({ gridSize: 24, color: '#e2e8f0' })
  r.use(gridOverlay)
  gridOverlay.setEnabled(gridVisible.value)

  // Rulers
  rulersOverlay = new RulersOverlay({
    enabled: rulersEnabled.value,
  })
  r.use(rulersOverlay)

  // MiniMap
  miniMap = new MiniMap({
    enabled: miniMapVisible.value,
    width: 120,
    height: 60,
    padding: 20,
    contentMargin: 200,
    anchor: 'bottom-left',
  })
  r.use(miniMap)

  // Always enable interactions: when readOnly use navigationOnly (zoom/pan only, no edit)
  interactionManager = r.enableInteractions({
    snapToGrid: snapEnabled.value,
    gridSize: GRID_SIZE,
    alignToNodes: alignEnabled.value,
    attachToOutline: attachToOutlineEnabled.value,
    keymap: { deleteKeys: [] },
    navigationOnly: props.readOnly,
  } as Parameters<DiagramRenderer['enableInteractions']>[0])
  if (!props.readOnly) {
    interactionManager.connection.setSnapToGrid(snapEnabled.value)
    interactionManager.connection.setAttachToOutline(attachToOutlineEnabled.value)
    // Warchi persists connections via model state/events.
    // Disable papirus temporary connect history entries to avoid redo ghost edge replay.
    ;(interactionManager.connection as unknown as { addEdge?: (edge: Edge) => void }).addEdge = (
      edge: Edge
    ) => {
      r.addEdge(edge)
    }
  }

  // Permanently patch getElementAtPoint to check edges before nodes.
  // This fixes the issue where double-clicking on an edge that passes over a node
  // would select the node instead of editing the edge label.
  r.getElementAtPoint = (point: { x: number; y: number }) => {
    // Check edges first (in reverse order for top-to-bottom)
    const edges = Array.from(r.edges.values())
    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i]
      if (!edge || !edge.visible) continue
      const baseTolerance = Math.max((edge.style.strokeWidth ?? 2) * 2, EDGE_HIT_TOLERANCE_MIN)
      const tolerance = baseTolerance / Math.max(r.zoom, 0.0001)
      if (edge.hitTestWithTolerance(point, tolerance)) {
        return edge
      }
    }
    // Then nodes
    const nodes = Array.from(r.nodes.values())
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      if (node?.visible && node.hitTest(point)) {
        return node
      }
    }
    // Then groups
    for (const group of r.groups.values()) {
      if (group.visible && group.hitTest(point)) {
        return group
      }
    }
    return undefined
  }

  emit('canvasContextChange', { renderer: r, interactionManager })

  // Selection and other interaction events (only when not read-only)
  if (interactionManager) {
  interactionManager.selection.on('select', (elementIds: string[]) => {
    if (suppressSelectionEvent) return
    if (elementIds.length === 0) {
      emit('selectInstanceIds', [])
      emit('selectEdgeInstanceId', null)
      emit('selectCanvasElementId', null)
      return
    }
    emit('selectCanvasElementId', elementIds[0] ?? null)

    const modelNodeIds: string[] = []
    const instanceIds: string[] = []
    for (const elementId of elementIds) {
      const nodeEntity = nodeIdToInstance.get(elementId)
      if (nodeEntity) {
        modelNodeIds.push(nodeEntity.modelNodeId)
        instanceIds.push(nodeEntity.instanceId)
      }
    }
    if (modelNodeIds.length > 0) {
      emit('selectNodes', modelNodeIds)
      emit('selectInstanceIds', instanceIds)
      return
    }

    if (elementIds.length === 1) {
      const edgeEntity = edgeIdToInstance.get(elementIds[0]!)
      if (edgeEntity) {
        emit('selectInstanceIds', [])
        emit('selectLink', edgeEntity.modelLinkId)
        emit('selectEdgeInstanceId', edgeEntity.edgeId)
      }
    }
  })

  // Drag start → initialize group drag if enabled
  interactionManager.drag.on('dragstart', (nodeIds: string[]) => {
    if (nodeIds.length === 1) {
      startGroupDrag(nodeIds[0]!)
    } else {
      groupDragData = null
    }
  })

  // Drag move → apply delta to grouped nodes
  interactionManager.drag.on('drag', (_nodeIds: string[], _currentPoint: { x: number; y: number }, delta: { x: number; y: number }) => {
    applyGroupDragDelta(delta.x, delta.y)
  })

  // Drag end → persist position changes (include grouped nodes) + auto-link
  interactionManager.drag.on('dragend', (_nodeIds: string[]) => {
    if (props.readOnly) return
    const allIds = endGroupDrag()
    if (allIds.length > 0) {
      persistNodePositions(allIds)
    } else {
      persistNodePositions(_nodeIds)
    }
    // Try auto-create link if dragged node is inside container with group relation
    if (_nodeIds.length === 1) {
      tryCreateAutoLink(_nodeIds[0]!)
    }
  })

  // Resize end → persist size changes
  interactionManager.resize.on('resizeEnd', (nodeId: string) => {
    if (props.readOnly) return
    persistNodePositions([nodeId])
  })

  // Connection validator: translate papirus node IDs to model node IDs and delegate
  interactionManager.connection.connectionValidator = (
    sourcePapId: string,
    targetPapId: string
  ) => {
    if (!props.connectionValidator) return true
    const sourceEntity = nodeIdToInstance.get(sourcePapId)
    const targetEntity = nodeIdToInstance.get(targetPapId)
    if (!sourceEntity || !targetEntity) return false
    return props.connectionValidator(sourceEntity.modelNodeId, targetEntity.modelNodeId)
  }

  // History → sync canUndo/canRedo + detect label changes
  interactionManager.history.on('change', () => {
    if (props.readOnly) return
    canUndo.value = interactionManager!.history.canUndo
    canRedo.value = interactionManager!.history.canRedo
    // Keep model state in sync with renderer commands (undo/redo drag, resize, etc.)
    persistNodePositions(Array.from(nodeIdToInstance.keys()))
    detectEdgePortChanges()
    detectEditablePolylineControlPointChanges()
    detectLabelChanges()
    detectEdgeLabelChanges()
  })

  // Connection → emit connectNodes
  interactionManager.connection.on('connect', (edge: Edge) => {
    const sourceEntity = nodeIdToInstance.get(edge.from.nodeId)
    const targetEntity = nodeIdToInstance.get(edge.to.nodeId)
    if (sourceEntity && targetEntity) {
      emit(
        'connectNodes',
        sourceEntity.modelNodeId,
        targetEntity.modelNodeId,
        sourceEntity.instanceId,
        targetEntity.instanceId,
        edge.from.portId ?? undefined,
        edge.to.portId ?? undefined,
        edge.from.outlineParam,
        edge.to.outlineParam
      )
    }
    // Remove the edge papirus created — parent will add it through state
    renderer?.removeEdge(edge.id)
  })

  interactionManager.connection.on('edgeReconnect', (edge: Edge, endpoint: 'start' | 'end') => {
    const entity = edgeIdToInstance.get(edge.id)
    if (!entity) return

    const newPapNodeId = endpoint === 'start' ? edge.from.nodeId : edge.to.nodeId
    const newInstanceId = newPapNodeId.startsWith('instance-')
      ? newPapNodeId.slice('instance-'.length)
      : null
    if (!newInstanceId) return

    const otherPapNodeId = endpoint === 'start' ? edge.to.nodeId : edge.from.nodeId
    const sourceEntity =
      endpoint === 'start'
        ? nodeIdToInstance.get(newPapNodeId)
        : nodeIdToInstance.get(otherPapNodeId)
    const targetEntity =
      endpoint === 'start'
        ? nodeIdToInstance.get(otherPapNodeId)
        : nodeIdToInstance.get(newPapNodeId)
    if (!sourceEntity || !targetEntity) return

    if (props.connectionValidator) {
      const allowed = props.connectionValidator(sourceEntity.modelNodeId, targetEntity.modelNodeId)
      if (!allowed) {
        syncDiagram()
        return
      }
    }

    const portId =
      endpoint === 'start'
        ? (edge.from.portId ?? undefined)
        : (edge.to.portId ?? undefined)
    const outlineParam =
      endpoint === 'start'
        ? (edge.from.outlineParam ?? undefined)
        : (edge.to.outlineParam ?? undefined)

    emit('reconnectEdge', entity.edgeId, endpoint, newInstanceId, portId, outlineParam)
    nextTick(() => {
      detectEdgePortChanges()
      detectEditablePolylineControlPointChanges()
    })
  })

  // Context menu only when editable (not read-only baseline view)
  if (!props.readOnly) {
  r.enableContextMenu({
    menu: {
      node: (target: ContextMenuTarget) => {
        if (target.type !== 'node') return []
        const entity = nodeIdToInstance.get(target.node.id)
        if (!entity) return []
        const instance = instanceNodes.value.find(item => item.id === entity.instanceId)
        if (instance && isNoteInstance(instance)) {
          return [
            {
              label: t('diagram.editNote'),
              icon: 'edit_note',
              action: () => emit('requestEditNote', entity.instanceId),
            },
            {
              label: t('diagram.deleteNote'),
              icon: 'delete',
              action: () => emit('requestDeleteNodeFromDiagram', entity.instanceId),
            },
          ]
        }
        return [
          {
            label: t('diagram.findInTree'),
            icon: 'account_tree',
            action: () => emit('findInTree', entity.modelNodeId),
          },
          {
            label: t('diagram.removeFromDiagram'),
            icon: 'delete',
            action: () => emit('requestDeleteNodeFromDiagram', entity.instanceId),
          },
        ]
      },
      edge: (target: ContextMenuTarget) => {
        if (target.type !== 'edge') return []
        const entity = edgeIdToInstance.get(target.edge.id)
        if (!entity) return []

        const edgeInst = instanceEdges.value.find(edge => edge.id === entity.edgeId)
        const isDiagramOnly = edgeInst?.attrs?.isDiagramOnly === true
        const effStyle = getEffectiveEdgeStyle(edgeInst as DiagramEdgeInstance)
        const currentType = (effStyle?.edgeType as EdgePathType | undefined) ?? 'bezier'

        const items: ContextMenuItem[] = []

        if (isDiagramOnly) {
          items.push(
            { label: t('diagram.noteLink'), icon: 'note', action: () => {} },
            { separator: true }
          )
        }

        items.push(
          {
            label: t('diagram.linkType'),
            icon: 'conversion_path',
            items: [
              {
                label: t('diagram.linkTypeStraight'),
                icon: 'remove',
                enabled: currentType !== 'straight',
                action: () => setEdgeTypeFromContext(entity.edgeId, 'straight'),
              },
              {
                label: t('diagram.linkTypePolyline'),
                icon: 'timeline',
                enabled: currentType !== 'polyline',
                action: () => setEdgeTypeFromContext(entity.edgeId, 'polyline'),
              },
              {
                label: t('diagram.linkTypeEditablePolyline'),
                icon: 'polyline',
                enabled: currentType !== 'editable-polyline',
                action: () => setEdgeTypeFromContext(entity.edgeId, 'editable-polyline'),
              },
              {
                label: t('diagram.linkTypeBezier'),
                icon: 'line_curve',
                enabled: currentType !== 'bezier',
                action: () => setEdgeTypeFromContext(entity.edgeId, 'bezier'),
              },
            ],
          },
          { separator: true },
          {
            label: isDiagramOnly ? t('diagram.deleteNoteLink') : t('common.delete'),
            icon: 'delete',
            action: () => emit('requestDeleteLink', entity.modelLinkId, entity.edgeId),
          }
        )

        return items
      },
    },
  })
  }

  }

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
  const selectedInstances = instanceNodes.value.filter(node => selectedSet.has(node.modelNodeId))
  if (selectedInstances.length === 0) return

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
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
  emit('updateDiagram', next)
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
    interactionManager.connection.setSnapToGrid(snapEnabled.value)
  }
  return snapEnabled.value
}

const getSnapEnabled = () => snapEnabled.value

const toggleAlign = (): boolean => {
  alignEnabled.value = !alignEnabled.value
  interactionManager?.drag.setAlignmentEnabled(alignEnabled.value)
  return alignEnabled.value
}

const getAlignEnabled = () => alignEnabled.value

const toggleRulers = (): boolean => {
  rulersEnabled.value = !rulersEnabled.value
  rulersOverlay?.setEnabled(rulersEnabled.value)
  renderer?.markDirty()
  return rulersEnabled.value
}

const getRulersEnabled = () => rulersEnabled.value

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
const canDropModelNodeToDiagram = (modelNodeId: string): boolean => {
  const notationId = activeNotationId.value
  if (!notationId) return false

  const node = props.nodes.find(item => item.id === modelNodeId && !item._isDeleted)
  if (!node) return false

  const existingComponentId = node.parsedAttrs.notationComponents[notationId]?.componentId
  if (existingComponentId) {
    return props.components.some(
      component => component.id === existingComponentId && component.notationId === notationId
    )
  }

  return props.components.some(
    component => component.notationId === notationId && component.nodeTypeId === node.nodeTypeId
  )
}

const hasDragType = (event: DragEvent, type: string): boolean =>
  Boolean(event.dataTransfer?.types?.includes(type))

const isAllowedDropEvent = (event: DragEvent): boolean => {
  const componentId = event.dataTransfer?.getData('application/x-notation-component-id')
  if (componentId) return true
  const notePayload = event.dataTransfer?.getData('application/x-model-diagram-note')
  if (notePayload === 'note') return true
  const modelNodeId = event.dataTransfer?.getData('application/x-model-node-id')
  if (modelNodeId) return canDropModelNodeToDiagram(modelNodeId)
  return false
}

const normalizeDropCoordinates = (event: DragEvent): { x: number; y: number } => {
  if (!renderer) return { x: 0, y: 0 }
  const world = renderer.screenToWorld(event.clientX, event.clientY)
  const snapTo = (value: number) =>
    snapEnabled.value ? Math.round(value / GRID_SIZE) * GRID_SIZE : value
  return {
    x: Math.max(24, snapTo(world.x - 70)),
    y: Math.max(24, snapTo(world.y - 28)),
  }
}

const onDragOver = (event: DragEvent) => {
  if (!props.activeDiagram) return

  const hasComponentPayload = hasDragType(event, 'application/x-notation-component-id')
  const hasModelNodePayload = hasDragType(event, 'application/x-model-node-id')
  const hasNotePayload = hasDragType(event, 'application/x-model-diagram-note')
  if (!hasComponentPayload && !hasModelNodePayload && !hasNotePayload) {
    return
  }

  // Browsers can hide dataTransfer payload during dragover.
  // Block only when we can reliably read an invalid model-node payload.
  if (hasModelNodePayload) {
    const modelNodeId = event.dataTransfer?.getData('application/x-model-node-id')
    if (modelNodeId && !canDropModelNodeToDiagram(modelNodeId)) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none'
      }
      return
    }
  }

  event.preventDefault()
}

const onDrop = (event: DragEvent) => {
  if (props.readOnly || !props.activeDiagram) return
  if (!isAllowedDropEvent(event)) return
  event.preventDefault()
  const { x, y } = normalizeDropCoordinates(event)

  const componentId = event.dataTransfer?.getData('application/x-notation-component-id')
  if (componentId) {
    emit('createNodeFromComponent', componentId, x, y)
    return
  }

  const notePayload = event.dataTransfer?.getData('application/x-model-diagram-note')
  if (notePayload === 'note') {
    emit('createNote', x, y)
    return
  }

  const modelNodeId = event.dataTransfer?.getData('application/x-model-node-id')
  if (modelNodeId) {
    emit('addExistingNode', modelNodeId, x, y)
  }
}

const onDragComponentStart = (event: DragEvent, componentId: string) => {
  event.dataTransfer?.setData('application/x-notation-component-id', componentId)
  event.dataTransfer?.setData('text/plain', `component:${componentId}`)
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 10, 10)
}

const onDragNoteStart = (event: DragEvent) => {
  event.dataTransfer?.setData('application/x-model-diagram-note', 'note')
  event.dataTransfer?.setData('text/plain', 'note')
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 10, 10)
}

// ── Palette ──
const paletteItems = computed(() => {
  const notationId = props.activeDiagram?.notationId
  if (!notationId) return []
  return props.components
    .filter(component => component.notationId === notationId)
    .map(component => {
      const parsedAttrs = parseEntityAttrs(component.attrs ?? null)
      const iconName = parsedAttrs.diagramStyle?.iconName?.trim()
      const fillColor = parsedAttrs.diagramStyle?.fillColor?.trim()
      const paletteGroup =
        typeof parsedAttrs.paletteGroup === 'number' && parsedAttrs.paletteGroup >= 0
          ? parsedAttrs.paletteGroup
          : 0
      return {
        ...component,
        paletteIconName: iconName && iconName.length > 0 ? iconName : 'component',
        paletteFillColor: fillColor && fillColor.length > 0 ? fillColor : 'var(--accent)',
        paletteGroup,
      }
    })
})

type PaletteEntry =
  | { kind: 'divider' }
  | { kind: 'item'; component: (typeof paletteItems.value)[number] }

const paletteEntries = computed((): PaletteEntry[] => {
  const items = paletteItems.value
  if (items.length === 0) return []

  const byGroup = new Map<number, typeof items>()
  for (const item of items) {
    const group = item.paletteGroup
    if (!byGroup.has(group)) byGroup.set(group, [])
    byGroup.get(group)!.push(item)
  }

  const sortedGroups = Array.from(byGroup.keys()).sort((a, b) => a - b)
  const entries: PaletteEntry[] = []

  for (let i = 0; i < sortedGroups.length; i++) {
    const groupKey = sortedGroups[i]
    if (groupKey === undefined) continue
    if (i > 0 || groupKey > 0) entries.push({ kind: 'divider' })
    const groupItems = byGroup.get(groupKey)!
    groupItems.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }))
    for (const comp of groupItems) {
      entries.push({ kind: 'item', component: comp })
    }
  }

  return entries
})

const buildIconUrl = (iconName: string): string => {
  const normalized = iconName.trim()
  if (!normalized) return '/icons/component.svg'
  if (normalized.startsWith('/')) return normalized
  if (normalized.toLowerCase().endsWith('.svg')) return `/icons/${normalized}`
  return `/icons/${normalized}.svg`
}

const handlePaletteIconError = (event: Event, iconName: string) => {
  const img = event.target as HTMLImageElement | null
  if (!img) return
  const triedAltPath = img.dataset.iconFallbackTried === '1'
  if (!triedAltPath) {
    img.dataset.iconFallbackTried = '1'
    const normalized = iconName.trim()
    img.src = normalized.toLowerCase().endsWith('.svg')
      ? `/icon/${normalized}`
      : `/icon/${normalized}.svg`
    return
  }
  img.src = '/icons/component.svg'
}

const setPaletteVisible = (visible: boolean) => {
  if (paletteVisible.value === visible) return
  paletteVisible.value = visible
  emit('paletteVisibleChange', visible)
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

    const bgColor =
      getComputedStyle(document.documentElement).getPropertyValue('--base-bg').trim() || '#f4f2ef'
    const r = new DiagramRenderer(canvasRef.value, {
      width,
      height,
      backgroundColor: bgColor,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      scrollbarOverlay: true,
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
  renderer?.getCanvas().removeEventListener('click', handleCanvasClickPrioritizeEdge)
  window.removeEventListener('mouseup', handleCanvasMouseUpSyncEditablePolyline)
  renderer?.destroy()
  renderer = null
  interactionManager = null
  emit('canvasContextChange', { renderer: null, interactionManager: null })
  gridOverlay = null
  miniMap = null
  rulersOverlay = null
  nodeIdToInstance.clear()
  edgeIdToInstance.clear()
})

// Watch for data changes
watch([instanceNodes, instanceEdges], () => syncDiagram(), { deep: true })
watch(
  () => props.nodes,
  () => syncDiagram(),
  { deep: true }
)

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
  () => [props.selectedModelNodeIds, props.selectedInstanceIds, props.selectedModelLinkId, props.selectedEdgeInstanceId],
  () => {
    updateSelection()
    const orderedInstances = sortInstancesByZLayer(instanceNodes.value)
    reorderRendererNodesBySize(orderedInstances)
    renderer?.markDirty()
  },
  { deep: true }
)

watch(
  () => props.selectedModelLinkId,
  () => updateSelection()
)

watch(
  () => props.gridVisible,
  next => {
    if (next === gridVisible.value) return
    gridVisible.value = next
    gridOverlay?.setEnabled(next)
    renderer?.markDirty()
  }
)

watch(
  () => props.miniMapVisible,
  next => {
    if (next === miniMapVisible.value) return
    miniMapVisible.value = next
    miniMap?.setEnabled(next)
    renderer?.markDirty()
  }
)

watch(
  () => props.snapEnabled,
  next => {
    if (next === snapEnabled.value) return
    snapEnabled.value = next
    if (interactionManager) {
      interactionManager.drag.setSnapToGrid(next)
      interactionManager.resize.setSnapToGrid(next)
      interactionManager.connection.setSnapToGrid(next)
    }
  }
)

watch(
  () => props.alignEnabled,
  next => {
    if (next === alignEnabled.value) return
    alignEnabled.value = next
    interactionManager?.drag.setAlignmentEnabled(next)
  }
)

watch(
  () => props.rulersEnabled,
  next => {
    if (next === rulersEnabled.value) return
    rulersEnabled.value = next
    rulersOverlay?.setEnabled(next)
    renderer?.markDirty()
  }
)

watch(
  () => props.paletteVisible,
  next => {
    if (next === paletteVisible.value) return
    paletteVisible.value = next
  }
)

watch(
  () => props.lockAnchorsEnabled,
  next => {
    if (next === lockAnchorsEnabled.value) return
    lockAnchorsEnabled.value = next
    if (!renderer) return
    for (const [, edge] of renderer.edges) {
      edge.lockAnchors = next
    }
    renderer.markDirty()
  }
)

watch(
  () => props.attachToOutlineEnabled,
  next => {
    if (next === attachToOutlineEnabled.value) return
    attachToOutlineEnabled.value = next
    interactionManager?.connection.setAttachToOutline(next)
    renderer?.markDirty()
  }
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
  toggleAlign,
  getAlignEnabled,
  toggleRulers,
  getRulersEnabled,
  toggleLockAnchors,
  getLockAnchorsEnabled,
  undo,
  redo,
  getCanUndo,
  getCanRedo,
  flushCanvasState,
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
      <span class="diagram-canvas__placeholder-text">{{ t('diagram.openOrCreateDiagram') }}</span>
      <span class="diagram-canvas__placeholder-hint">{{ t('diagram.selectDiagramInTree') }}</span>
    </div>

    <template v-if="activeDiagram">
      <template v-if="!readOnly">
        <button
          v-if="!paletteVisible"
          type="button"
          class="canvas-palette-toggle"
          :title="t('diagram.showNotationPalette')"
          @click="setPaletteVisible(true)"
        >
          <span class="material-symbols-outlined">palette</span>
        </button>

        <div v-if="paletteVisible" class="canvas-palette">
        <div class="canvas-palette__header">
          <span class="material-symbols-outlined">palette</span>
          <span>{{ t('diagram.palette') }}</span>
          <button
            type="button"
            class="canvas-palette__hide"
            :title="t('diagram.hidePalette')"
            @click="setPaletteVisible(false)"
          >
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
        <div v-if="paletteItems.length === 0" class="canvas-palette__empty">
          {{ t('diagram.noNotationComponents') }}
        </div>
        <div class="canvas-palette__list">
          <button
            type="button"
            class="canvas-palette__item canvas-palette__item--note"
            :title="t('diagram.note')"
            draggable="true"
            @dragstart="onDragNoteStart"
          >
            <span class="material-symbols-outlined canvas-palette__note-icon">note</span>
          </button>
          <template
            v-for="(entry, index) in paletteEntries"
            :key="entry.kind === 'item' ? entry.component.id : `divider-${index}`"
          >
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
              />
            </button>
          </template>
        </div>
      </div>
      </template>
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
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.canvas-palette-toggle {
  position: absolute;
  right: 15px;
  top: 10px;
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
  right: 15px;
  top: 10px;
  bottom: 12px;
  width: 120px;
  padding: 8px 6px 8px 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 6;
  margin-bottom: 12px;
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

.canvas-palette__item--note {
  --palette-item-fill: #f1c40f;
}

.canvas-palette__note-icon {
  font-size: 18px;
  color: #7a5a00;
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
