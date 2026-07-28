<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DiagramRenderer,
  RectangleNode,
  CompositeNode,
  CustomShapeNode,
  deserializeCComponent,
  Node as DiagramNode,
  Edge,
  GridOverlay,
  MiniMap,
  RulersOverlay,
  InteractionManager,
  TextLabel,
  type ContextMenuTarget,
  type ContextMenuItem,
  type TextStyle,
  type TextLabelOptions,
  type EdgePathType,
  type EdgeStyle,
  type CContainer,
  isNodeEdgeEndpoint,
} from '@ngroznykh/papirus'
import {
  createDiagramNode,
  getDiagramNodeShape,
  hasSpecialRectangleShape,
  resolveCornerCutPx,
  resolveDiagramNodeShape,
} from '@/features/diagram/diagramNodeFactory'
import { customOutlineToPath2D, customOutlineToSvgPath } from '@/utils/customOutlinePath'
import { diagramShapeFactories } from '@/utils/diagramShapes'
import { applyContentInsetFromStyle } from '@/features/diagram-style/utils/applyContentInsetFromStyle'
import {
  ensureNodeShapeScaleSliceCatalog,
  withResolvedScaleSlice,
} from '@/utils/resolveCustomScaleSlice'
import { useDiagramRenderer } from '@/features/diagram/useDiagramRenderer'
import type { ComponentResponse, NodeTypeResponse, RelationResponse, RelationRuleResponse } from '@/types/api'
import { isCustomPropertyValueFilled } from '@/domain/attrs/customPropertyValues'
import {
  parseEntityAttrs,
  type CustomProperty,
  type DiagramStyle,
  type InteractiveKind,
} from '@/domain/attrs/notationAttrs'
import {
  DEFAULT_INTERACTIVE_BADGE_ICON,
  getInteractiveBadgeIconIds,
} from '@/config/interactiveBadgeIcons'
import type { DiagramAttrs, DiagramNodeInstance, DiagramEdgeInstance } from '../modelAttrs'
import { resolveInstanceComponentId } from '../modelAttrs'
import type { EditorDiagram, EditorLink, EditorNode } from '../types'
import {
  flushPersistDiagramViewport,
  persistDiagramViewport,
  restoreDiagramViewport,
} from '../utils/diagramViewportPersistence'
import {
  applyEditablePolylineControlPointChangesToDiagram as applyEditablePolylineControlPointChangesToDiagramAttrs,
  applyNodeAndEditablePolylineChangesToDiagram as applyNodeAndEditablePolylineChangesToDiagramAttrs,
  applyNodePositionsToDiagram as applyNodePositionsToDiagramAttrs,
  areControlPointsEqual,
  readControlPointsFromAttrs,
  readControlPointsFromEdge,
} from '../utils/diagramCanvasSync'
import { getDiagramScopedNodeValues } from '../utils/diagramScopedProperties'
import { resolveDiagramNodeLabelTemplate } from '../utils/nodeLabelTemplate'
import {
  buildModelEdgeLabelBackground,
  buildModelEdgeLabelConfig,
  buildModelNodeIcon,
  resolveModelEdgeOptions,
} from '../utils/diagramCanvasBuilders'
import { resolveComponentAnchorPoints, mergeEdgeLabelStyleFromDiagramStyle } from '../../notations/utils/notationElementBuilders'
import { runDiagramLayout } from '../layout/runDiagramLayout'
import {
  applyStylePropertyBindings,
  BIND_TO_NAME,
  createDefaultCompositeContent,
  injectCompositeNameAndIcon,
  resolveCompositeBoundIconName,
} from '@/features/diagram-style/utils/compositeBindings'
import {
  applyContainerInlineLabel,
  getContainerLabel,
  getHostEdgeInstanceId,
  isContainerInstance,
  isEdgeAnchorInstance,
} from '../utils/diagramOnlyInstances'
import { syncEdgeAnchorPositions } from '../utils/edgeAnchorSync'
import { buildEdgeAnchorLookup, resolveDiagramEdgeEndpoint } from '../utils/resolveDiagramEdgeEndpoint'

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
    navigationOnlyMode?: boolean
    /** Подсветка diff: красный — удалён, зелёный — добавлен, жёлтый — изменён */
    diffStateByModelNodeId?: Record<string, 'added' | 'removed' | 'modified'>
    diffStateByModelLinkId?: Record<string, 'added' | 'removed' | 'modified'>
    diffStateByEdgeInstanceId?: Record<string, 'added' | 'removed' | 'modified'>
    /** Курсор удалённого редактора (мировые координаты) — только для зрителя */
    remoteEditorPointer?: { worldX: number; worldY: number; visible: boolean } | null
    /** Держатель lock: подавлять live во время жестов и слать pointer */
    diagramLiveBroadcastEnabled?: boolean
    onRemotePointerTrack?: (clientX: number, clientY: number) => void
    onRemotePointerLeave?: () => void
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
    navigationOnlyMode: false,
    selectedEdgeInstanceId: null,
    selectedInstanceIds: () => [],
    diffStateByModelNodeId: undefined,
    diffStateByModelLinkId: undefined,
    diffStateByEdgeInstanceId: undefined,
    remoteEditorPointer: null,
    diagramLiveBroadcastEnabled: false,
    onRemotePointerTrack: undefined,
    onRemotePointerLeave: undefined,
  }
)

const DIFF_COLORS = {
  added: { strokeColor: '#1ea355', fillColor: 'rgba(30, 163, 85, 0.15)' },
  removed: { strokeColor: '#dc3545', fillColor: 'rgba(220, 53, 69, 0.15)' },
  modified: { strokeColor: '#e67e22', fillColor: 'rgba(230, 126, 34, 0.12)' },
} as const

function applyDiffOverlayToNodeStyle(
  style: Record<string, unknown>,
  state: 'added' | 'removed' | 'modified'
): void {
  const c = DIFF_COLORS[state]
  style.strokeColor = c.strokeColor
  style.strokeWidth = 2
  style.fillColor = c.fillColor
}

function applyDiffOverlayToEdgeStyle(
  style: Record<string, unknown> & { strokeColor?: string; strokeWidth?: number },
  state: 'added' | 'removed' | 'modified'
): void {
  const c = DIFF_COLORS[state]
  ;(style as Record<string, unknown>).strokeColor = c.strokeColor
  ;(style as Record<string, unknown>).strokeWidth = Math.max(
    Number(style.strokeWidth) || 2,
    2
  )
}

