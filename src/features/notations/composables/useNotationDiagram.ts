import { ref, watch, type Ref } from "vue"
import {
  DiagramRenderer,
  RectangleNode,
  AutoLayout,
  SelectionManager,
  GridOverlay,
  NavigationManager,
  type ElementState
} from "papirus"
import type { NodeStyle } from "../notationAttrs"
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
  strokeColor: "#0284c7",
  strokeWidth: 2
}

const RELATION_STYLE = {
  fillColor: "#ede9fe",
  strokeColor: "#7c3aed",
  strokeWidth: 2
}

const SELECTED_STYLE = {
  strokeWidth: 3
}

type ResolvedStyle = {
  fillColor: string
  strokeColor: string
  strokeWidth: number
}

const NODE_WIDTH = 140
const NODE_HEIGHT = 50
const COMPONENT_RADIUS = 8
const RELATION_RADIUS = 16
const COLUMN_GAP = 60
const ROW_GAP = 30
const GRID_SIZE = 20

export function useNotationDiagram(options: NotationDiagramOptions) {
  const { state, selectedId, onSelect } = options

  const rendererRef = ref<DiagramRenderer | null>(null)
  const selectionManagerRef = ref<SelectionManager | null>(null)
  const navigationManagerRef = ref<NavigationManager | null>(null)
  const nodeIdToEntity = new Map<string, { id: string; kind: EntityKind }>()

  function mergeStyle(base: ResolvedStyle, override?: NodeStyle): ResolvedStyle {
    return {
      fillColor: override?.fillColor ?? base.fillColor,
      strokeColor: override?.strokeColor ?? base.strokeColor,
      strokeWidth: override?.strokeWidth ?? base.strokeWidth
    }
  }

  function resolveTypeStyle(
    typeItem: EditorNodeType | EditorLinkType | undefined,
    kind: EntityKind
  ) {
    const baseStyle = kind === "component" ? COMPONENT_STYLE : RELATION_STYLE
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
          : kind === "component"
            ? COMPONENT_RADIUS
            : RELATION_RADIUS
    return { style, width, height, cornerRadius }
  }

  function resolveComponentStyle(item: EditorComponent) {
    const typeItem = state.value.nodeTypes.find(
      (type) => type.id === item.nodeTypeId
    )
    return resolveTypeStyle(typeItem, "component")
  }

  function resolveRelationStyle(item: EditorRelation) {
    const typeItem = state.value.linkTypes.find(
      (type) => type.id === item.linkTypeId
    )
    return resolveTypeStyle(typeItem, "relation")
  }

  function createComponentNode(
    item: EditorComponent,
    x: number,
    y: number
  ): RectangleNode {
    const visual = resolveComponentStyle(item)
    return new RectangleNode({
      id: `component-${item.id}`,
      x,
      y,
      width: visual.width,
      height: visual.height,
      label: item.name,
      style: visual.style,
      cornerRadius: visual.cornerRadius
    })
  }

  function createRelationNode(
    item: EditorRelation,
    x: number,
    y: number
  ): RectangleNode {
    const visual = resolveRelationStyle(item)
    return new RectangleNode({
      id: `relation-${item.id}`,
      x,
      y,
      width: visual.width,
      height: visual.height,
      label: item.name,
      style: visual.style,
      cornerRadius: visual.cornerRadius
    })
  }

  function syncNodes(renderer: DiagramRenderer) {
    const currentNodeIds = new Set<string>()
    nodeIdToEntity.clear()

    const componentNodes: RectangleNode[] = []
    const relationNodes: RectangleNode[] = []

    // Filter out deleted items
    const activeComponents = state.value.components.filter((c) => !c._isDeleted)
    const activeRelations = state.value.relations.filter((r) => !r._isDeleted)

    for (const component of activeComponents) {
      const nodeId = `component-${component.id}`
      currentNodeIds.add(nodeId)
      nodeIdToEntity.set(nodeId, { id: component.id, kind: "component" })

      const existing = renderer.getNode(nodeId)
      if (existing) {
        if (existing.label?.text !== component.name) {
          existing.label = component.name
        }
        const visual = resolveComponentStyle(component)
        existing.width = visual.width
        existing.height = visual.height
        existing.style = visual.style
        ;(existing as RectangleNode).cornerRadius = visual.cornerRadius
      } else {
        componentNodes.push(createComponentNode(component, 0, 0))
      }
    }

    for (const relation of activeRelations) {
      const nodeId = `relation-${relation.id}`
      currentNodeIds.add(nodeId)
      nodeIdToEntity.set(nodeId, { id: relation.id, kind: "relation" })

      const existing = renderer.getNode(nodeId)
      if (existing) {
        if (existing.label?.text !== relation.name) {
          existing.label = relation.name
        }
        const visual = resolveRelationStyle(relation)
        existing.width = visual.width
        existing.height = visual.height
        existing.style = visual.style
        ;(existing as RectangleNode).cornerRadius = visual.cornerRadius
      } else {
        relationNodes.push(createRelationNode(relation, 0, 0))
      }
    }

    for (const [nodeId] of renderer.nodes) {
      if (!currentNodeIds.has(nodeId)) {
        renderer.removeNode(nodeId)
      }
    }

    if (componentNodes.length > 0 || relationNodes.length > 0) {
      const autoLayout = new AutoLayout()

      if (componentNodes.length > 0) {
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

      if (relationNodes.length > 0) {
        let startX = GRID_SIZE * 3
        if (componentNodes.length > 0) {
          const maxX = Math.max(...componentNodes.map((n) => n.x + n.width))
          startX = Math.ceil((maxX + COLUMN_GAP * 2) / GRID_SIZE) * GRID_SIZE
        }
        const startY = GRID_SIZE * 3
        autoLayout.applyGridLayout(relationNodes, {
          columns: 2,
          columnGap: COLUMN_GAP,
          rowGap: ROW_GAP,
          startX,
          startY
        })
        for (const node of relationNodes) {
          renderer.addNode(node)
        }
      }
    }
  }

  function updateSelection(renderer: DiagramRenderer) {
    const id = selectedId.value
    const activeComponents = state.value.components.filter((c) => !c._isDeleted)
    const activeRelations = state.value.relations.filter((r) => !r._isDeleted)

    for (const [nodeId, node] of renderer.nodes) {
      const entity = nodeIdToEntity.get(nodeId)
      const isSelected = entity && entity.id === id
      let baseStyle: ResolvedStyle = COMPONENT_STYLE
      if (entity?.kind === "component") {
        const item = activeComponents.find((entry) => entry.id === entity.id)
        baseStyle = item ? resolveComponentStyle(item).style : COMPONENT_STYLE
      } else if (entity?.kind === "relation") {
        const item = activeRelations.find((entry) => entry.id === entity.id)
        baseStyle = item ? resolveRelationStyle(item).style : RELATION_STYLE
      }

      if (isSelected) {
        node.style = { ...baseStyle, ...SELECTED_STYLE }
        node.state = "selected"
      } else {
        node.style = baseStyle
        if (node.state === "selected") {
          node.state = "normal" as ElementState
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

    const selectionManager = new SelectionManager(renderer)
    selectionManagerRef.value = selectionManager

    const interactionManager = renderer.enableInteractions({
      snapToGrid: true,
      gridSize: GRID_SIZE
    })

    navigationManagerRef.value = interactionManager.navigation

    selectionManager.on("select", (nodeIds: string[]) => {
      if (nodeIds.length === 1) {
        const nodeId = nodeIds[0]!
        const entity = nodeIdToEntity.get(nodeId)
        if (entity) {
          onSelect(entity.id, entity.kind)
        }
      }
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

  function destroyRenderer() {
    selectionManagerRef.value = null
    navigationManagerRef.value = null
    rendererRef.value = null
    nodeIdToEntity.clear()
  }

  return {
    rendererRef,
    initRenderer,
    destroyRenderer,
    fitToView,
    resetView
  }
}
