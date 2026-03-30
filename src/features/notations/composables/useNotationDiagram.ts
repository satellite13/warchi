import { shallowRef, watch, type Ref } from "vue"
import {
  DiagramRenderer,
  RectangleNode,
  CircleNode,
  DiamondNode,
  CustomShapeNode,
  CompositeNode,
  deserializeCComponent,
  Node as DiagramNode,
  Edge,
  AutoLayout,
  GridOverlay,
  MiniMap,
  RulersOverlay,
  NavigationManager,
  SelectionManager,
  InteractionManager,
  TextLabel,
  type ElementState,
  type EdgeStyle as PapirusEdgeStyle,
  type CContainer,
} from "@ngroznykh/papirus"
import { diagramShapeFactories } from "@/utils/diagramShapes"
import {
  customOutlineToPath2D,
  customOutlineToSvgPath
} from "@/utils/customOutlinePath"
import type { CustomProperty, DiagramStyle } from "../notationAttrs"
import type {
  NotationEditorState,
  EditorComponent,
} from "../types"
import {
  useNotationStyles,
  COMPONENT_STYLE,
  type RelationEdgeStyle,
} from "./useNotationStyles"
import {
  resolveComponentAnchorPoints,
  buildNodeLabel,
  buildEdgeLabel,
  buildEdgeLabelBackground,
  buildNodeIcon,
  buildMarker,
} from "../utils/notationElementBuilders"
import {
  applyStylePropertyBindings,
  createDefaultCompositeContent,
  injectCompositeNameAndIcon,
} from "../utils/compositeBindings"

export type EntityKind = "component" | "relation"

export interface NotationDiagramOptions {
  state: Ref<NotationEditorState>
  selectedId: Ref<string | null>
  onSelect: (id: string | null, kind: EntityKind | null) => void
}


const ANCHOR_STYLE = {
  fillColor: "transparent",
  strokeColor: "transparent",
  strokeWidth: 0
}
const SOFT_SELECTION_COLOR = "#6366f1"
const SOFT_SELECTION_OFFSET_PX = 3

const ANCHOR_SIZE = 10
const ANCHOR_GAP = 120
const COLUMN_GAP = 60
const ROW_GAP = 30
const GRID_SIZE = 20
const NO_ANCHORS = { top: 0, right: 0, bottom: 0, left: 0 }

type AnchorRelationMeta = {
  pairedTarget: CircleNode
  relationId: string
  relationName: string
  edgeStyle: RelationEdgeStyle
  diagramStyle?: DiagramStyle
}

type NodeWithLabelPlacement = DiagramNode & { labelPlacement?: string }
type InsetSides = { top?: number; right?: number; bottom?: number; left?: number }
type TextLabelWithSpacing = TextLabel & {
  inset?: number | InsetSides
  padding?: number
  margin?: number
}

function setNodeLabelPlacement(node: DiagramNode, placement: string | undefined): void {
  if (!placement) return
  ;(node as NodeWithLabelPlacement).labelPlacement = placement
}

function setTextLabelSpacing(
  label: TextLabel | undefined,
  options: { inset?: number | InsetSides; padding?: number; margin?: number }
): void {
  if (!label) return
  const withSpacing = label as TextLabelWithSpacing
  if (options.inset != null) withSpacing.inset = options.inset
  if (options.padding != null) withSpacing.padding = options.padding
  if (options.margin != null) withSpacing.margin = options.margin
}


type ComponentShape =
  | "rectangle"
  | "beveled-rectangle"
  | "diamond"
  | "circle"
  | "trapezoid"
  | "slanted-rectangle"
  | "custom"
  | "composite"

function disableTransformerFrame(node: DiagramNode) {
  node.resizeHandlesEnabled = false
}

function getComponentShape(ds?: DiagramStyle): ComponentShape {
  const shape = ds?.nodeShape as ComponentShape | undefined
  switch (shape) {
    case "beveled-rectangle":
    case "diamond":
    case "circle":
    case "trapezoid":
    case "slanted-rectangle":
    case "custom":
    case "composite":
      return shape
    default:
      return "rectangle"
  }
}

function isCustomShapeNode(node: DiagramNode): node is CustomShapeNode {
  return node instanceof CustomShapeNode
}

function getNodeShapeFromNode(node: DiagramNode): ComponentShape {
  if (node instanceof CompositeNode) return "composite"
  if (node instanceof DiamondNode) return "diamond"
  if (node instanceof CircleNode) return "circle"
  if (isCustomShapeNode(node)) return (node.shapeType as ComponentShape) ?? "rectangle"
  return "rectangle"
}

