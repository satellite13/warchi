import { shallowRef, watch, type Ref } from "vue"
import {
  DiagramRenderer,
  RectangleNode,
  CircleNode,
  Edge,
  AutoLayout,
  GridOverlay,
  MiniMap,
  NavigationManager,
  SelectionManager,
  InteractionManager,
  type ElementState,
  type TextLabelOptions,
  type LabelPlacement
} from "papirus"
import type { DiagramStyle, NodeStyle } from "../notationAttrs"
import type {
  NotationEditorState,
  EditorNodeType,
  EditorLinkType,
  EditorComponent,
  EditorRelation
} from "../types"

export type EntityKind = "component" | "relation"

export interface NotationDiagramOptions {
  state: Ref<NotationEditorState>
  selectedId: Ref<string | null>
  onSelect: (id: string, kind: EntityKind) => void
}

const COMPONENT_STYLE = {
  fillColor: "#e0f2fe",
  fillOpacity: 1,
  strokeColor: "#0284c7",
  strokeOpacity: 1,
  strokeWidth: 2
}

const RELATION_EDGE_STYLE = {
  strokeColor: "#7c3aed",
  strokeOpacity: 1,
  strokeWidth: 2
}

const ANCHOR_STYLE = {
  fillColor: "transparent",
  strokeColor: "transparent",
  strokeWidth: 0
}
const SOFT_SELECTION_COLOR = "#6366f1"
const SOFT_SELECTION_OFFSET_PX = 3

type ResolvedStyle = {
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeOpacity: number
  strokeWidth: number
}

const NODE_WIDTH = 140
const NODE_HEIGHT = 50
const COMPONENT_RADIUS = 8
const ANCHOR_SIZE = 10
const ANCHOR_GAP = 120
const COLUMN_GAP = 60
const ROW_GAP = 30
const GRID_SIZE = 20
const NO_ANCHORS = { top: 0, right: 0, bottom: 0, left: 0 }
const NOOP_RENDER_RESIZE_HANDLES = () => {}

function disableTransformerFrame(node: RectangleNode | CircleNode) {
  ;(node as any).renderResizeHandles = NOOP_RENDER_RESIZE_HANDLES
}