const emit = defineEmits<{
  updateDiagram: [next: DiagramAttrs]
  selectNodes: [modelNodeIds: string[]]
  selectInstanceIds: [instanceIds: string[]]
  selectLink: [modelLinkId: string | null]
  selectEdgeInstanceId: [edgeInstanceId: string | null]
  selectCanvasElementId: [elementId: string | null]
  canvasContextChange: [
    ctx: { renderer: DiagramRenderer | null; interactionManager: InteractionManager | null },
  ]
  createNodeFromComponent: [componentId: string, x: number, y: number]
  createNote: [x: number, y: number]
  createContainer: [x: number, y: number]
  addExistingNode: [modelNodeId: string, x: number, y: number]
  placeExistingModelLink: [modelLinkId: string]
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
  connectNodeToEdge: [
    nodeModelNodeId: string,
    nodeInstanceId: string,
    hostEdgeInstanceId: string,
    pathParam: number,
    nodeIsSource: boolean,
    nodePortId?: string,
    nodeOutlineParam?: number,
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
  openDiagram: [diagramId: string]
  openDocument: [fileId: string]
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
  liveCollaborationGesture: [phase: 'block' | 'unblock']
  layoutError: [message: string]
  layoutBusy: [busy: boolean]
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

// Toolbar props are synced in the side-effect watches below (grid/snap/outline/…).
// Do not add a second prop→ref watch here: it races those watchers and skips
// setAttachToOutline / setSnapToGrid / etc. via `if (next === local) return`.
const canUndo = ref(false)
const canRedo = ref(false)
/** Счётчик для пересчёта экранных координат remote pointer при zoom/pan */
const viewportRev = ref(0)

const remotePointerScreen = computed((): { left: string; top: string } | null => {
  void viewportRev.value
  const p = props.remoteEditorPointer
  const r = renderer
  const container = containerRef.value
  if (!p?.visible || !r || !container) return null
  const contRect = container.getBoundingClientRect()
  // worldToScreen возвращает координаты уже в системе viewport (включает getBoundingClientRect canvas)
  const pt = r.worldToScreen(p.worldX, p.worldY)
  return {
    left: `${pt.x - contRect.left}px`,
    top: `${pt.y - contRect.top}px`,
  }
})

function onContainerPointerMove(e: MouseEvent): void {
  props.onRemotePointerTrack?.(e.clientX, e.clientY)
}

function onContainerPointerLeave(): void {
  props.onRemotePointerLeave?.()
}

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
let suppressSelectionEvent = false
let suppressViewportPersistence = false
let lastActiveDiagramId: string | null = null

function safePersistViewport(diagramId: string, r: DiagramRenderer) {
  if (!suppressViewportPersistence) persistDiagramViewport(diagramId, r)
}

function flushViewport(diagramId: string | null) {
  if (diagramId) flushPersistDiagramViewport(diagramId)
}

function safeRestoreViewport(diagramId: string, r: DiagramRenderer): boolean {
  suppressViewportPersistence = true
  try {
    return restoreDiagramViewport(diagramId, r)
  } finally {
    suppressViewportPersistence = false
  }
}

// Maps: papirus element ID → model entity
const nodeIdToInstance = new Map<string, { modelNodeId: string; instanceId: string }>()
const edgeIdToInstance = new Map<string, { modelLinkId: string; edgeId: string }>()
/** Last display-name we pushed onto a papirus node from syncDiagram (editable label / composite name). */
const syncedNodeNameByPapId = new Map<string, string>()
/** Outer composite shape fingerprint last applied (shapeType / outline / slice / radius). */
const compositeOuterShapeKeyByPapId = new Map<string, string>()

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
  // Self-loops are never "nested containment" — keep Aggregation/Composition visible
  // even when the relation has group=true (bounds equality would otherwise hide them).
  if (edge.sourceInstanceId === edge.targetInstanceId) return false
  const relation = getBoundRelation(edge.modelLinkId)
  if (!hasGroupProperty(relation)) return false
  return isTargetInsideSource(edge.sourceInstanceId, edge.targetInstanceId)
}

// ── Group drag state ──
let groupDragData: {
  leaderPapNodeId: string
  followerIds: string[]
  startPositions: Map<string, { x: number; y: number }>
  /** Papirus edge id → control points at drag start (both endpoints inside the group) */
  innerEditablePolylineControlPoints: Map<string, { x: number; y: number }[]>
} | null = null

const isNodeGroupingEnabled = (papNodeId: string): boolean => {
  const entity = nodeIdToInstance.get(papNodeId)
  if (!entity) return false
  const notationId = activeNotationId.value
  if (!notationId) return false
  const node = nodeById.value.get(entity.modelNodeId)
  if (!node) return false
  const instance = instanceNodes.value.find(item => item.id === entity.instanceId)
  const componentId = resolveInstanceComponentId({
    instance: instance ?? null,
    node,
    notationId,
  })
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

  const groupNodeIds = new Set<string>([leaderPapNodeId, ...followers])
  const innerEditablePolylineControlPoints = new Map<string, { x: number; y: number }[]>()
  if (renderer) {
    for (const [, papEdge] of renderer.edges) {
      if (!papEdge.hasEditableControlPoints()) continue
      const fromId = papEdge.from.nodeId
      const toId = papEdge.to.nodeId
      if (!fromId || !toId || !groupNodeIds.has(fromId) || !groupNodeIds.has(toId)) {
        continue
      }
      const cps = papEdge.controlPoints
      if (!cps?.length) continue
      innerEditablePolylineControlPoints.set(
        papEdge.id,
        cps.map(p => ({ x: p.x, y: p.y }))
      )
    }
  }

  groupDragData = {
    leaderPapNodeId,
    followerIds: followers,
    startPositions,
    innerEditablePolylineControlPoints,
  }
}

/**
 * Papirus moves only the group leader; followers and inner editable-polylines must follow
 * the leader’s total offset from drag start (not the per-frame `drag` delta).
 */
const syncGroupDragFromLeader = (): void => {
  if (!groupDragData || !renderer) return
  const leader = renderer.getNode(groupDragData.leaderPapNodeId)
  const leaderStart = groupDragData.startPositions.get(groupDragData.leaderPapNodeId)
  if (!leader || !leaderStart) return

  const dx = leader.x - leaderStart.x
  const dy = leader.y - leaderStart.y

  for (const followerId of groupDragData.followerIds) {
    const papNode = renderer.getNode(followerId)
    const startPos = groupDragData.startPositions.get(followerId)
    if (!papNode || !startPos) continue
    papNode.x = startPos.x + dx
    papNode.y = startPos.y + dy
  }

  for (const [edgeId, initialPoints] of groupDragData.innerEditablePolylineControlPoints) {
    const papEdge = renderer.getEdge(edgeId)
    if (!papEdge || initialPoints.length === 0) continue
    papEdge.controlPoints = initialPoints.map(p => ({ x: p.x + dx, y: p.y + dy }))
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

const getComponentIdForInstance = (
  modelNodeId: string,
  instanceId?: string,
): string | undefined => {
  const notationId = activeNotationId.value
  if (!notationId) return undefined
  const node = nodeById.value.get(modelNodeId)
  if (!node) return undefined
  const instance = instanceId
    ? (instanceNodes.value.find(item => item.id === instanceId) ?? null)
    : null
  return resolveInstanceComponentId({ instance, node, notationId }) ?? undefined
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
  const targetComponentId = getComponentIdForInstance(targetModelNodeId, entity.instanceId)
  if (!targetComponentId) return

  const containerEntity = nodeIdToInstance.get(directContainerPapNodeId)
  if (!containerEntity) return

  const sourceModelNodeId = containerEntity.modelNodeId
  const sourceComponentId = getComponentIdForInstance(
    sourceModelNodeId,
    containerEntity.instanceId,
  )
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

// ── Style resolution ──
const getBoundComponentStyle = (instance: DiagramNodeInstance): DiagramStyle | undefined => {
  const node = nodeById.value.get(instance.modelNodeId)
  const notationId = activeNotationId.value
  if (!node || !notationId) return undefined
  const componentId = resolveInstanceComponentId({ instance, node, notationId })
  if (!componentId) return undefined
  return componentDiagramStyleById.value.get(componentId)
}

const getEffectiveStyle = (instance: DiagramNodeInstance): DiagramStyle | undefined => {
  const bound = getBoundComponentStyle(instance)
  let merged: DiagramStyle | undefined
  if (instance.attrs?.diagramStyle && typeof instance.attrs.diagramStyle === 'object') {
    merged = {
      ...(bound ?? {}),
      ...(instance.attrs.diagramStyle as DiagramStyle),
    }
  } else {
    merged = bound
  }
  return withResolvedScaleSlice(merged)
}

const isNoteInstance = (instance: DiagramNodeInstance): boolean => instance.attrs?.isNote === true

const isDirectoryNoteInstance = (instance: DiagramNodeInstance): boolean =>
  instance.attrs?.isDirectoryNote === true

const isDiagramOnlyVisualInstance = (instance: DiagramNodeInstance): boolean =>
  isNoteInstance(instance) || isContainerInstance(instance) || isEdgeAnchorInstance(instance)

const getNoteText = (instance: DiagramNodeInstance): string => {
  const value = instance.attrs?.noteText
  return typeof value === 'string' && value.trim().length > 0 ? value : t('diagram.newNote')
}

const getInstanceDisplayName = (instance: DiagramNodeInstance): string => {
  if (isNoteInstance(instance)) return getNoteText(instance)
  if (isContainerInstance(instance)) return getContainerLabel(instance)
  if (isEdgeAnchorInstance(instance)) return ''
  return nodeById.value.get(instance.modelNodeId)?.name ?? 'Node'
}

const getInstanceDimensions = (instance: {
  modelNodeId: string
  width?: number
  height?: number
  attrs?: Record<string, unknown>
}) => {
  const full = instance as DiagramNodeInstance
  const ds = full.attrs?.diagramStyle
    ? getEffectiveStyle(full)
    : getBoundComponentStyle(full)
  return {
    width: instance.width ?? (typeof ds?.width === 'number' ? ds.width : DEFAULT_NODE_WIDTH),
    height: instance.height ?? (typeof ds?.height === 'number' ? ds.height : DEFAULT_NODE_HEIGHT),
  }
}

const getComponentMinDimensions = (instance: DiagramNodeInstance) => {
  const ds = getBoundComponentStyle(instance)
  return {
    width: typeof ds?.width === 'number' ? ds.width : DEFAULT_NODE_WIDTH,
    height: typeof ds?.height === 'number' ? ds.height : DEFAULT_NODE_HEIGHT,
  }
}

function applyMinSizeConstraint(node: DiagramNode, instance: DiagramNodeInstance) {
  const original = node.getContentMinSize.bind(node)
  node.getContentMinSize = (ctx: CanvasRenderingContext2D) => {
    const contentMin = original(ctx)
    const compMin = getComponentMinDimensions(instance)
    return {
      width: Math.max(contentMin.width, compMin.width),
      height: Math.max(contentMin.height, compMin.height),
    }
  }
}

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

function getNodeScopedPropertyValues(
  modelNodeId: string,
  nodeInstanceId?: string
): Record<string, unknown> {
  const node = nodeById.value.get(modelNodeId)
  const notationId = activeNotationId.value
  const typeProps = node ? { ...node.parsedAttrs.typeProperties } : {}
  if (!node || !notationId) return typeProps
  const componentId = getComponentIdForInstance(modelNodeId, nodeInstanceId)
  if (!componentId) return typeProps
  const diagramScoped = getDiagramScopedNodeValues({
    diagram: props.activeDiagram?.parsedAttrs,
    modelNodeId,
    notationId,
    componentId,
    nodeAttrsFallback: node.parsedAttrs,
    instanceId: nodeInstanceId,
  })
  return { ...typeProps, ...diagramScoped }
}

/** Только scoped-значения компонента нотации (без typeProperties), для шаблона `${prop}`. */
function getComponentScopedPropertyValuesOnly(
  modelNodeId: string,
  nodeInstanceId?: string
): Record<string, unknown> {
  const node = nodeById.value.get(modelNodeId)
  const notationId = activeNotationId.value
  if (!node || !notationId) return {}
  const componentId = getComponentIdForInstance(modelNodeId, nodeInstanceId)
  if (!componentId) return {}
  return getDiagramScopedNodeValues({
    diagram: props.activeDiagram?.parsedAttrs,
    modelNodeId,
    notationId,
    componentId,
    nodeAttrsFallback: node.parsedAttrs,
    instanceId: nodeInstanceId,
  })
}

function getNodeTypeCustomProperties(modelNodeId: string): CustomProperty[] {
  const node = nodeById.value.get(modelNodeId)
  if (!node) return []
  const nodeType = props.nodeTypes.find(nt => nt.id === node.nodeTypeId)
  if (!nodeType) return []
  return parseEntityAttrs(nodeType.attrs ?? null).customProperties.filter(p => !p.system)
}

function getNodeComponentCustomProperties(
  modelNodeId: string,
  nodeInstanceId?: string,
): CustomProperty[] {
  const node = nodeById.value.get(modelNodeId)
  const notationId = activeNotationId.value
  if (!node || !notationId) return []
  const componentId = getComponentIdForInstance(modelNodeId, nodeInstanceId)
  if (!componentId) return []
  const component = props.components.find(c => c.id === componentId)
  if (!component) return []
  return parseEntityAttrs(component.attrs ?? null).customProperties.filter(p => !p.system)
}

function buildInteractiveBadgeIconUrl(materialIconName: string): string {
  const allowed = getInteractiveBadgeIconIds()
  const name = allowed.includes(materialIconName) ? materialIconName : DEFAULT_INTERACTIVE_BADGE_ICON
  return `/icons/${name}.svg`
}

function getInteractiveBadgesForInstance(instance: DiagramNodeInstance): Array<{ id: string; iconUrl: string }> {
  const node = nodeById.value.get(instance.modelNodeId)
  const notationId = activeNotationId.value
  if (!node || !notationId) return []
  const componentId = resolveInstanceComponentId({ instance, node, notationId })
  if (!componentId) return []
  const component = props.components.find(c => c.id === componentId)
  if (!component) return []
  const customProperties = parseEntityAttrs(component.attrs ?? null).customProperties
  const scopedValues = getNodeScopedPropertyValues(instance.modelNodeId, instance.id)
  const result: Array<{ id: string; iconUrl: string }> = []
  for (const prop of customProperties) {
    if (!prop.interactive) continue
    if (
      !isCustomPropertyValueFilled(
        scopedValues[prop.id] ?? scopedValues[prop.name],
        prop.type,
      )
    ) {
      continue
    }
    result.push({
      id: prop.id,
      iconUrl: buildInteractiveBadgeIconUrl(prop.interactiveIcon ?? DEFAULT_INTERACTIVE_BADGE_ICON),
    })
  }
  return result
}

function buildNodeLabel(
  name: string,
  ds?: DiagramStyle,
  modelNodeId?: string,
  nodeInstanceId?: string
): string | TextLabelOptions | undefined {
  if (ds?.showLabel === false) {
    return undefined
  }

  const hasTemplate = !!ds?.labelTemplate
  let displayText = name
  if (hasTemplate && modelNodeId) {
    const node = nodeById.value.get(modelNodeId)
    const typeProps = getNodeTypeCustomProperties(modelNodeId)
    const compProps = getNodeComponentCustomProperties(modelNodeId, nodeInstanceId)
    const typeValues = node ? { ...node.parsedAttrs.typeProperties } : {}
    const componentValues = getComponentScopedPropertyValuesOnly(modelNodeId, nodeInstanceId)
    displayText = resolveDiagramNodeLabelTemplate(ds!.labelTemplate!, name, {
      typeProperties: typeProps,
      typeValues,
      componentProperties: compProps,
      componentValues,
    })
  }

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

type InstanceCompositeOptions = {
  content: CContainer
  stylePatch?: Record<string, unknown>
}

function resolveInstanceComposite(
  instance: DiagramNodeInstance,
  ds: DiagramStyle | undefined,
  nodeName: string
): InstanceCompositeOptions | undefined {
  if (resolveDiagramNodeShape(ds) !== 'composite') return undefined

  const componentProperties = getNodeComponentCustomProperties(instance.modelNodeId, instance.id)
  const nodeTypeProperties = getNodeTypeCustomProperties(instance.modelNodeId)
  const nodeEntry = nodeById.value.get(instance.modelNodeId)
  const nodeTypeValues = nodeEntry ? { ...nodeEntry.parsedAttrs.typeProperties } : {}
  const componentValues = getComponentScopedPropertyValuesOnly(instance.modelNodeId, instance.id)

  const baseContent = ds?.compositeContent ?? createDefaultCompositeContent(nodeName)
  const contentWithNameAndIcon = injectCompositeNameAndIcon(baseContent, {
    displayName: nodeName,
    notationIconName: ds?.iconName,
    propertyValues: { ...nodeTypeValues, ...componentValues },
  })
  const bindingResult = applyStylePropertyBindings(ds, contentWithNameAndIcon, {
    componentProperties,
    componentValues,
    nodeTypeProperties,
    nodeTypeValues,
  })
  return {
    content: deserializeCComponent(bindingResult.content) as unknown as CContainer,
    stylePatch: bindingResult.outerPatch,
  }
}

function isCompositeContentEqual(a: CContainer, b: CContainer): boolean {
  return JSON.stringify(a.serialize()) === JSON.stringify(b.serialize())
}

/** Fingerprint of composite outer geometry (not inner content tree). */
function getCompositeOuterShapeKey(ds?: DiagramStyle): string {
  return JSON.stringify({
    compositeShapeType: ds?.compositeShapeType ?? 'rectangle',
    customShapeId: ds?.customShapeId ?? null,
    customOutline: ds?.customOutline ?? null,
    customScaleSlice: ds?.customScaleSlice ?? null,
    cornerRadius: ds?.cornerRadius ?? 0,
    cornerCut: ds?.cornerCut ?? null,
  })
}

// ── Node creation ──
function createInstanceNode(instance: DiagramNodeInstance): DiagramNode {
  const ds = getEffectiveStyle(instance)
  const visual = resolveInstanceStyle(instance, ds)
  const diffState = props.diffStateByModelNodeId?.[instance.modelNodeId]
  if (diffState) applyDiffOverlayToNodeStyle(visual.style, diffState)
  const shape = resolveDiagramNodeShape(ds)
  const nodeName = getInstanceDisplayName(instance)
  const icon = buildModelNodeIcon(ds)
  let specialRectangleShape: 'sticky-note' | 'folder-tab' | undefined
  if (shape === 'rectangle' && isDirectoryNoteInstance(instance)) {
    specialRectangleShape = 'folder-tab'
  } else if (shape === 'rectangle' && isNoteInstance(instance)) {
    specialRectangleShape = 'sticky-note'
  }
  const composite = resolveInstanceComposite(instance, ds, nodeName)

  const node = createDiagramNode({
    id: `instance-${instance.id}`,
    x: instance.x,
    y: instance.y,
    width: visual.width,
    height: visual.height,
    style: visual.style,
    diagramStyle: ds,
    anchorPoints: resolveComponentAnchorPoints(ds),
    contentInset: (ds?.contentInset ?? 0) as unknown as number,
    contentInsetBaseStyle: getBoundComponentStyle(instance),
    badges: getInteractiveBadgesForInstance(instance),
    label: buildNodeLabel(nodeName, ds, instance.modelNodeId, instance.id),
    ...(icon ? { icon } : {}),
    cornerRadius: visual.cornerRadius,
    composite,
    specialRectangleShape,
  })
  applyMinSizeConstraint(node, instance)
  return node
}

// ── Sync diagram ──
function syncDiagram() {
  if (!renderer) return
  const currentNodeIds = new Set<string>()
  const currentEdgeIds = new Set<string>()
  nodeIdToInstance.clear()
  edgeIdToInstance.clear()
  const nextSyncedNames = new Map<string, string>()
  const orderedInstances = sortInstancesByZLayer(instanceNodes.value)

  const edgeAnchorLookup = buildEdgeAnchorLookup(instanceNodes.value)
  const edgeInstanceIds = new Set(instanceEdges.value.map(edge => edge.id))

  // Sync nodes (skip invisible edge-anchors — junctions bind to host edges in Papirus)
  for (const instance of orderedInstances) {
    if (isEdgeAnchorInstance(instance)) continue
    const modelNode = nodeById.value.get(instance.modelNodeId)
    if (!isDiagramOnlyVisualInstance(instance) && (!modelNode || modelNode._isDeleted)) continue

    const papNodeId = `instance-${instance.id}`
    currentNodeIds.add(papNodeId)
    nodeIdToInstance.set(papNodeId, {
      modelNodeId: instance.modelNodeId,
      instanceId: instance.id,
    })
    const nodeName = getInstanceDisplayName(instance)
    if (
      !isNoteInstance(instance) &&
      !isContainerInstance(instance) &&
      !isEdgeAnchorInstance(instance)
    ) {
      nextSyncedNames.set(papNodeId, nodeName)
    }

    const existing = renderer.getNode(papNodeId)
    if (existing) {
      const ds = getEffectiveStyle(instance)
      const expectedShape = resolveDiagramNodeShape(ds)
      const existingShape = getDiagramNodeShape(existing)
      const shouldUseFolderTab = isDirectoryNoteInstance(instance) && expectedShape === 'rectangle'
      const shouldUseStickyNote =
        isNoteInstance(instance) && !isDirectoryNoteInstance(instance) && expectedShape === 'rectangle'
      const needsFolderTabRebuild =
        shouldUseFolderTab && !hasSpecialRectangleShape(existing, 'folder-tab')
      const needsStickyNoteRebuild =
        shouldUseStickyNote && !hasSpecialRectangleShape(existing, 'sticky-note')

      if (expectedShape !== existingShape || needsFolderTabRebuild || needsStickyNoteRebuild) {
        renderer.removeNode(papNodeId)
        renderer.addNode(createInstanceNode(instance))
        if (expectedShape === 'composite') {
          compositeOuterShapeKeyByPapId.set(papNodeId, getCompositeOuterShapeKey(ds))
        } else {
          compositeOuterShapeKeyByPapId.delete(papNodeId)
        }
        continue
      }

      let compositeOptions: InstanceCompositeOptions | undefined
      // Composite content or outer shape may change; rebuild then so resize still keeps selection otherwise.
      if (expectedShape === 'composite' && existing instanceof CompositeNode) {
        compositeOptions = resolveInstanceComposite(instance, ds, nodeName)
        const outerKey = getCompositeOuterShapeKey(ds)
        const contentChanged =
          !!compositeOptions && !isCompositeContentEqual(existing.content, compositeOptions.content)
        const outerChanged = compositeOuterShapeKeyByPapId.get(papNodeId) !== outerKey
        if (contentChanged || outerChanged) {
          renderer.removeNode(papNodeId)
          renderer.addNode(createInstanceNode(instance))
          compositeOuterShapeKeyByPapId.set(papNodeId, outerKey)
          continue
        }
      }

      // Update in-place
      const visual = resolveInstanceStyle(instance, ds)
      const diffState = props.diffStateByModelNodeId?.[instance.modelNodeId]
      if (diffState) applyDiffOverlayToNodeStyle(visual.style, diffState)
      const nextStyle = compositeOptions?.stylePatch
        ? { ...visual.style, ...compositeOptions.stylePatch }
        : visual.style

      existing.x = instance.x
      existing.y = instance.y
      existing.width = visual.width
      existing.height = visual.height
      existing.style = nextStyle
      existing.anchorPoints = resolveComponentAnchorPoints(ds)
      const newLabel = buildNodeLabel(nodeName, ds, instance.modelNodeId, instance.id)
      if (newLabel === undefined) {
        existing.label = undefined
      } else if (typeof newLabel === 'string') {
        existing.label = newLabel
      } else {
        existing.label = new TextLabel(newLabel)
      }
      if (existing instanceof RectangleNode) {
        existing.cornerRadius = visual.cornerRadius
      }
      if (
        expectedShape === 'custom' &&
        existing instanceof CustomShapeNode &&
        ds?.customOutline?.length
      ) {
        const segments = ds.customOutline
        const slice = ds.customScaleSlice
        existing.setPathFactory((w, h) => customOutlineToPath2D(segments, w, h, slice))
        existing.setSvgPath((w, h) => customOutlineToSvgPath(segments, w, h, slice))
      }
      if (expectedShape === 'beveled-rectangle' && existing instanceof CustomShapeNode) {
        const cut = resolveCornerCutPx(ds)
        const factory = diagramShapeFactories['beveled-rectangle']
        existing.setPathFactory((w, h) => factory.path(w, h, cut))
        existing.setSvgPath((w, h) => factory.svgPath(w, h, cut))
      }
      existing.icon = buildModelNodeIcon(ds)
      ;(existing as DiagramNode & { badges: Array<{ id: string; iconUrl: string }> }).badges =
        getInteractiveBadgesForInstance(instance)
      applyContentInsetFromStyle(existing, ds, getBoundComponentStyle(instance))
      if (ds?.labelPlacement) {
        ;(existing as unknown as { labelPlacement?: string }).labelPlacement = ds.labelPlacement
      }
      applyMinSizeConstraint(existing, instance)
    } else {
      renderer.addNode(createInstanceNode(instance))
      if (resolveDiagramNodeShape(getEffectiveStyle(instance)) === 'composite') {
        compositeOuterShapeKeyByPapId.set(
          papNodeId,
          getCompositeOuterShapeKey(getEffectiveStyle(instance))
        )
      }
    }
  }

  // Sync edges
  for (const edge of instanceEdges.value) {
    const modelLink = linkById.value.get(edge.modelLinkId)
    const isDiagramOnlyEdge = edge.attrs?.isDiagramOnly === true
    // Связь помечена удалённой в модели — не рисуем.
    if (!isDiagramOnlyEdge && modelLink?._isDeleted) continue
    // Связи нет в props.links (например poll после удаления на сервере), но ребро ещё в attrs —
    // всё равно рисуем, иначе стрелка пропадает при неизменном JSON диаграммы.

    // Skip rendering if relation has group=true and target is inside source
    if (shouldSkipEdgeRendering(edge)) continue

    const papEdgeId = `edge-${edge.id}`
    currentEdgeIds.add(papEdgeId)
    edgeIdToInstance.set(papEdgeId, { modelLinkId: edge.modelLinkId, edgeId: edge.id })

    const sourcePapId = `instance-${edge.sourceInstanceId}`
    const targetPapId = `instance-${edge.targetInstanceId}`
    const hostEdgeExists = (hostEdgeInstanceId: string): boolean =>
      edgeInstanceIds.has(hostEdgeInstanceId) || !!renderer?.getEdge(`edge-${hostEdgeInstanceId}`)
    const existing = renderer.getEdge(papEdgeId)

    const fromOutline = edge.attrs?.fromOutlineParam as number | undefined
    const toOutline = edge.attrs?.toOutlineParam as number | undefined
    const fromEndpoint = resolveDiagramEdgeEndpoint({
      instanceId: edge.sourceInstanceId,
      papNodeId: sourcePapId,
      outlineParam: fromOutline,
      portId:
        (edge.attrs?.fromPortId as string | undefined) ??
        (existing?.from.nodeId ? existing.from.portId : undefined),
      anchorLookup: edgeAnchorLookup,
      hostEdgeExists,
    })
    const toEndpoint = resolveDiagramEdgeEndpoint({
      instanceId: edge.targetInstanceId,
      papNodeId: targetPapId,
      outlineParam: toOutline,
      portId:
        (edge.attrs?.toPortId as string | undefined) ??
        (existing?.to.nodeId ? existing.to.portId : undefined),
      anchorLookup: edgeAnchorLookup,
      hostEdgeExists,
    })
    if (!fromEndpoint || !toEndpoint) continue
    // Node ends must be present on canvas; edge-attached ends use host edge id.
    if (fromEndpoint.nodeId && !currentNodeIds.has(fromEndpoint.nodeId)) continue
    if (toEndpoint.nodeId && !currentNodeIds.has(toEndpoint.nodeId)) continue

    const ds = getEffectiveEdgeStyle(edge)
    const edgeOpts = resolveModelEdgeOptions(ds)
    const linkDiffState =
      props.diffStateByEdgeInstanceId?.[edge.id] ?? props.diffStateByModelLinkId?.[edge.modelLinkId]
    if (linkDiffState) {
      const styleObj = (edgeOpts.style ?? {}) as Record<string, unknown>
      applyDiffOverlayToEdgeStyle(styleObj, linkDiffState)
      edgeOpts.style = styleObj as EdgeStyle
    }
    const edgeLabel = getInstanceEdgeLabel(edge)
    const edgeLabelConfigRaw = buildModelEdgeLabelConfig(edgeLabel, ds)
    const edgeLabelText =
      typeof edgeLabelConfigRaw === 'string' ? edgeLabelConfigRaw : edgeLabelConfigRaw?.text
    const edgeLabelBackground = buildModelEdgeLabelBackground(ds)
    const controlPoints = readControlPointsFromAttrs(edge.attrs)

    if (existing) {
      existing.from = fromEndpoint
      existing.to = toEndpoint
      if (edgeOpts.style) existing.style = { ...existing.style, ...edgeOpts.style }
      if (edgeOpts.type) existing.type = edgeOpts.type
      // Explicit marker types (incl. 'none' for note links) disable legacy arrowType heads.
      if (ds?.startMarkerType != null || ds?.endMarkerType != null) {
        existing.arrowType = 'none'
      }
      if (edgeOpts.startMarker !== undefined) existing.startMarker = edgeOpts.startMarker
      if (edgeOpts.endMarker !== undefined) existing.endMarker = edgeOpts.endMarker
      if (!areControlPointsEqual(readControlPointsFromEdge(existing), controlPoints)) {
        ;(existing as unknown as { controlPoints?: Array<{ x: number; y: number }> }).controlPoints =
          controlPoints
      }
      existing.labelOffset = edgeOpts.labelOffset ?? existing.labelOffset
      if (edgeOpts.labelPosition != null) existing.labelPosition = edgeOpts.labelPosition
      if (edgeOpts.labelFollowPath != null) existing.labelFollowPath = edgeOpts.labelFollowPath
      if (edgeOpts.labelLineGap !== undefined) existing.labelLineGap = edgeOpts.labelLineGap
      // Update label in place — assigning a string recreates TextLabel and drops styles.
      if (edgeLabelConfigRaw === undefined) {
        existing.label = undefined
      } else if (existing.label) {
        const nextText =
          typeof edgeLabelConfigRaw === 'string' ? edgeLabelConfigRaw : edgeLabelConfigRaw.text
        existing.label.text = nextText
        if (typeof edgeLabelConfigRaw === 'object' && edgeLabelConfigRaw.editableText !== undefined) {
          existing.label.editableText = edgeLabelConfigRaw.editableText
        }
        existing.label.style = mergeEdgeLabelStyleFromDiagramStyle(
          existing.label.styleOverrides,
          ds
        )
      } else if (typeof edgeLabelConfigRaw === 'object') {
        existing.label = new TextLabel(edgeLabelConfigRaw)
      } else {
        existing.label = edgeLabelConfigRaw
        if (existing.label) {
          existing.label.style = mergeEdgeLabelStyleFromDiagramStyle(
            existing.label.styleOverrides,
            ds
          )
        }
      }
      const inset = ds?.labelInset
      if (existing.label && inset != null) {
        ;(existing.label as unknown as { inset?: unknown }).inset = inset
      }
      existing.lockAnchors = lockAnchorsEnabled.value
      ;(existing as unknown as { labelBackground?: Record<string, unknown> }).labelBackground =
        edgeLabelBackground
    } else {
      const newEdge = new Edge({
        id: papEdgeId,
        from: fromEndpoint,
        to: toEndpoint,
        type: edgeOpts.type ?? 'bezier',
        // Legacy 'single' only when style has no marker types; 'none' must not fall through
        // to Edge's default arrowType ('single') — that drew heads on note/diagram-only links.
        arrowType:
          ds?.startMarkerType != null || ds?.endMarkerType != null ? 'none' : 'single',
        style: edgeOpts.style,
        startMarker: edgeOpts.startMarker,
        endMarker: edgeOpts.endMarker,
        ...(edgeLabelText !== undefined ? { label: edgeLabelText } : {}),
        ...(edgeOpts.labelOffset != null ? { labelOffset: edgeOpts.labelOffset } : {}),
        ...(edgeOpts.labelPosition != null ? { labelPosition: edgeOpts.labelPosition } : {}),
        ...(edgeOpts.labelFollowPath ? { labelFollowPath: true } : {}),
        ...(edgeOpts.labelLineGap !== undefined ? { labelLineGap: edgeOpts.labelLineGap } : {}),
        ...(edgeLabelBackground ? { labelBackground: edgeLabelBackground } : {}),
        ...(controlPoints.length > 0 ? { controlPoints } : {}),
        lockAnchors: lockAnchorsEnabled.value,
      })
      if (newEdge.label) {
        newEdge.label.style = mergeEdgeLabelStyleFromDiagramStyle(
          newEdge.label.styleOverrides,
          ds
        )
        const newInset = ds?.labelInset
        if (newInset != null) {
          ;(newEdge.label as unknown as { inset?: unknown }).inset = newInset
        }
      }
      renderer.addEdge(newEdge)
    }
  }

  // Remove stale nodes and edges
  for (const [id] of renderer.nodes) {
    if (!currentNodeIds.has(id)) {
      renderer.removeNode(id)
      compositeOuterShapeKeyByPapId.delete(id)
    }
  }
  for (const [id] of renderer.edges) {
    if (!currentEdgeIds.has(id)) renderer.removeEdge(id)
  }

  reorderRendererNodesBySize(orderedInstances)
  syncEdgeAnchors({ persist: false, updateRenderer: true })
  syncedNodeNameByPapId.clear()
  for (const [papId, name] of nextSyncedNames) {
    syncedNodeNameByPapId.set(papId, name)
  }
  for (const papId of [...compositeOuterShapeKeyByPapId.keys()]) {
    if (!currentNodeIds.has(papId)) compositeOuterShapeKeyByPapId.delete(papId)
  }
  renderer.markDirty()
  updateSelection()
}

function collectHostEdgeMidpoints(): Map<string, { x: number; y: number }> {
  const midpoints = new Map<string, { x: number; y: number }>()
  if (!renderer) return midpoints
  for (const instance of instanceNodes.value) {
    if (!isEdgeAnchorInstance(instance)) continue
    const hostEdgeId = getHostEdgeInstanceId(instance)
    if (!hostEdgeId || midpoints.has(hostEdgeId)) continue
    const hostEdge = renderer.getEdge(`edge-${hostEdgeId}`)
    if (!hostEdge) continue
    const previousLabelPosition = hostEdge.labelPosition
    const previousLabelOffset = hostEdge.labelOffset
    hostEdge.labelPosition = 0.5
    hostEdge.labelOffset = 0
    const point = hostEdge.getLabelPosition()
    hostEdge.labelPosition = previousLabelPosition
    hostEdge.labelOffset = previousLabelOffset
    if (!point) continue
    midpoints.set(hostEdgeId, { x: point.x, y: point.y })
  }
  return midpoints
}

/**
 * Keep edge-anchor instances on the mid-point of their host edges.
 * @param persist write x/y back into diagram attrs (for dragend / history)
 * @param updateRenderer move papirus nodes immediately during live drag
 */
function syncEdgeAnchors(options: { persist: boolean; updateRenderer: boolean }): void {
  const diagram = props.activeDiagram
  if (!diagram || !renderer) return
  const midpoints = collectHostEdgeMidpoints()
  if (midpoints.size === 0) return

  if (options.updateRenderer) {
    // Junctions bind to host edges in Papirus — resync endpoints instead of moving fake nodes.
    renderer.markContentDirty()
  }

  if (options.persist) {
    const next = cloneDiagramAttrs()
    // cloneDiagramAttrs reads props that may still be pre-drag (parent has not flushed a
    // prior updateDiagram). Re-apply live renderer positions so edge-anchor persistence
    // cannot snap moved nodes back to their old coordinates.
    applyNodePositionsToDiagram(next, Array.from(nodeIdToInstance.keys()))
    const { nodes, changed } = syncEdgeAnchorPositions(next.instances.nodes, midpoints)
    if (changed) {
      next.instances.nodes = nodes
      syncEdgePortIds(next)
      emit('updateDiagram', next)
    }
  }
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
    const needsIdSync =
      targetPapIds.length !== currentIds.size || targetPapIds.some(id => !currentIds.has(id))
    // After node rebuild (e.g. composite content sync) selectedIds may still match,
    // but the new element starts in "normal" and needs selection state reapplied.
    const needsStateRepair = targetPapIds.some(id => {
      const el = renderer?.getNode(id) ?? renderer?.getEdge(id)
      return !!el && el.state !== 'selected'
    })
    if (needsIdSync || needsStateRepair) {
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
  if (renderer.blocksDiagramPointerAtScreen(event.clientX, event.clientY)) return

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

function handleCanvasDoubleClickOpenDirectory(event: MouseEvent) {
  if (!renderer || !props.activeDiagram) return
  if (renderer.blocksDiagramPointerAtScreen(event.clientX, event.clientY)) return
  const worldPoint = renderer.screenToWorld(event.clientX, event.clientY)
  const hitElement = renderer.getElementAtPoint(worldPoint)
  if (!(hitElement instanceof DiagramNode)) return
  const entity = nodeIdToInstance.get(hitElement.id)
  if (!entity) return
  const instance = instanceNodes.value.find(item => item.id === entity.instanceId)
  if (!instance || !isDirectoryNoteInstance(instance)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  emit('findInTree', entity.modelNodeId)
}

function getCompositeRoleNameText(node: CompositeNode): string | null {
  const visit = (value: unknown): string | null => {
    if (!value || typeof value !== 'object') return null
    const rec = value as Record<string, unknown>

    if (rec.type === 'text' && typeof rec.text === 'string' && rec.bindToProperty === BIND_TO_NAME) {
      return rec.text
    }

    const contentMatch = visit(rec.content)
    if (contentMatch) return contentMatch

    if (Array.isArray(rec.children)) {
      for (const child of rec.children) {
        const nested = visit(child)
        if (nested) return nested
      }
    }
    return null
  }

  return visit(node.content)
}

// ── Detect label changes from inline editing ──
function detectLabelChanges() {
  if (!renderer) return
  const next = cloneDiagramAttrs()
  let diagramOnlyLabelsChanged = false
  const pendingNodeNameChanges = new Map<string, string>()
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
        diagramOnlyLabelsChanged = true
      }
      continue
    }
    if (instance && isContainerInstance(instance)) {
      if (applyContainerInlineLabel(instance, labelText)) {
        diagramOnlyLabelsChanged = true
      }
      continue
    }
    if (papNode instanceof CompositeNode) {
      const compositeName = getCompositeRoleNameText(papNode)
      const modelNode = nodeById.value.get(entity.modelNodeId)
      const nextName = typeof compositeName === 'string' ? compositeName.trim() : ''
      const syncedName = syncedNodeNameByPapId.get(papNodeId)
      // Skip if canvas still shows the name we last synced — model may have been renamed in the tree.
      if (syncedName !== undefined && nextName === syncedName) continue
      if (
        modelNode &&
        !pendingNodeNameChanges.has(entity.modelNodeId) &&
        nextName.length > 0 &&
        nextName !== modelNode.name
      ) {
        pendingNodeNameChanges.set(entity.modelNodeId, nextName)
      }
      continue
    }
    const modelNode = nodeById.value.get(entity.modelNodeId)
    const nextName = labelText.trim()
    const syncedName = syncedNodeNameByPapId.get(papNodeId)
    // Skip if canvas still shows the name we last synced — model may have been renamed in the tree.
    if (syncedName !== undefined && nextName === syncedName) continue
    // Never push blank names — server batch-save rejects @NotBlank name.
    if (
      modelNode &&
      !pendingNodeNameChanges.has(entity.modelNodeId) &&
      nextName.length > 0 &&
      nextName !== modelNode.name
    ) {
      pendingNodeNameChanges.set(entity.modelNodeId, nextName)
    }
  }
  for (const [modelNodeId, name] of pendingNodeNameChanges) {
    emit('nodeLabelChange', modelNodeId, name)
    for (const [papId, entity] of nodeIdToInstance) {
      if (entity.modelNodeId === modelNodeId) {
        syncedNodeNameByPapId.set(papId, name)
      }
    }
  }
  if (diagramOnlyLabelsChanged) {
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

/**
 * Drop fixed outline attachments from live edges when "attach to outline" is turned off.
 * Stale outlineParam would otherwise win over ports on the next diagram sync.
 */
function clearOutlineParamsFromRendererEdges(): void {
  if (!renderer) return
  let cleared = false
  for (const [, edge] of renderer.edges) {
    if (isNodeEdgeEndpoint(edge.from) && edge.from.outlineParam !== undefined) {
      edge.from = {
        nodeId: edge.from.nodeId,
        ...(edge.from.portId ? { portId: edge.from.portId } : {}),
      }
      cleared = true
    }
    if (isNodeEdgeEndpoint(edge.to) && edge.to.outlineParam !== undefined) {
      edge.to = {
        nodeId: edge.to.nodeId,
        ...(edge.to.portId ? { portId: edge.to.portId } : {}),
      }
      cleared = true
    }
  }
  if (cleared) {
    detectEdgePortChanges()
  }
}

/**
 * Drop fixed side-port attachments when "lock link anchors" is turned off so ends can float
 * toward the opposite node. Also clears persisted fromPortId/toPortId via detectEdgePortChanges.
 */
function clearLockedPortsFromRendererEdges(): void {
  if (!renderer) return
  let cleared = false
  for (const [, edge] of renderer.edges) {
    if (isNodeEdgeEndpoint(edge.from) && edge.from.portId) {
      edge.from = {
        nodeId: edge.from.nodeId,
        ...(edge.from.outlineParam !== undefined
          ? { outlineParam: edge.from.outlineParam }
          : {}),
      }
      cleared = true
    }
    if (isNodeEdgeEndpoint(edge.to) && edge.to.portId) {
      edge.to = {
        nodeId: edge.to.nodeId,
        ...(edge.to.outlineParam !== undefined ? { outlineParam: edge.to.outlineParam } : {}),
      }
      cleared = true
    }
  }
  if (cleared) {
    detectEdgePortChanges()
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

    // Edge-attached ends keep the diagram instance id (anchor); only node ends remapped.
    const fromNodeId = papEdge.from.nodeId
    const toNodeId = papEdge.to.nodeId
    const nextFromInstanceId =
      fromNodeId && fromNodeId.startsWith('instance-')
        ? fromNodeId.slice('instance-'.length)
        : edgeInst.sourceInstanceId
    const nextToInstanceId =
      toNodeId && toNodeId.startsWith('instance-')
        ? toNodeId.slice('instance-'.length)
        : edgeInst.targetInstanceId
    const nextFromPortId = papEdge.from.portId ?? undefined
    const nextToPortId = papEdge.to.portId ?? undefined
    const nextFromOutline = papEdge.from.outlineParam
    const nextToOutline = papEdge.to.outlineParam
    const currentFromInstanceId = edgeInst.sourceInstanceId
    const currentToInstanceId = edgeInst.targetInstanceId
    const currentFromPortId = edgeInst.attrs?.fromPortId as string | undefined
    const currentToPortId = edgeInst.attrs?.toPortId as string | undefined
    const currentFromOutline = edgeInst.attrs?.fromOutlineParam as number | undefined
    const currentToOutline = edgeInst.attrs?.toOutlineParam as number | undefined

    if (nextFromInstanceId !== currentFromInstanceId) {
      edgeInst.sourceInstanceId = nextFromInstanceId
      changed = true
    }
    if (nextToInstanceId !== currentToInstanceId) {
      edgeInst.targetInstanceId = nextToInstanceId
      changed = true
    }

    const portMatch = nextFromPortId === currentFromPortId && nextToPortId === currentToPortId
    const outlineMatch =
      nextFromOutline === currentFromOutline && nextToOutline === currentToOutline
    if (portMatch && outlineMatch) continue

    // Always mirror renderer endpoint state (including clears). Gating by toolbar flags
    // left stale fromOutlineParam after attach-to-outline was turned off, so reconnect
    // to a port snapped back to the old outline point on the next sync.
    if (!edgeInst.attrs) edgeInst.attrs = {}
    if (nextFromPortId) edgeInst.attrs.fromPortId = nextFromPortId
    else delete edgeInst.attrs.fromPortId
    if (nextToPortId) edgeInst.attrs.toPortId = nextToPortId
    else delete edgeInst.attrs.toPortId
    if (nextFromOutline !== undefined) edgeInst.attrs.fromOutlineParam = nextFromOutline
    else delete edgeInst.attrs.fromOutlineParam
    if (nextToOutline !== undefined) edgeInst.attrs.toOutlineParam = nextToOutline
    else delete edgeInst.attrs.toOutlineParam

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
  const changed = applyEditablePolylineControlPointChangesToDiagramAttrs(
    next,
    edgeIdToInstance,
    papEdgeId => renderer?.getEdge(papEdgeId)
  )

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
  const changed = applyNodePositionsToDiagram(next, papNodeIds)
  if (changed) {
    syncEdgePortIds(next)
    emit('updateDiagram', next)
  }
}

/** Single updateDiagram for drag end: node positions + edge-anchor midpoints together. */
function persistDragEndState(papNodeIds: string[]) {
  if (props.readOnly || !renderer) return
  const next = cloneDiagramAttrs()
  const { nodeChanged, controlPointsChanged } = applyNodeAndEditablePolylineChangesToDiagramAttrs(
    next,
    papNodeIds,
    nodeIdToInstance,
    edgeIdToInstance,
    papNodeId => renderer?.getNode(papNodeId),
    papEdgeId => renderer?.getEdge(papEdgeId)
  )
  const midpoints = collectHostEdgeMidpoints()
  let anchorsChanged = false
  if (midpoints.size > 0) {
    const result = syncEdgeAnchorPositions(next.instances.nodes, midpoints)
    next.instances.nodes = result.nodes
    anchorsChanged = result.changed
    renderer.markContentDirty()
  }
  if (nodeChanged || controlPointsChanged || anchorsChanged) {
    syncEdgePortIds(next)
    emit('updateDiagram', next)
  }
}

function applyNodePositionsToDiagram(diagramAttrs: DiagramAttrs, papNodeIds: string[]): boolean {
  return applyNodePositionsToDiagramAttrs(
    diagramAttrs,
    papNodeIds,
    nodeIdToInstance,
    papNodeId => renderer?.getNode(papNodeId)
  )
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

function setupInteractionManager(
  manager: InteractionManager,
  currentRenderer: DiagramRenderer,
  navOnly: boolean
) {
  if (!navOnly) {
    manager.connection.setSnapToGrid(snapEnabled.value)
    manager.connection.setAttachToOutline(attachToOutlineEnabled.value)
    // Warchi persists connections via model state/events.
    // Disable papirus temporary connect history entries to avoid redo ghost edge replay.
    ;(manager.connection as unknown as { addEdge?: (edge: Edge) => void }).addEdge = (
      edge: Edge
    ) => {
      currentRenderer.addEdge(edge)
    }
  }
}

function bindInteractionEvents(manager: InteractionManager, currentRenderer: DiagramRenderer) {
  // Selection and other interaction events (only when not read-only)
  manager.selection.on('select', (elementIds: string[]) => {
    if (suppressSelectionEvent) return
    if (elementIds.length === 0) {
      emit('selectNodes', [])
      emit('selectInstanceIds', [])
      emit('selectLink', null)
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
  manager.drag.on('dragstart', (nodeIds: string[]) => {
    if (nodeIds.length === 1) {
      startGroupDrag(nodeIds[0]!)
      if (groupDragData) {
        const managerWithGroupDrag = manager as InteractionManager & {
          recordAdditionalDragStartPositions?: (ids: string[]) => void
        }
        managerWithGroupDrag.recordAdditionalDragStartPositions?.(groupDragData.followerIds)
      }
    } else {
      groupDragData = null
    }
  })

  // Drag move → keep followers and inner polyline bends aligned with the leader
  manager.drag.on('drag', () => {
    syncGroupDragFromLeader()
    syncEdgeAnchors({ persist: false, updateRenderer: true })
  })

  // Drag end → persist position changes (include grouped nodes) + auto-link
  manager.drag.on('dragend', (_nodeIds: string[]) => {
    if (props.readOnly) return
    const allIds = endGroupDrag()
    const papNodeIds = allIds.length > 0 ? allIds : _nodeIds
    persistDragEndState(papNodeIds)
    // Try auto-create link if dragged node is inside container with group relation
    if (_nodeIds.length === 1) {
      tryCreateAutoLink(_nodeIds[0]!)
    }
  })

  // Resize end → persist size changes
  manager.resize.on('resizeEnd', (nodeId: string) => {
    if (props.readOnly) return
    persistNodePositions([nodeId])
  })

  // Connection validator: translate papirus node IDs to model node IDs and delegate
  manager.connection.connectionValidator = (
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
  manager.history.on('change', () => {
    if (props.readOnly) return
    canUndo.value = manager.history.canUndo
    canRedo.value = manager.history.canRedo
    // Keep model state in sync with renderer commands (undo/redo drag, resize, etc.)
    persistNodePositions(Array.from(nodeIdToInstance.keys()))
    detectEdgePortChanges()
    detectEditablePolylineControlPointChanges()
    detectLabelChanges()
    detectEdgeLabelChanges()
    syncEdgeAnchors({ persist: true, updateRenderer: true })
  })

  // Connection → emit connectNodes / connectNodeToEdge
  manager.connection.on('connect', (edge: Edge) => {
    const fromId = edge.from.nodeId
    const toId = edge.to.nodeId
    const toHostEdgeId = edge.to.edgeId
    const fromHostEdgeId = edge.from.edgeId

    if (fromId && toHostEdgeId) {
      const sourceEntity = nodeIdToInstance.get(fromId)
      const hostEntity = edgeIdToInstance.get(toHostEdgeId)
      if (sourceEntity && hostEntity) {
        emit(
          'connectNodeToEdge',
          sourceEntity.modelNodeId,
          sourceEntity.instanceId,
          hostEntity.edgeId,
          edge.to.pathParam ?? 0.5,
          true,
          edge.from.portId ?? undefined,
          edge.from.outlineParam
        )
      }
      currentRenderer.removeEdge(edge.id)
      return
    }

    if (fromHostEdgeId && toId) {
      const targetEntity = nodeIdToInstance.get(toId)
      const hostEntity = edgeIdToInstance.get(fromHostEdgeId)
      if (targetEntity && hostEntity) {
        emit(
          'connectNodeToEdge',
          targetEntity.modelNodeId,
          targetEntity.instanceId,
          hostEntity.edgeId,
          edge.from.pathParam ?? 0.5,
          false,
          edge.to.portId ?? undefined,
          edge.to.outlineParam
        )
      }
      currentRenderer.removeEdge(edge.id)
      return
    }

    if (!fromId || !toId) {
      currentRenderer.removeEdge(edge.id)
      return
    }
    const sourceEntity = nodeIdToInstance.get(fromId)
    const targetEntity = nodeIdToInstance.get(toId)
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
    currentRenderer.removeEdge(edge.id)
  })

  manager.connection.on('edgeReconnect', (edge: Edge, endpoint: 'start' | 'end') => {
    const entity = edgeIdToInstance.get(edge.id)
    if (!entity) return

    const newPapNodeId = endpoint === 'start' ? edge.from.nodeId : edge.to.nodeId
    if (!newPapNodeId) return
    const newInstanceId = newPapNodeId.startsWith('instance-')
      ? newPapNodeId.slice('instance-'.length)
      : null
    if (!newInstanceId) return

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
      syncEdgeAnchors({ persist: true, updateRenderer: true })
    })
  })

  const onPointerMoveDuringControlPointDrag = (): void => {
    syncEdgeAnchors({ persist: false, updateRenderer: true })
  }
  manager.connection.on('controlPointDragStart', () => {
    window.addEventListener('pointermove', onPointerMoveDuringControlPointDrag)
  })
  manager.connection.on('controlPointDragEnd', () => {
    window.removeEventListener('pointermove', onPointerMoveDuringControlPointDrag)
    syncEdgeAnchors({ persist: true, updateRenderer: true })
  })

  if (props.diagramLiveBroadcastEnabled) {
    const block = (): void => {
      emit('liveCollaborationGesture', 'block')
    }
    const unblock = (): void => {
      emit('liveCollaborationGesture', 'unblock')
    }
    manager.drag.on('dragstart', block)
    manager.drag.on('dragend', unblock)
    manager.resize.on('resizeStart', block)
    manager.resize.on('resizeEnd', unblock)
    manager.connection.on('connectionStart', block)
    manager.connection.on('connectionEnd', unblock)
    manager.connection.on('edgeReconnectStart', block)
    manager.connection.on('edgeReconnect', unblock)
    manager.connection.on('controlPointDragStart', block)
    manager.connection.on('controlPointDragEnd', unblock)
  }
}

// ── Renderer init ──
function initRenderer(
  r: DiagramRenderer,
  manager: InteractionManager,
  overlays: {
    gridOverlay: GridOverlay | null
    miniMap: MiniMap | null
    rulersOverlay: RulersOverlay | null
  }
) {
  renderer = r
  interactionManager = manager
  gridOverlay = overlays.gridOverlay
  miniMap = overlays.miniMap
  rulersOverlay = overlays.rulersOverlay
  gridOverlay?.setEnabled(gridVisible.value)
  miniMap?.setEnabled(miniMapVisible.value)
  rulersOverlay?.setEnabled(rulersEnabled.value)
  lastActiveDiagramId = props.activeDiagram?.id ?? null
  r.getCanvas().addEventListener('click', handleCanvasClickPrioritizeEdge)
  r.getCanvas().addEventListener('dblclick', handleCanvasDoubleClickOpenDirectory, true)
  window.addEventListener('mouseup', handleCanvasMouseUpSyncEditablePolyline)

  // Always enable interactions: when readOnly or navigationOnlyMode use navigationOnly (zoom/pan only, no edit)
  const navOnly = props.readOnly || props.navigationOnlyMode
  setupInteractionManager(manager, r, navOnly)
  bindInteractionEvents(manager, r)
  r.on('zoom', () => {
    viewportRev.value += 1
    const diagramId = props.activeDiagram?.id
    if (!diagramId) return
    safePersistViewport(diagramId, r)
  })
  r.on('pan', () => {
    viewportRev.value += 1
    const diagramId = props.activeDiagram?.id
    if (!diagramId) return
    safePersistViewport(diagramId, r)
  })

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

  emit('canvasContextChange', { renderer: r, interactionManager: manager })

  ;(r as { on(event: 'nodeBadgeClick', cb: (nodeId: string, badgeId: string) => void): void }).on(
    'nodeBadgeClick',
    (papNodeId: string, badgeId: string) => {
    const entity = nodeIdToInstance.get(papNodeId)
    if (!entity) return
    const node = nodeById.value.get(entity.modelNodeId)
    const notationId = activeNotationId.value
    if (!node || !notationId) return
    const componentId = getComponentIdForInstance(entity.modelNodeId, entity.instanceId)
    if (!componentId) return
    const component = props.components.find(c => c.id === componentId)
    if (!component) return
    const customProperties = parseEntityAttrs(component.attrs ?? null).customProperties
    const prop = customProperties.find(p => p.id === badgeId)
    if (!prop || !prop.interactive) return
    const scopedValues = getNodeScopedPropertyValues(entity.modelNodeId, entity.instanceId)
    const value = scopedValues[prop.id] ?? scopedValues[prop.name]
    if (value === undefined || value === null) return
    const kind: InteractiveKind = prop.interactiveKind ?? 'url'
    if (kind === 'url') {
      window.open(String(value), '_blank')
    } else if (kind === 'diagram') {
      emit('openDiagram', String(value))
    } else if (kind === 'document') {
      emit('openDocument', String(value))
    }
  }
  )

  if (manager) {
  // Context menu only when editable (not read-only baseline view)
  if (!props.readOnly) {
  r.enableContextMenu({
    iconToUrl: (name: string) => `/icons/${name}.svg`,
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
        if (instance && isContainerInstance(instance)) {
          return [
            {
              label: t('diagram.deleteContainer'),
              icon: 'delete',
              action: () => emit('requestDeleteNodeFromDiagram', entity.instanceId),
            },
          ]
        }
        if (instance && isEdgeAnchorInstance(instance)) {
          return []
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
            icon: 'cable',
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
  void ensureNodeShapeScaleSliceCatalog().then((ok) => {
    if (!ok || renderer !== r) return
    // Re-apply custom path factories once catalog scaleSlice attrs are available.
    syncDiagram()
  })
  if (lastActiveDiagramId) {
    safeRestoreViewport(lastActiveDiagramId, r)
  }
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

const layoutBusy = ref(false)

const resolveSelectedInstanceIds = (): string[] => {
  const ids = new Set<string>()
  const selectedPap = interactionManager?.selection.selectedIds
  if (selectedPap && selectedPap.size > 0) {
    for (const papId of selectedPap) {
      const entity = nodeIdToInstance.get(papId)
      if (entity) ids.add(entity.instanceId)
    }
    return [...ids]
  }
  const selectedModel = new Set(props.selectedModelNodeIds)
  for (const inst of instanceNodes.value) {
    if (selectedModel.has(inst.modelNodeId)) ids.add(inst.id)
  }
  return [...ids]
}

const runAutoLayout = async (mode: 'layered' | 'overlap') => {
  if (!props.activeDiagram || props.readOnly || layoutBusy.value) return
  layoutBusy.value = true
  emit('layoutBusy', true)
  try {
    const before = cloneDiagramAttrs()
    const result = await runDiagramLayout({
      diagram: before,
      mode,
      selectedInstanceIds: resolveSelectedInstanceIds(),
    })
    if (result.status === 'error') {
      emit('layoutError', result.message)
      return
    }
    if (result.status === 'noop') return

    const after = result.diagram
    const history = interactionManager?.history
    if (history && typeof history.execute === 'function') {
      history.execute({
        execute: () => {
          emit('updateDiagram', after)
        },
        undo: () => {
          emit('updateDiagram', before)
        },
      })
    } else {
      emit('updateDiagram', after)
    }
    requestAnimationFrame(() => fitToView())
  } finally {
    layoutBusy.value = false
    emit('layoutBusy', false)
  }
}

const autoLayoutNodes = () => {
  void runAutoLayout('layered')
}

const autoLayoutTidy = () => {
  void runAutoLayout('overlap')
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
    if (!lockAnchorsEnabled.value) {
      clearLockedPortsFromRendererEdges()
    }
    renderer.markDirty()
  }
  return lockAnchorsEnabled.value
}

const getLockAnchorsEnabled = () => lockAnchorsEnabled.value

// ── Drop handling ──
const canDropModelNodeToDiagram = (modelNodeId: string): boolean => {
  const node = props.nodes.find(item => item.id === modelNodeId && !item._isDeleted)
  if (!node) return false
  const nodeType = props.nodeTypes.find(item => item.id === node.nodeTypeId)
  if ((nodeType?.name ?? '').trim().toLowerCase() === 'directory') {
    return true
  }

  const notationId = activeNotationId.value
  if (!notationId) return false

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
  const modelLinkId = event.dataTransfer?.getData('application/x-warchi-model-link-id')
  if (modelLinkId) return true
  const componentId = event.dataTransfer?.getData('application/x-notation-component-id')
  if (componentId) return true
  const notePayload = event.dataTransfer?.getData('application/x-model-diagram-note')
  if (notePayload === 'note') return true
  const containerPayload = event.dataTransfer?.getData('application/x-model-diagram-container')
  if (containerPayload === 'container') return true
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
  if (props.readOnly || props.navigationOnlyMode) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
    return
  }

  const hasComponentPayload = hasDragType(event, 'application/x-notation-component-id')
  const hasModelNodePayload = hasDragType(event, 'application/x-model-node-id')
  const hasNotePayload = hasDragType(event, 'application/x-model-diagram-note')
  const hasContainerPayload = hasDragType(event, 'application/x-model-diagram-container')
  const hasModelLinkPayload = hasDragType(event, 'application/x-warchi-model-link-id')
  if (
    !hasComponentPayload &&
    !hasModelNodePayload &&
    !hasNotePayload &&
    !hasContainerPayload &&
    !hasModelLinkPayload
  ) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
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

  if (event.dataTransfer) {
    // Adding existing model entities via DnD creates/reuses data instead of moving DOM elements.
    event.dataTransfer.dropEffect = 'copy'
  }
  event.preventDefault()
}

const onDrop = (event: DragEvent) => {
  if (props.readOnly || props.navigationOnlyMode || !props.activeDiagram) return
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

  const containerPayload = event.dataTransfer?.getData('application/x-model-diagram-container')
  if (containerPayload === 'container') {
    emit('createContainer', x, y)
    return
  }

  const modelNodeId = event.dataTransfer?.getData('application/x-model-node-id')
  if (modelNodeId) {
    emit('addExistingNode', modelNodeId, x, y)
    return
  }

  const modelLinkId = event.dataTransfer?.getData('application/x-warchi-model-link-id')
  if (modelLinkId) {
    emit('placeExistingModelLink', modelLinkId)
  }
}

const onDragComponentStart = (event: DragEvent, componentId: string) => {
  event.dataTransfer?.setData('application/x-notation-component-id', componentId)
  event.dataTransfer?.setData('text/plain', `component:${componentId}`)
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 10, 10)
}

const onDragNoteStart = (event: DragEvent) => {
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer?.setData('application/x-model-diagram-note', 'note')
  event.dataTransfer?.setData('text/plain', 'note')
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 10, 10)
}

const onDragContainerStart = (event: DragEvent) => {
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer?.setData('application/x-model-diagram-container', 'container')
  event.dataTransfer?.setData('text/plain', 'container')
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
      const compositeIconName = resolveCompositeBoundIconName(parsedAttrs.diagramStyle?.compositeContent)
      const hasSvgIcon = (iconName && iconName.length > 0) || !!compositeIconName
      const resolvedIconName = iconName || compositeIconName
      const paletteIconId = hasSvgIcon
        ? undefined
        : (parsedAttrs.paletteMaterialIcon?.trim() || undefined)
      return {
        ...component,
        paletteIconName: hasSvgIcon ? resolvedIconName! : paletteIconId ?? 'component',
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
function cleanupRendererBeforeDestroy(currentRenderer: DiagramRenderer) {
  if (lastActiveDiagramId) {
    safePersistViewport(lastActiveDiagramId, currentRenderer)
    flushViewport(lastActiveDiagramId)
  }
  currentRenderer.getCanvas().removeEventListener('click', handleCanvasClickPrioritizeEdge)
  currentRenderer.getCanvas().removeEventListener('dblclick', handleCanvasDoubleClickOpenDirectory, true)
  window.removeEventListener('mouseup', handleCanvasMouseUpSyncEditablePolyline)
  renderer = null
  interactionManager = null
  emit('canvasContextChange', { renderer: null, interactionManager: null })
  gridOverlay = null
  miniMap = null
  rulersOverlay = null
  nodeIdToInstance.clear()
  edgeIdToInstance.clear()
}

useDiagramRenderer({
  canvasRef,
  containerRef,
  backgroundColor: () =>
    getComputedStyle(document.documentElement).getPropertyValue('--base-bg').trim() || '#f4f2ef',
  rendererOptions: {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    scrollbarOverlay: true,
  },
  overlays: {
    grid: { options: { gridSize: 24, color: '#e2e8f0' } },
    rulers: { options: { enabled: rulersEnabled.value } },
    miniMap: {
      options: {
        enabled: miniMapVisible.value,
        width: 120,
        height: 60,
        padding: 20,
        contentMargin: 200,
        anchor: 'bottom-left',
      },
    },
  },
  interactions: {
    snapToGrid: snapEnabled.value,
    gridSize: GRID_SIZE,
    alignToNodes: alignEnabled.value,
    alignmentScreenTolerance: 40,
    previewPathType: 'straight',
    attachToOutline: attachToOutlineEnabled.value,
    keymap: { deleteKeys: [] },
    navigationOnly: props.readOnly || props.navigationOnlyMode,
  } as Parameters<DiagramRenderer['enableInteractions']>[0],
  onReady: ({ renderer: readyRenderer, interactionManager: readyInteractionManager, ...overlays }) => {
    if (!readyInteractionManager) return
    initRenderer(readyRenderer, readyInteractionManager, overlays)
  },
  onBeforeDestroy: cleanupRendererBeforeDestroy,
})

// Watch for data changes
watch([instanceNodes, instanceEdges], () => syncDiagram(), { deep: true })
watch(
  () => props.remoteEditorPointer,
  () => {
    viewportRev.value += 1
  },
  { deep: true }
)
watch(
  () => [props.diffStateByModelNodeId, props.diffStateByModelLinkId, props.diffStateByEdgeInstanceId],
  () => syncDiagram(),
  { deep: true }
)
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
    if (renderer && prevId) {
      safePersistViewport(prevId, renderer)
      flushViewport(prevId)
    }
    if (renderer && nextId) {
      safeRestoreViewport(nextId, renderer)
    }
    lastActiveDiagramId = nextId
    if (nextId !== prevId) resetHistory()
  }
)

// Re-apply interactions when navigation-only mode or readOnly changes (Papirus does not support changing navigationOnly at runtime)
watch(
  () => [props.readOnly, props.navigationOnlyMode, props.diagramLiveBroadcastEnabled],
  () => {
    if (!renderer) return
    const navOnly = props.readOnly || props.navigationOnlyMode
    renderer.disableInteractions()
    interactionManager = renderer.enableInteractions({
      snapToGrid: snapEnabled.value,
      gridSize: GRID_SIZE,
      alignToNodes: alignEnabled.value,
      alignmentScreenTolerance: 40,
      previewPathType: 'straight',
      attachToOutline: attachToOutlineEnabled.value,
      keymap: { deleteKeys: [] },
      navigationOnly: navOnly,
    } as Parameters<DiagramRenderer['enableInteractions']>[0])
    setupInteractionManager(interactionManager, renderer, navOnly)
    bindInteractionEvents(interactionManager, renderer)
    emit('canvasContextChange', { renderer, interactionManager })
    syncDiagram()
    renderer.markDirty()
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
    if (!next) {
      clearLockedPortsFromRendererEdges()
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
    if (!next) {
      clearOutlineParamsFromRendererEdges()
    }
    renderer?.markDirty()
  }
)

defineExpose({
  zoomIn,
  zoomOut,
  fitToView,
  zoomToSelection,
  autoLayoutNodes,
  autoLayoutTidy,
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
    @mousemove="onContainerPointerMove"
    @mouseleave="onContainerPointerLeave"
  >
    <canvas
      ref="canvasRef"
      class="diagram-canvas__canvas"
      :class="{ 'diagram-canvas__canvas--hidden': !activeDiagram }"
    />

    <div
      v-if="remotePointerScreen && activeDiagram"
      class="diagram-canvas__remote-pointer"
      :style="remotePointerScreen"
      aria-hidden="true"
    />

    <div v-if="!activeDiagram" class="diagram-canvas__placeholder">
      <UiIcon name="draw" class="diagram-canvas__placeholder-icon" />
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
          <UiIcon name="palette" />
        </button>

        <div v-if="paletteVisible" class="canvas-palette">
        <div class="canvas-palette__header">
          <UiIcon name="palette" />
          <span>{{ t('diagram.palette') }}</span>
          <button
            type="button"
            class="canvas-palette__hide"
            :title="t('diagram.hidePalette')"
            @click="setPaletteVisible(false)"
          >
            <UiIcon name="chevron_right" />
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
            :draggable="!props.readOnly && !props.navigationOnlyMode"
            @dragstart="onDragNoteStart"
          >
            <UiIcon name="note" class="canvas-palette__note-icon" />
          </button>
          <button
            type="button"
            class="canvas-palette__item canvas-palette__item--container"
            :title="t('diagram.container')"
            :draggable="!props.readOnly && !props.navigationOnlyMode"
            @dragstart="onDragContainerStart"
          >
            <UiIcon name="crop_free" class="canvas-palette__note-icon" />
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
              :draggable="!props.readOnly && !props.navigationOnlyMode"
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

.diagram-canvas__remote-pointer {
  position: absolute;
  width: 14px;
  height: 14px;
  margin-left: -7px;
  margin-top: -7px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  z-index: 20;
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
  width: 48px;
  height: 48px;
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

.canvas-palette__header .ui-icon {
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

.canvas-palette__hide .ui-icon {
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

.canvas-palette__item--container {
  --palette-item-fill: transparent;
  border: 1px dashed #8a8a8a;
}

.canvas-palette__item--container .canvas-palette__note-icon {
  color: #5c5c5c;
}

.canvas-palette__note-icon {
  width: 18px;
  height: 18px;
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