function normalizeTagForSort(value: string): string {
  return value.trim().toLowerCase()
}

function getComponentTagsSortKey(component: EditorComponent): string {
  const tags = (component.parsedAttrs.tags ?? [])
    .map(normalizeTagForSort)
    .filter((tag) => tag.length > 0)
    .sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }))
  return tags.join("|")
}

function compareComponentsForLayout(a: EditorComponent, b: EditorComponent): number {
  const tagsDiff = getComponentTagsSortKey(a).localeCompare(getComponentTagsSortKey(b), "ru", {
    sensitivity: "base"
  })
  if (tagsDiff !== 0) return tagsDiff

  const nameDiff = a.name.localeCompare(b.name, "ru", { sensitivity: "base" })
  if (nameDiff !== 0) return nameDiff

  return a.id.localeCompare(b.id, "ru", { sensitivity: "base" })
}

export function useNotationDiagram(options: NotationDiagramOptions) {
  const { state, selectedId, onSelect } = options

  const rendererRef = shallowRef<DiagramRenderer | null>(null)
  const interactionManagerRef = shallowRef<InteractionManager | null>(null)
  const selectionManagerRef = shallowRef<SelectionManager | null>(null)
  const navigationManagerRef = shallowRef<NavigationManager | null>(null)
  const gridOverlayRef = shallowRef<GridOverlay | null>(null)
  const miniMapRef = shallowRef<MiniMap | null>(null)
  const rulersOverlayRef = shallowRef<RulersOverlay | null>(null)
  const nodeIdToEntity = new Map<string, { id: string; kind: EntityKind }>()
  const edgeIdToEntity = new Map<string, { id: string; kind: EntityKind }>()
  let cleanupSelectionOutlineOverlay: (() => void) | null = null
  let syncingRelationSelection = false
  let syncingSelectionFromState = false

  const {
    resolveComponentStyle,
    resolveRelationStyle,
  } = useNotationStyles(state)

  function typeCustomPropertiesForComponent(component: EditorComponent): CustomProperty[] {
    const nt = state.value.nodeTypes.find((n) => n.id === component.nodeTypeId)
    if (!nt) return []
    return (nt.parsedAttrs.customProperties ?? []).filter((p) => !p.system)
  }

  function createComponentNode(
    item: EditorComponent,
    x: number,
    y: number
  ): DiagramNode {
    const visual = resolveComponentStyle(item)
    const ds = item.parsedAttrs.diagramStyle
    const shape = getComponentShape(ds)
    const commonBase = {
      id: `component-${item.id}`,
      x,
      y,
      width: visual.width,
      height: visual.height,
      style: visual.style,
      anchorPoints: resolveComponentAnchorPoints(ds),
      contentInset: (ds?.contentInset ?? 0) as unknown as number,
    }
    const commonOptions = {
      ...commonBase,
      label: buildNodeLabel(
        item.name,
        ds,
        item.parsedAttrs.customProperties.filter((p) => !p.system),
        typeCustomPropertiesForComponent(item),
      ),
      ...(buildNodeIcon(ds) ? { icon: buildNodeIcon(ds) } : {})
    }
    const beveledFactory = diagramShapeFactories["beveled-rectangle"]
    const trapezoidFactory = diagramShapeFactories["trapezoid"]
    const slantedFactory = diagramShapeFactories["slanted-rectangle"]

    let node: DiagramNode
    if (shape === "composite") {
      const componentProperties = item.parsedAttrs.customProperties.filter((p) => !p.system)
      const nodeTypeProperties = typeCustomPropertiesForComponent(item)
      const componentValues = Object.fromEntries(
        componentProperties.map((p) => [p.name, p.defaultValue])
      )
      const nodeTypeValues = Object.fromEntries(nodeTypeProperties.map((p) => [p.name, p.defaultValue]))
      const baseContent = ds?.compositeContent ?? createDefaultCompositeContent(item.name)
      const contentWithNameAndIcon = injectCompositeNameAndIcon(baseContent, {
        displayName: item.name,
        notationIconName: ds?.iconName,
      })
      const bindingResult = applyStylePropertyBindings(ds, contentWithNameAndIcon, {
        componentProperties,
        componentValues,
        nodeTypeProperties,
        nodeTypeValues,
      })
      const compositeStyle = {
        ...visual.style,
        ...bindingResult.outerPatch,
        ...(ds?.fillOpacity != null ? { fillOpacity: ds.fillOpacity } : {}),
        ...(ds?.strokeOpacity != null ? { strokeOpacity: ds.strokeOpacity } : {}),
        ...(ds?.opacity != null ? { opacity: ds.opacity } : {}),
        ...(ds?.lineDash ? { lineDash: ds.lineDash } : {}),
      }
      const rawCompositeShape = ds?.compositeShapeType ?? "rectangle"
      const compositeShapeMappedToCustom =
        rawCompositeShape === "beveled-rectangle" ||
        rawCompositeShape === "trapezoid" ||
        rawCompositeShape === "slanted-rectangle"
      const compositePathFactory = compositeShapeMappedToCustom
        ? diagramShapeFactories[rawCompositeShape]?.path
        : undefined
      node = new CompositeNode({
        ...commonBase,
        style: compositeStyle,
        shapeType: compositeShapeMappedToCustom ? "custom" : (rawCompositeShape as "rectangle" | "circle" | "diamond" | "custom"),
        cornerRadius: visual.cornerRadius,
        autoSize: ds?.compositeAutoSize ?? false,
        minWidth: ds?.compositeMinWidth ?? 0,
        minHeight: ds?.compositeMinHeight ?? 0,
        content: deserializeCComponent(bindingResult.content) as unknown as CContainer,
        ...(compositePathFactory ? { pathFactory: compositePathFactory } : {}),
      })
    } else if (shape === "diamond") {
      node = new DiamondNode(commonOptions)
    } else if (shape === "circle") {
      node = new CircleNode(commonOptions)
    } else if (shape === "beveled-rectangle") {
      node = new CustomShapeNode({
        ...commonOptions,
        path: beveledFactory.path,
        svgPath: beveledFactory.svgPath
      })
    } else if (shape === "trapezoid") {
      node = new CustomShapeNode({
        ...commonOptions,
        path: trapezoidFactory.path,
        svgPath: trapezoidFactory.svgPath
      })
    } else if (shape === "slanted-rectangle") {
      node = new CustomShapeNode({
        ...commonOptions,
        path: slantedFactory.path,
        svgPath: slantedFactory.svgPath
      })
    } else if (shape === "custom" && ds?.customOutline?.length) {
      const segments = ds.customOutline
      node = new CustomShapeNode({
        ...commonOptions,
        path: (w, h) => customOutlineToPath2D(segments, w, h),
        svgPath: (w, h) => customOutlineToSvgPath(segments, w, h)
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
    setNodeLabelPlacement(node, ds?.labelPlacement)
    disableTransformerFrame(node)
    return node
  }

  function createDiagramLayerNode(nodeId: string, layerNode: { x: number; y: number; width: number; height: number; attrs?: Record<string, unknown> }): DiagramNode {
    const layerStyle = (layerNode.attrs?.style as Record<string, unknown> | undefined) ?? {}
    return new RectangleNode({
      id: nodeId,
      x: layerNode.x,
      y: layerNode.y,
      width: layerNode.width,
      height: layerNode.height,
      label: typeof layerNode.attrs?.label === "string" ? layerNode.attrs.label : "",
      style: {
        fillColor: typeof layerStyle.fillColor === "string" ? layerStyle.fillColor : "#fff8d6",
        strokeColor: typeof layerStyle.strokeColor === "string" ? layerStyle.strokeColor : "#d4b85f",
        strokeWidth: typeof layerStyle.strokeWidth === "number" ? layerStyle.strokeWidth : 1,
        lineDash: [6, 4],
      },
      anchorPoints: NO_ANCHORS,
    })
  }

  function syncNodes(renderer: DiagramRenderer) {
    const currentNodeIds = new Set<string>()
    const currentEdgeIds = new Set<string>()
    nodeIdToEntity.clear()
    edgeIdToEntity.clear()

    const componentNodes: DiagramNode[] = []

    // Filter out deleted items
    const activeComponents = state.value.components.filter((c) => !c._isDeleted)
    const activeComponentsSorted = [...activeComponents].sort(compareComponentsForLayout)
    const activeRelations = state.value.relations.filter((r) => !r._isDeleted)

    // --- Components as rectangle nodes ---
    for (const component of activeComponents) {
      const nodeId = `component-${component.id}`
      currentNodeIds.add(nodeId)
      nodeIdToEntity.set(nodeId, { id: component.id, kind: "component" })

      const existing = renderer.getNode(nodeId)
      if (existing) {
        const ds = component.parsedAttrs.diagramStyle
        const expectedShape = getComponentShape(ds)
        const existingShape = getNodeShapeFromNode(existing)
        if (expectedShape !== existingShape) {
          const replacement = createComponentNode(component, existing.x, existing.y)
          renderer.removeNode(nodeId)
          renderer.addNode(replacement)
          continue
        }
        if (expectedShape === "composite") {
          const replacement = createComponentNode(component, existing.x, existing.y)
          renderer.removeNode(nodeId)
          renderer.addNode(replacement)
          continue
        }
        const visual = resolveComponentStyle(component)
        disableTransformerFrame(existing)
        // Update label using template if available
        const newLabel = buildNodeLabel(
          component.name,
          ds,
          component.parsedAttrs.customProperties.filter((p) => !p.system),
          typeCustomPropertiesForComponent(component),
        )
        if (typeof newLabel === "string") {
          existing.label = newLabel
        } else {
          existing.label = new TextLabel(newLabel)
        }
        existing.width = visual.width
        existing.height = visual.height
        existing.anchorPoints = resolveComponentAnchorPoints(ds)
        existing.style = {
          ...visual.style,
          ...(ds?.fillOpacity != null ? { fillOpacity: ds.fillOpacity } : {}),
          ...(ds?.strokeOpacity != null ? { strokeOpacity: ds.strokeOpacity } : {}),
          ...(ds?.opacity != null ? { opacity: ds.opacity } : {}),
          ...(ds?.lineDash ? { lineDash: ds.lineDash } : {})
        }
        if (existing instanceof RectangleNode) {
          existing.cornerRadius = visual.cornerRadius
        }
        existing.icon = buildNodeIcon(ds)
        existing.contentInset = (ds?.contentInset ?? 0) as unknown as number
        setNodeLabelPlacement(existing, ds?.labelPlacement)
      } else {
        componentNodes.push(createComponentNode(component, 0, 0))
      }
    }

    // --- Notation diagram-only layer nodes/edges (stored in notation attrs) ---
    const layerNodeIds = new Set<string>()
    for (const layerNode of state.value.diagramLayer.nodes) {
      const nodeId = `layer-node-${layerNode.id}`
      layerNodeIds.add(nodeId)
      currentNodeIds.add(nodeId)
      const existing = renderer.getNode(nodeId)
      if (existing) {
        existing.x = layerNode.x
        existing.y = layerNode.y
        existing.width = layerNode.width
        existing.height = layerNode.height
      } else {
        renderer.addNode(createDiagramLayerNode(nodeId, layerNode))
      }
    }

    for (const layerEdge of state.value.diagramLayer.edges) {
      const edgeId = `layer-edge-${layerEdge.id}`
      const sourceId = `layer-node-${layerEdge.sourceNodeId}`
      const targetId = `layer-node-${layerEdge.targetNodeId}`
      if (!layerNodeIds.has(sourceId) || !layerNodeIds.has(targetId)) continue
      currentEdgeIds.add(edgeId)
      const existingEdge = renderer.getEdge(edgeId)
      if (existingEdge) {
        existingEdge.from = { nodeId: sourceId }
        existingEdge.to = { nodeId: targetId }
        existingEdge.label = typeof layerEdge.attrs?.label === "string" ? layerEdge.attrs.label : ""
      } else {
        renderer.addEdge(
          new Edge({
            id: edgeId,
            from: { nodeId: sourceId },
            to: { nodeId: targetId },
            type: "polyline",
            style: { strokeColor: "#d4b85f", strokeWidth: 1, lineDash: [6, 4] },
            label: typeof layerEdge.attrs?.label === "string" ? layerEdge.attrs.label : "",
          })
        )
      }
    }

    // --- Relations as anchor pairs + edges ---
    const newAnchorSources: CircleNode[] = []
    const relationMetaBySourceId = new Map<string, AnchorRelationMeta>()

    for (const relation of activeRelations) {
      const srcId = `relation-src-${relation.id}`
      const tgtId = `relation-tgt-${relation.id}`
      const edgeId = `relation-edge-${relation.id}`

      currentNodeIds.add(srcId)
      currentNodeIds.add(tgtId)
      currentEdgeIds.add(edgeId)

      nodeIdToEntity.set(srcId, { id: relation.id, kind: "relation" })
      nodeIdToEntity.set(tgtId, { id: relation.id, kind: "relation" })
      edgeIdToEntity.set(edgeId, { id: relation.id, kind: "relation" })

      const edgeStyle = resolveRelationStyle(relation)

      const existingSrc = renderer.getNode(srcId)
      const existingTgt = renderer.getNode(tgtId)
      const existingEdge = renderer.getEdge(edgeId)

      if (existingSrc && existingEdge) {
        disableTransformerFrame(existingSrc)
        if (existingTgt) disableTransformerFrame(existingTgt)
        const ds = relation.parsedAttrs.diagramStyle
        // Set label as string first (setter creates proper TextLabel), then apply style
        existingEdge.label = relation.name
        if (existingEdge.label && (ds?.labelColor || ds?.labelFontSize || ds?.labelOpacity != null)) {
          existingEdge.label.style = {
            ...(ds.labelColor ? { color: ds.labelColor } : {}),
            ...(ds.labelOpacity != null ? { opacity: ds.labelOpacity } : {}),
            ...(ds.labelFontSize ? { fontSize: ds.labelFontSize } : {})
          }
        }
        setTextLabelSpacing(existingEdge.label, {
          inset: ds?.labelInset
        })
        // Update edge style
        existingEdge.style = {
          strokeColor: edgeStyle.strokeColor,
          strokeWidth: edgeStyle.strokeWidth,
          strokeOpacity: edgeStyle.strokeOpacity ?? 1,
          ...(ds?.opacity != null ? { opacity: ds.opacity } : {}),
          ...(ds?.lineDash ? { lineDash: ds.lineDash } : {})
        } as PapirusEdgeStyle
        existingEdge.labelBackground = buildEdgeLabelBackground(ds)
        existingEdge.labelOffset = ds?.edgeLabelOffset ?? 18
        existingEdge.labelLineGap = ds?.edgeLabelLineGap ?? false
        if (ds?.edgeType) {
          existingEdge.type = ds.edgeType as "straight" | "polyline" | "editable-polyline" | "bezier"
        }
        existingEdge.startMarker = buildMarker(ds?.startMarkerType, ds, "start")
        existingEdge.endMarker = buildMarker(ds?.endMarkerType, ds, "end")
        existingEdge.arrowType = "none"
      } else {
        // Create new anchor pair + edge
        const srcNode = new CircleNode({
          id: srcId,
          x: 0,
          y: 0,
          width: ANCHOR_SIZE,
          height: ANCHOR_SIZE,
          style: ANCHOR_STYLE,
          anchorPoints: NO_ANCHORS
        })
        const tgtNode = new CircleNode({
          id: tgtId,
          x: ANCHOR_GAP,
          y: 0,
          width: ANCHOR_SIZE,
          height: ANCHOR_SIZE,
          style: ANCHOR_STYLE,
          anchorPoints: NO_ANCHORS
        })
        disableTransformerFrame(srcNode)
        disableTransformerFrame(tgtNode)

        newAnchorSources.push(srcNode)

        // We'll add nodes + edges after layout
        // Store tgtNode on srcNode temporarily via a side map
        relationMetaBySourceId.set(srcNode.id, {
          pairedTarget: tgtNode,
          relationId: relation.id,
          relationName: relation.name,
          edgeStyle,
          diagramStyle: relation.parsedAttrs.diagramStyle
        })
      }
    }

    // Remove stale nodes
    for (const [nodeId] of renderer.nodes) {
      if (!currentNodeIds.has(nodeId)) {
        renderer.removeNode(nodeId)
      }
    }

    // Remove stale edges
    for (const [edgeId] of renderer.edges) {
      if (!currentEdgeIds.has(edgeId)) {
        renderer.removeEdge(edgeId)
      }
    }

    // Layout and add new component nodes
    if (componentNodes.length > 0) {
      const autoLayout = new AutoLayout()
      const startX = GRID_SIZE * 3
      const startY = GRID_SIZE * 3
      const newComponentById = new Map(componentNodes.map((node) => [node.id, node]))
      const componentNodesForLayout = activeComponentsSorted
        .map((component) => {
          const nodeId = `component-${component.id}`
          const existing = renderer.getNode(nodeId)
          return existing ?? newComponentById.get(nodeId) ?? null
        })
        .filter((node): node is DiagramNode => node !== null)

      autoLayout.applyGridLayout(componentNodesForLayout, {
        columns: 2,
        columnGap: COLUMN_GAP,
        rowGap: ROW_GAP,
        startX,
        startY
      })
      for (const node of componentNodes) {
        renderer.addNode(node)
      }
    }

    // Layout and add new relation anchor pairs + edges
    if (newAnchorSources.length > 0) {
      // Calculate start position to the right of existing nodes
      let startX = GRID_SIZE * 3
      const allNodes = [...renderer.nodes.values()]
      if (allNodes.length > 0) {
        const maxX = Math.max(...allNodes.map((n) => n.x + n.width))
        startX = Math.ceil((maxX + COLUMN_GAP * 2) / GRID_SIZE) * GRID_SIZE
      }

      const autoLayout = new AutoLayout()
      // Layout source anchors in a grid
      autoLayout.applyGridLayout(newAnchorSources, {
        columns: 1,
        columnGap: COLUMN_GAP,
        rowGap: ROW_GAP,
        startX,
        startY: GRID_SIZE * 3
      })

      for (const srcNode of newAnchorSources) {
        const relationMeta = relationMetaBySourceId.get(srcNode.id)
        if (!relationMeta) continue
        const { pairedTarget: tgtNode, edgeStyle, relationName, relationId, diagramStyle: ds } = relationMeta

        // Position target relative to source
        tgtNode.x = srcNode.x + ANCHOR_GAP
        tgtNode.y = srcNode.y

        renderer.addNode(srcNode)
        renderer.addNode(tgtNode)

        const edgeTypeVal = (ds?.edgeType as "straight" | "polyline" | "editable-polyline" | "bezier") || "polyline"
        const startMarker = buildMarker(ds?.startMarkerType, ds, "start")
        const endMarker = buildMarker(ds?.endMarkerType, ds, "end")

        const edge = new Edge({
          id: `relation-edge-${relationId}`,
          from: { nodeId: srcNode.id },
          to: { nodeId: tgtNode.id },
          type: edgeTypeVal,
          arrowType: "none",
          label: buildEdgeLabel(relationName, ds),
          labelOffset: ds?.edgeLabelOffset ?? 18,
          labelLineGap: ds?.edgeLabelLineGap ?? false,
          labelBackground: buildEdgeLabelBackground(ds),
          style: {
            strokeColor: edgeStyle.strokeColor,
            strokeWidth: edgeStyle.strokeWidth,
            strokeOpacity: edgeStyle.strokeOpacity ?? 1,
            ...(ds?.opacity != null ? { opacity: ds.opacity } : {}),
            ...(ds?.lineDash ? { lineDash: ds.lineDash } : {})
          } as PapirusEdgeStyle,
          startMarker,
          endMarker
        })
        renderer.addEdge(edge)
      }
    }
  }

  function updateSelection(renderer: DiagramRenderer, selectedEntityId?: string | null) {
    const id = selectedEntityId === undefined ? selectedId.value : selectedEntityId
    syncSelectionManagerFromEntityId(id)
    const activeComponents = state.value.components.filter((c) => !c._isDeleted)

    // Update node selection styles
    for (const [nodeId, node] of renderer.nodes) {
      const entity = nodeIdToEntity.get(nodeId)
      const isSelected = entity && entity.id === id

      if (entity?.kind === "component") {
        const item = activeComponents.find((entry) => entry.id === entity.id)
        const baseStyle = item ? resolveComponentStyle(item).style : COMPONENT_STYLE
        const ds = item?.parsedAttrs.diagramStyle
        const fullStyle = {
          ...baseStyle,
          ...(ds?.opacity != null ? { opacity: ds.opacity } : {}),
          ...(ds?.lineDash ? { lineDash: ds.lineDash } : {})
        }
        if (isSelected) {
          node.style = fullStyle
          node.state = "normal" as ElementState
        } else {
          node.style = fullStyle
          if (node.state === "selected") {
            node.state = "normal" as ElementState
          }
        }
      } else if (entity?.kind === "relation") {
        // Anchor nodes stay invisible
        node.style = ANCHOR_STYLE
        if (node.state === "selected") {
          node.state = "normal" as ElementState
        }
      }
    }

    // Update edge selection styles
    for (const [edgeId, edge] of renderer.edges) {
      const entity = edgeIdToEntity.get(edgeId)
      const isSelected = entity && entity.id === id

      if (isSelected) {
        edge.state = "selected"
      } else {
        if (edge.state === "selected") {
          edge.state = "normal" as ElementState
        }
      }
    }
  }

  function getRelationAnchorNodeIds(relationId: string): string[] {
    const anchorIds: string[] = []
    for (const [nodeId, entity] of nodeIdToEntity) {
      if (
        entity.kind === "relation" &&
        entity.id === relationId &&
        (nodeId.startsWith("relation-src-") || nodeId.startsWith("relation-tgt-"))
      ) {
        anchorIds.push(nodeId)
      }
    }
    return anchorIds
  }

  function areSameIdSets(current: ReadonlySet<string>, target: string[]): boolean {
    if (current.size !== target.length) return false
    for (const id of target) {
      if (!current.has(id)) return false
    }
    return true
  }

  function getSelectionElementIdsByEntityId(entityId: string): string[] {
    const componentNodeId = `component-${entityId}`
    if (nodeIdToEntity.has(componentNodeId)) {
      return [componentNodeId]
    }

    const relationEdgeId = `relation-edge-${entityId}`
    if (edgeIdToEntity.has(relationEdgeId)) {
      return [relationEdgeId, ...getRelationAnchorNodeIds(entityId)]
    }

    return []
  }

  function syncSelectionManagerFromEntityId(entityId: string | null) {
    const selectionManager = selectionManagerRef.value
    if (!selectionManager) return

    const targetIds = entityId ? getSelectionElementIdsByEntityId(entityId) : []
    if (areSameIdSets(selectionManager.selectedIds, targetIds)) {
      return
    }

    syncingSelectionFromState = true
    try {
      if (targetIds.length === 0) {
        selectionManager.clearSelection()
      } else if (targetIds.length === 1) {
        selectionManager.select(targetIds[0]!)
      } else {
        selectionManager.selectMultiple(targetIds)
      }
    } finally {
      syncingSelectionFromState = false
    }
  }

  function initRenderer(renderer: DiagramRenderer) {
    rendererRef.value = renderer

    const gridOverlay = new GridOverlay({
      gridSize: GRID_SIZE,
      color: "#e2e8f0"
    })
    renderer.use(gridOverlay)
    gridOverlayRef.value = gridOverlay

    const rulersOverlay = new RulersOverlay({ enabled: true })
    renderer.use(rulersOverlay)
    rulersOverlayRef.value = rulersOverlay

    const miniMap = new MiniMap({ width: 120, height: 60, padding: 20, contentMargin: 200 })
    renderer.use(miniMap)
    miniMapRef.value = miniMap

    const interactionManager = renderer.enableInteractions({
      snapToGrid: true,
      gridSize: GRID_SIZE,
      alignToNodes: true,
      alignmentScreenTolerance: 40,
      previewPathType: 'straight',
      keymap: { deleteKeys: [] }
    })
    // Notation editor does not support interactive port-to-port connections.
    const connectionManager =
      interactionManager.connection as unknown as {
        connectionValidator?: ((sourceNodeId: string, targetNodeId: string) => boolean) | null
        tryStartConnectionAtPoint?: (event: unknown) => boolean
        tryStartReconnection?: (event: unknown) => boolean
      }
    connectionManager.connectionValidator = () => false
    connectionManager.tryStartConnectionAtPoint = () => false
    connectionManager.tryStartReconnection = () => false
    interactionManagerRef.value = interactionManager

    const selectionManager = interactionManager.selection
    selectionManagerRef.value = selectionManager
    navigationManagerRef.value = interactionManager.navigation

    cleanupSelectionOutlineOverlay?.()
    cleanupSelectionOutlineOverlay = renderer.addOverlayRenderer((ctx) => {
      const selectedEntityId = selectedId.value
      if (!selectedEntityId) return

      let selectedNode: DiagramNode | null = null
      for (const [nodeId, entity] of nodeIdToEntity) {
        if (entity.kind === "component" && entity.id === selectedEntityId) {
          const node = renderer.getNode(nodeId)
          if (node) {
            selectedNode = node
          }
          break
        }
      }

      if (!selectedNode) return
      const bounds = selectedNode.getBounds()
      const zoom = renderer.zoom || 1
      const lineWidth = 1 / zoom
      const offset = SOFT_SELECTION_OFFSET_PX / zoom

      ctx.save()
      ctx.strokeStyle = SOFT_SELECTION_COLOR
      ctx.lineWidth = lineWidth
      ctx.setLineDash([4 / zoom, 4 / zoom])
      ctx.strokeRect(
        bounds.x - offset,
        bounds.y - offset,
        bounds.width + offset * 2,
        bounds.height + offset * 2
      )
      ctx.restore()
    })

    selectionManager.on("select", (elementIds: string[]) => {
      if (syncingRelationSelection || syncingSelectionFromState) {
        return
      }
      if (elementIds.length === 0) {
        onSelect(null, null)
        updateSelection(renderer, null)
        return
      }
      if (elementIds.length === 1) {
        const elementId = elementIds[0]!
        // Check nodes first, then edges
        const nodeEntity = nodeIdToEntity.get(elementId)
        if (nodeEntity) {
          onSelect(nodeEntity.id, nodeEntity.kind)
          updateSelection(renderer, nodeEntity.id)
          return
        }
        const edgeEntity = edgeIdToEntity.get(elementId)
        if (edgeEntity) {
          const relationAnchorIds = getRelationAnchorNodeIds(edgeEntity.id)
          if (relationAnchorIds.length > 0) {
            syncingRelationSelection = true
            try {
              selectionManager.selectMultiple(relationAnchorIds)
            } finally {
              syncingRelationSelection = false
            }
          }
          onSelect(edgeEntity.id, edgeEntity.kind)
          updateSelection(renderer, edgeEntity.id)
          return
        }
      }
      updateSelection(renderer)
    })

    interactionManager.drag.on("dragend", (draggedNodeIds: string[]) => {
      if (!Array.isArray(draggedNodeIds) || draggedNodeIds.length === 0) return
      const draggedSet = new Set(draggedNodeIds)
      let changed = false
      state.value.diagramLayer.nodes = state.value.diagramLayer.nodes.map((node) => {
        const papirusId = `layer-node-${node.id}`
        if (!draggedSet.has(papirusId)) return node
        const rendered = renderer.getNode(papirusId)
        if (!rendered) return node
        changed = true
        return {
          ...node,
          x: rendered.x,
          y: rendered.y,
          width: rendered.width,
          height: rendered.height,
        }
      })
      if (changed) renderer.markDirty()
    })

    syncNodes(renderer)
    updateSelection(renderer)

    watch(
      () => [state.value.components, state.value.relations, state.value.diagramLayer],
      () => {
        syncNodes(renderer)
        updateSelection(renderer)
      },
      { deep: true }
    )

    watch(selectedId, () => {
      updateSelection(renderer)
    })
  }

  function fitToView() {
    navigationManagerRef.value?.fitToView(50)
  }

  function autoLayoutComponents() {
    const renderer = rendererRef.value
    if (!renderer) return

    const activeComponentsSorted = state.value.components
      .filter((component) => !component._isDeleted)
      .sort(compareComponentsForLayout)

    const componentNodes = activeComponentsSorted
      .map((component) => renderer.getNode(`component-${component.id}`))
      .filter((node): node is DiagramNode => node !== undefined)

    if (componentNodes.length === 0) return

    const autoLayout = new AutoLayout()
    autoLayout.applyGridLayout(componentNodes, {
      columns: 2,
      columnGap: COLUMN_GAP,
      rowGap: ROW_GAP,
      startX: GRID_SIZE * 3,
      startY: GRID_SIZE * 3
    })

    // Re-layout relation anchor pairs to the right of components
    const relationSourceNodes: CircleNode[] = []
    for (const [nodeId, node] of renderer.nodes) {
      const entity = nodeIdToEntity.get(nodeId)
      if (entity?.kind === "relation" && nodeId.startsWith("relation-src-") && node instanceof CircleNode) {
        relationSourceNodes.push(node)
      }
    }

    if (relationSourceNodes.length > 0) {
      const maxX = Math.max(...componentNodes.map((n) => n.x + n.width))
      const startX = Math.ceil((maxX + COLUMN_GAP * 2) / GRID_SIZE) * GRID_SIZE
      autoLayout.applyGridLayout(relationSourceNodes, {
        columns: 1,
        columnGap: COLUMN_GAP,
        rowGap: ROW_GAP,
        startX,
        startY: GRID_SIZE * 3
      })

      for (const srcNode of relationSourceNodes) {
        const relationId = srcNode.id.replace("relation-src-", "")
        const tgtNode = renderer.getNode(`relation-tgt-${relationId}`)
        if (tgtNode instanceof CircleNode) {
          tgtNode.x = srcNode.x + ANCHOR_GAP
          tgtNode.y = srcNode.y
        }
      }
    }

    renderer.markDirty()
  }

  function resetView() {
    navigationManagerRef.value?.resetView()
  }

  function getNodeEntity(nodeId: string) {
    return nodeIdToEntity.get(nodeId) ?? null
  }

  function getEdgeEntity(edgeId: string) {
    return edgeIdToEntity.get(edgeId) ?? null
  }

  function destroyRenderer() {
    cleanupSelectionOutlineOverlay?.()
    cleanupSelectionOutlineOverlay = null
    interactionManagerRef.value = null
    selectionManagerRef.value = null
    navigationManagerRef.value = null
    gridOverlayRef.value = null
    miniMapRef.value = null
    rulersOverlayRef.value = null
    rendererRef.value = null
    nodeIdToEntity.clear()
    edgeIdToEntity.clear()
  }

  return {
    rendererRef,
    interactionManagerRef,
    gridOverlayRef,
    miniMapRef,
    rulersOverlayRef,
    initRenderer,
    destroyRenderer,
    fitToView,
    autoLayoutComponents,
    resetView,
    getNodeEntity,
    getEdgeEntity
  }
}