export function useNotationDiagram(options: NotationDiagramOptions) {
  const { state, selectedId, onSelect } = options

  const rendererRef = shallowRef<DiagramRenderer | null>(null)
  const interactionManagerRef = shallowRef<InteractionManager | null>(null)
  const selectionManagerRef = shallowRef<SelectionManager | null>(null)
  const navigationManagerRef = shallowRef<NavigationManager | null>(null)
  const gridOverlayRef = shallowRef<GridOverlay | null>(null)
  const miniMapRef = shallowRef<MiniMap | null>(null)
  const nodeIdToEntity = new Map<string, { id: string; kind: EntityKind }>()
  const edgeIdToEntity = new Map<string, { id: string; kind: EntityKind }>()
  let cleanupSelectionOutlineOverlay: (() => void) | null = null

  function mergeStyle(base: ResolvedStyle, override?: NodeStyle): ResolvedStyle {
    return {
      fillColor: override?.fillColor ?? base.fillColor,
      fillOpacity: (override as any)?.fillOpacity ?? base.fillOpacity,
      strokeColor: override?.strokeColor ?? base.strokeColor,
      strokeOpacity: (override as any)?.strokeOpacity ?? base.strokeOpacity,
      strokeWidth: override?.strokeWidth ?? base.strokeWidth
    }
  }

  function resolveComponentTypeStyle(typeItem: EditorNodeType | undefined) {
    const baseStyle = COMPONENT_STYLE
    const width =
      typeof typeItem?.parsedAttrs.width === "number"
        ? typeItem.parsedAttrs.width
        : NODE_WIDTH
    const height =
      typeof typeItem?.parsedAttrs.height === "number"
        ? typeItem.parsedAttrs.height
        : NODE_HEIGHT
    const style: ResolvedStyle = mergeStyle(baseStyle, typeItem?.parsedAttrs.style)
    const cornerRadius =
      typeof typeItem?.parsedAttrs.cornerRadius === "number"
        ? typeItem.parsedAttrs.cornerRadius
        : typeof typeItem?.parsedAttrs.style?.cornerRadius === "number"
          ? typeItem.parsedAttrs.style.cornerRadius
          : COMPONENT_RADIUS
    return { style, width, height, cornerRadius }
  }

  function resolveRelationEdgeStyle(typeItem: EditorLinkType | undefined) {
    const base = RELATION_EDGE_STYLE
    const strokeColor = typeItem?.parsedAttrs.style?.strokeColor ?? base.strokeColor
    const strokeOpacity = (typeItem?.parsedAttrs.style as any)?.strokeOpacity ?? base.strokeOpacity
    const strokeWidth = typeItem?.parsedAttrs.style?.strokeWidth ?? base.strokeWidth
    return { strokeColor, strokeOpacity, strokeWidth }
  }

  function resolveComponentStyle(item: EditorComponent) {
    const typeItem = state.value.nodeTypes.find(
      (type) => type.id === item.nodeTypeId
    )
    const base = resolveComponentTypeStyle(typeItem)
    const ds = item.parsedAttrs.diagramStyle
    if (!ds) return base
    return {
      style: {
        fillColor: ds.fillColor ?? base.style.fillColor,
        fillOpacity: ds.fillOpacity ?? base.style.fillOpacity ?? 1,
        strokeColor: ds.strokeColor ?? base.style.strokeColor,
        strokeOpacity: ds.strokeOpacity ?? base.style.strokeOpacity ?? 1,
        strokeWidth: ds.strokeWidth ?? base.style.strokeWidth,
        ...(ds.opacity != null ? { opacity: ds.opacity } : {}),
        ...(ds.lineDash ? { lineDash: ds.lineDash } : {})
      } as ResolvedStyle,
      width: ds.width ?? base.width,
      height: ds.height ?? base.height,
      cornerRadius: ds.cornerRadius ?? base.cornerRadius
    }
  }

  function resolveRelationStyle(item: EditorRelation) {
    const typeItem = state.value.linkTypes.find(
      (type) => type.id === item.linkTypeId
    )
    const base = resolveRelationEdgeStyle(typeItem)
    const ds = item.parsedAttrs.diagramStyle
    if (!ds) return base
    return {
      strokeColor: ds.strokeColor ?? base.strokeColor,
      strokeOpacity: ds.strokeOpacity ?? base.strokeOpacity ?? 1,
      strokeWidth: ds.strokeWidth ?? base.strokeWidth
    }
  }

  function buildNodeLabel(name: string, ds?: DiagramStyle): string | TextLabelOptions {
    if (!ds?.labelColor && ds?.labelOpacity == null && !ds?.labelFontSize && ds?.labelPadding == null && ds?.labelMargin == null) {
      return name
    }
    const opts: TextLabelOptions = { text: name }
    const style: Record<string, unknown> = {}
    if (ds.labelColor) style.color = ds.labelColor
    if (ds.labelOpacity != null) style.opacity = ds.labelOpacity
    if (ds.labelFontSize) style.fontSize = ds.labelFontSize
    if (Object.keys(style).length) opts.style = style as any
    if (ds.labelPadding != null) opts.padding = ds.labelPadding
    if (ds.labelMargin != null) opts.margin = ds.labelMargin
    return opts
  }

  function buildEdgeLabel(name: string, ds?: DiagramStyle): string | TextLabelOptions {
    if (!ds?.labelColor && ds?.labelOpacity == null && !ds?.labelFontSize) {
      return name
    }
    const opts: TextLabelOptions = { text: name }
    const style: Record<string, unknown> = {}
    if (ds.labelColor) style.color = ds.labelColor
    if (ds.labelOpacity != null) style.opacity = ds.labelOpacity
    if (ds.labelFontSize) style.fontSize = ds.labelFontSize
    if (Object.keys(style).length) opts.style = style as any
    return opts
  }

  function buildEdgeLabelBackground(ds?: DiagramStyle) {
    return {
      color: ds?.labelBgColor || "transparent",
      ...(ds?.labelBgOpacity != null ? { opacity: ds.labelBgOpacity } : {}),
      ...(ds?.labelBgPadding != null ? { padding: ds.labelBgPadding } : {}),
      ...(ds?.labelBgBorderRadius != null ? { borderRadius: ds.labelBgBorderRadius } : {})
    }
  }

  function buildNodeIcon(ds?: DiagramStyle) {
    if (!ds?.iconName) return undefined
    return {
      source: `/icons/${ds.iconName}.svg`,
      placement: (ds.iconPlacement as any) ?? ("top-left" as const),
      width: ds.iconWidth ?? 20,
      height: ds.iconHeight ?? 20,
      fit: "contain" as const,
      ...(ds.iconPadding != null ? { padding: ds.iconPadding } : {}),
      ...(ds.iconMargin != null ? { margin: ds.iconMargin } : {}),
      ...(ds.iconStrokeColor ? { strokeColor: ds.iconStrokeColor } : {}),
      ...(ds.iconFillColor ? { fillColor: ds.iconFillColor } : {})
    }
  }

  function buildMarker(typeStr: string | undefined, ds: DiagramStyle | undefined, prefix: "start" | "end") {
    const markerType = typeStr as "arrow" | "open" | "diamond" | "circle" | undefined
    if (!markerType || markerType === ("none" as any)) return undefined
    const sizeKey = prefix === "start" ? "startMarkerSize" : "endMarkerSize"
    const fillKey = prefix === "start" ? "startMarkerFillColor" : "endMarkerFillColor"
    const opacityKey = prefix === "start" ? "startMarkerFillOpacity" : "endMarkerFillOpacity"
    return {
      type: markerType,
      size: ds?.[sizeKey] ?? 12,
      ...(ds?.[fillKey] ? { fillColor: ds[fillKey] } : {}),
      ...(ds?.[opacityKey] != null ? { fillOpacity: ds[opacityKey] } : {})
    }
  }

  function createComponentNode(
    item: EditorComponent,
    x: number,
    y: number
  ): RectangleNode {
    const visual = resolveComponentStyle(item)
    const ds = item.parsedAttrs.diagramStyle
    const node = new RectangleNode({
      id: `component-${item.id}`,
      x,
      y,
      width: visual.width,
      height: visual.height,
      label: buildNodeLabel(item.name, ds),
      style: visual.style,
      cornerRadius: visual.cornerRadius,
      anchorPoints: NO_ANCHORS,
      ...(buildNodeIcon(ds) ? { icon: buildNodeIcon(ds) } : {})
    })
    if (ds?.labelPlacement) {
      (node as any).labelPlacement = ds.labelPlacement as LabelPlacement
    }
    disableTransformerFrame(node)
    return node
  }

  function syncNodes(renderer: DiagramRenderer) {
    const currentNodeIds = new Set<string>()
    const currentEdgeIds = new Set<string>()
    nodeIdToEntity.clear()
    edgeIdToEntity.clear()

    const componentNodes: RectangleNode[] = []

    // Filter out deleted items
    const activeComponents = state.value.components.filter((c) => !c._isDeleted)
    const activeRelations = state.value.relations.filter((r) => !r._isDeleted)

    // --- Components as rectangle nodes ---
    for (const component of activeComponents) {
      const nodeId = `component-${component.id}`
      currentNodeIds.add(nodeId)
      nodeIdToEntity.set(nodeId, { id: component.id, kind: "component" })

      const existing = renderer.getNode(nodeId)
      if (existing) {
        if (existing instanceof RectangleNode || existing instanceof CircleNode) {
          disableTransformerFrame(existing)
        }
        const visual = resolveComponentStyle(component)
        const ds = component.parsedAttrs.diagramStyle
        // Set label as string first (setter creates proper TextLabel), then apply style
        existing.label = component.name
        if (existing.label && (ds?.labelColor || ds?.labelFontSize || ds?.labelOpacity != null)) {
          existing.label.style = {
            ...(ds.labelColor ? { color: ds.labelColor } : {}),
            ...(ds.labelOpacity != null ? { opacity: ds.labelOpacity } : {}),
            ...(ds.labelFontSize ? { fontSize: ds.labelFontSize } : {})
          }
        }
        if (existing.label && ds?.labelPadding != null) {
          (existing.label as any)._padding = ds.labelPadding
        }
        if (existing.label && ds?.labelMargin != null) {
          (existing.label as any)._margin = ds.labelMargin
        }
        existing.width = visual.width
        existing.height = visual.height
        existing.style = {
          ...visual.style,
          ...(ds?.fillOpacity != null ? { fillOpacity: ds.fillOpacity } : {}),
          ...(ds?.strokeOpacity != null ? { strokeOpacity: ds.strokeOpacity } : {}),
          ...(ds?.opacity != null ? { opacity: ds.opacity } : {}),
          ...(ds?.lineDash ? { lineDash: ds.lineDash } : {})
        }
        ;(existing as RectangleNode).cornerRadius = visual.cornerRadius
        existing.icon = buildNodeIcon(ds)
        if (ds?.labelPlacement) {
          (existing as any).labelPlacement = ds.labelPlacement as LabelPlacement
        }
      } else {
        componentNodes.push(createComponentNode(component, 0, 0))
      }
    }

    // --- Relations as anchor pairs + edges ---
    const newAnchorSources: CircleNode[] = []

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
      const existingEdge = renderer.getEdge(edgeId)

      if (existingSrc && existingEdge) {
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
        // Update edge style
        existingEdge.style = {
          strokeColor: edgeStyle.strokeColor,
          strokeWidth: edgeStyle.strokeWidth,
          strokeOpacity: (edgeStyle as any).strokeOpacity ?? 1,
          ...(ds?.opacity != null ? { opacity: ds.opacity } : {}),
          ...(ds?.lineDash ? { lineDash: ds.lineDash } : {})
        } as any
        ;(existingEdge as any).labelBackground = buildEdgeLabelBackground(ds)
        if (ds?.edgeType) {
          existingEdge.type = ds.edgeType as "straight" | "polyline" | "bezier"
        }
        existingEdge.startMarker = buildMarker(ds?.startMarkerType, ds, "start")
        existingEdge.endMarker = buildMarker(ds?.endMarkerType, ds, "end")
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

        newAnchorSources.push(srcNode)

        // We'll add nodes + edges after layout
        // Store tgtNode on srcNode temporarily via a side map
        ;(srcNode as any)._pairedTarget = tgtNode
        ;(srcNode as any)._relationId = relation.id
        ;(srcNode as any)._edgeStyle = edgeStyle
        ;(srcNode as any)._relationName = relation.name
        ;(srcNode as any)._diagramStyle = relation.parsedAttrs.diagramStyle
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
      autoLayout.applyGridLayout(componentNodes, {
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
        const tgtNode = (srcNode as any)._pairedTarget as CircleNode
        const edgeStyle = (srcNode as any)._edgeStyle as { strokeColor: string; strokeWidth: number }
        const relationName = (srcNode as any)._relationName as string
        const relationId = (srcNode as any)._relationId as string
        const ds = (srcNode as any)._diagramStyle as DiagramStyle | undefined

        // Position target relative to source
        tgtNode.x = srcNode.x + ANCHOR_GAP
        tgtNode.y = srcNode.y

        renderer.addNode(srcNode)
        renderer.addNode(tgtNode)

        const edgeTypeVal = (ds?.edgeType as "straight" | "polyline" | "bezier") || "polyline"
        const startMarker = buildMarker(ds?.startMarkerType, ds, "start")
        const endMarker = buildMarker(ds?.endMarkerType, ds, "end")
          ?? { type: "open" as const, size: 12 }

        const edge = new Edge({
          id: `relation-edge-${relationId}`,
          from: { nodeId: srcNode.id },
          to: { nodeId: tgtNode.id },
          type: edgeTypeVal,
          label: buildEdgeLabel(relationName, ds),
          labelOffset: 18,
          labelBackground: buildEdgeLabelBackground(ds),
          style: {
            strokeColor: edgeStyle.strokeColor,
            strokeWidth: edgeStyle.strokeWidth,
            strokeOpacity: (edgeStyle as any).strokeOpacity ?? 1,
            ...(ds?.opacity != null ? { opacity: ds.opacity } : {}),
            ...(ds?.lineDash ? { lineDash: ds.lineDash } : {})
          } as any,
          startMarker,
          endMarker
        })
        renderer.addEdge(edge)

        // Clean up temp properties
        delete (srcNode as any)._pairedTarget
        delete (srcNode as any)._relationId
        delete (srcNode as any)._edgeStyle
        delete (srcNode as any)._relationName
        delete (srcNode as any)._diagramStyle
      }
    }
  }

  function updateSelection(renderer: DiagramRenderer, selectedEntityId?: string | null) {
    const id = selectedEntityId ?? selectedId.value
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

  function initRenderer(renderer: DiagramRenderer) {
    rendererRef.value = renderer

    const gridOverlay = new GridOverlay({
      gridSize: GRID_SIZE,
      color: "#e2e8f0"
    })
    renderer.use(gridOverlay)
    gridOverlayRef.value = gridOverlay

    const miniMap = new MiniMap({ width: 120, height: 60, padding: 20 })
    renderer.use(miniMap)
    miniMapRef.value = miniMap

    const interactionManager = renderer.enableInteractions({
      snapToGrid: true,
      gridSize: GRID_SIZE,
      keymap: { deleteKeys: [] }
    })
    interactionManagerRef.value = interactionManager

    const selectionManager = interactionManager.selection
    selectionManagerRef.value = selectionManager
    navigationManagerRef.value = interactionManager.navigation

    cleanupSelectionOutlineOverlay?.()
    cleanupSelectionOutlineOverlay = renderer.addOverlayRenderer((ctx) => {
      const selectedEntityId = selectedId.value
      if (!selectedEntityId) return

      let selectedNode: RectangleNode | CircleNode | null = null
      for (const [nodeId, entity] of nodeIdToEntity) {
        if (entity.kind === "component" && entity.id === selectedEntityId) {
          const node = renderer.getNode(nodeId)
          if (node instanceof RectangleNode || node instanceof CircleNode) {
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
          onSelect(edgeEntity.id, edgeEntity.kind)
          updateSelection(renderer, edgeEntity.id)
          return
        }
      }
      updateSelection(renderer)
    })

    syncNodes(renderer)
    updateSelection(renderer)

    watch(
      () => [state.value.components, state.value.relations],
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
    rendererRef.value = null
    nodeIdToEntity.clear()
    edgeIdToEntity.clear()
  }

  return {
    rendererRef,
    interactionManagerRef,
    gridOverlayRef,
    miniMapRef,
    initRenderer,
    destroyRenderer,
    fitToView,
    resetView,
    getNodeEntity,
    getEdgeEntity
  }
}
