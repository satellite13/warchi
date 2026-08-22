<script setup lang="ts">
import { useVirtualizer } from "@tanstack/vue-virtual"
import { computed, nextTick, ref, toRef, watch } from "vue"
import { useI18n } from "vue-i18n"
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions"
import { compareVersions } from "@/utils/version"
import { parseTypeAttrs } from "@/domain/attrs/notationAttrs"
import type { DiagramLockStatusResponse, ModelSearchHit, NodeTypeResponse } from "@/types/api"
import type {
  ChildrenPageState,
  EditorDiagram,
  EditorNode,
  TreeParentScope,
} from "../types"
import { useTreeSearch } from "../composables"
import LazyIconImg from "@/components/forms/LazyIconImg.vue"
import SearchInput from "@/components/forms/SearchInput.vue"
import EmptyState from "@/components/list/EmptyState.vue"

/** Fixed row height for virtualization (padding 9+9 + btn--icon 24). */
const TREE_ROW_HEIGHT = 42
const TREE_VIRTUAL_OVERSCAN = 10
const DRAG_SCROLL_EDGE_PX = 40
const DRAG_SCROLL_STEP_PX = 18
const EMPTY_DROP_CLASS: Record<string, boolean> = {}

const props = defineProps<{
  nodes: EditorNode[]
  diagrams: EditorDiagram[]
  nodeTypes: NodeTypeResponse[]
  treeRootNodeId?: string | null
  selectedNodeId: string | null
  selectedDiagramId: string | null
  /** Активные блокировки редактирования диаграмм (GET /diagram-locks) */
  diagramLocks?: DiagramLockStatusResponse[]
  currentUserId?: string | null
  modelName?: string
  syncSelectionEnabled?: boolean
  navigationOnlyMode?: boolean
  loadedChildrenFor?: Set<string>
  childrenPages?: Map<string, ChildrenPageState>
  childrenLoading?: Set<string>
  childrenErrors?: Map<string, string>
  searchHits?: ModelSearchHit[]
  searchQuery?: string
  searchLoading?: boolean
  searchError?: string | null
  treeFocusLoading?: boolean
  treeFocusError?: string | null
}>()

const diagramLockById = computed(() => {
  const map = new Map<string, DiagramLockStatusResponse>()
  for (const lock of props.diagramLocks ?? []) {
    if (lock.isLocked) map.set(lock.diagramId, lock)
  }
  return map
})

function diagramLockFor(id: string): DiagramLockStatusResponse | null {
  return diagramLockById.value.get(id) ?? null
}

function diagramLockBadgeTitle(lock: DiagramLockStatusResponse): string {
  const mine = props.currentUserId && lock.lockedByUserId === props.currentUserId
  if (mine) return t("models.diagramLockBadgeYou")
  return t("models.diagramLockBadgeOther", { name: lock.lockedByDisplay || "—" })
}

function isDiagramLockedByCurrentUser(diagramId: string): boolean {
  const lock = diagramLockFor(diagramId)
  if (!lock || !props.currentUserId) return false
  return lock.lockedByUserId === props.currentUserId
}

const emit = defineEmits<{
  selectNode: [nodeId: string]
  openDiagram: [diagramId: string]
  createNode: [parentNodeId: string | null]
  createFolder: [parentNodeId: string | null]
  deleteNode: [nodeId: string]
  createDiagram: [nodeId: string | null]
  deleteDiagram: [diagramId: string]
  moveDiagram: [diagramId: string, newNodeId: string | null]
  moveNode: [nodeId: string, targetNodeId: string | null, position: "above" | "below" | "inside"]
  renameNode: [nodeId: string, name: string]
  renameDiagram: [diagramId: string, name: string]
  copyDiagramToModel: [diagramId: string]
  toggleSyncSelection: []
  loadChildren: [scope: TreeParentScope]
  loadNextChildrenPage: [scope: TreeParentScope]
  searchQueryChange: [query: string]
  selectSearchHit: [hit: ModelSearchHit]
  retrySearch: []
  retryTreeFocus: []
}>()
const { t } = useI18n()

const nodeTypeNameById = computed(() => {
  const map = new Map<string, string>()
  for (const type of props.nodeTypes) map.set(type.id, type.name)
  return map
})

const nodeTypeIconById = computed(() => {
  const map = new Map<string, string>()
  for (const type of props.nodeTypes) {
    const attrs = parseTypeAttrs(type.attrs ?? null)
    const icon = attrs.icon?.trim()
    if (icon) map.set(type.id, icon)
  }
  return map
})

const nodeIndexById = computed(() => {
  const map = new Map<string, number>()
  props.nodes.forEach((node, index) => map.set(node.id, index))
  return map
})

const isDirectory = (node: EditorNode): boolean =>
  (nodeTypeNameById.value.get(node.nodeTypeId) ?? "").trim().toLowerCase() === "directory"

const isSearchHitDirectory = (hit: ModelSearchHit): boolean => {
  if (hit.kind !== "node" || !hit.nodeTypeId) return false
  return (nodeTypeNameById.value.get(hit.nodeTypeId) ?? "").trim().toLowerCase() === "directory"
}

const searchHitTypeIconId = (hit: ModelSearchHit): string | null => {
  if (hit.kind !== "node" || !hit.nodeTypeId) return null
  return nodeTypeIconById.value.get(hit.nodeTypeId) ?? null
}

const searchHitIconName = (hit: ModelSearchHit): string => {
  if (hit.kind === "diagram") return "dashboard"
  if (isSearchHitDirectory(hit)) return DEFAULT_ENTITY_ICONS.folder
  return DEFAULT_ENTITY_ICONS.node
}

const searchHitBreadcrumb = (hit: ModelSearchHit): string | null => {
  if (!hit.pathNames || hit.pathNames.length <= 1) return null
  return hit.pathNames.slice(0, -1).join(" / ")
}

const isRootDiagram = (d: EditorDiagram): boolean => {
  if (d._isDeleted) return false
  if (d.nodeId === null) return true
  return !!props.treeRootNodeId && d.nodeId === props.treeRootNodeId
}

const latestDiagramsByNodeId = computed(() => {
  const map = new Map<string, EditorDiagram[]>()
  for (const diagram of props.diagrams) {
    if (diagram._isDeleted || !diagram.nodeId) continue
    if (props.treeRootNodeId && diagram.nodeId === props.treeRootNodeId) continue
    const key = diagram.nodeId
    const list = map.get(key)
    if (list) list.push(diagram)
    else map.set(key, [diagram])
  }
  const result = new Map<string, EditorDiagram[]>()
  for (const [nodeId, list] of map) {
    const byName = new Map<string, EditorDiagram>()
    for (const d of list) {
      const nameKey = d.name.trim()
      const existing = byName.get(nameKey)
      if (!existing || compareVersions(d.version, existing.version) > 0) {
        byName.set(nameKey, d)
      }
    }
    result.set(nodeId, [...byName.values()])
  }
  return result
})

/** Диаграммы узла: по одному на имя (последняя версия), без baseline-дубликатов в списке */
const nodeDiagrams = (nodeId: string): EditorDiagram[] =>
  latestDiagramsByNodeId.value.get(nodeId) ?? []

const isExpandable = (node: EditorNode): boolean =>
  node.hasChildren === true ||
  (isDirectory(node) && node.hasChildren !== false) ||
  nodeDiagrams(node.id).length > 0

const rootDiagrams = computed<EditorDiagram[]>(() => {
  const list = props.diagrams.filter(isRootDiagram)
  const byName = new Map<string, EditorDiagram>()
  for (const d of list) {
    const key = d.name.trim()
    const existing = byName.get(key)
    if (!existing || compareVersions(d.version, existing.version) > 0) {
      byName.set(key, d)
    }
  }
  return [...byName.values()]
})

const {
  expandedNodes,
  treeSearchQuery,
  normalizedQuery,
  matchingNodeIds,
  nodeById,
  totalNodesCount,
  filteredRootNodes,
  filteredChildNodes,
  childNodes,
  toggleNode,
  collectAncestorIds,
} = useTreeSearch({
  nodes: toRef(props, "nodes"),
  treeRootNodeId: toRef(props, "treeRootNodeId"),
  isDirectory,
  nodeIndexById,
  extraNodeMatches: (node, query) => {
    const diagrams = latestDiagramsByNodeId.value.get(node.id)
    return diagrams?.some((diagram) => diagram.name.toLowerCase().includes(query)) ?? false
  },
})

const visibleRootNodes = computed<EditorNode[]>(() => filteredRootNodes.value)

const visibleChildNodes = (nodeId: string): EditorNode[] => filteredChildNodes(nodeId)

const nodeScope = (nodeId: string): TreeParentScope => ({ kind: "node", nodeId })
const scopeKey = (scope: TreeParentScope): string =>
  scope.kind === "root" ? "root" : `node:${scope.nodeId}`
const isScopeComplete = (scope: TreeParentScope): boolean =>
  props.loadedChildrenFor?.has(scopeKey(scope)) === true
const onToggleNode = (node: EditorNode): void => {
  const wasExpanded = expandedNodes.value.has(node.id)
  toggleNode(node.id)
  if (wasExpanded) return
  const scope = nodeScope(node.id)
  const key = scopeKey(scope)
  if (node.hasChildren !== false && !isScopeComplete(scope) && !props.childrenLoading?.has(key)) {
    emit("loadChildren", scope)
  }
}

const visibleRootDiagrams = computed<EditorDiagram[]>(() => {
  const query = normalizedQuery.value
  if (!query) return rootDiagrams.value
  return rootDiagrams.value.filter(diagram => diagram.name.toLowerCase().includes(query))
})

const visibleNodeDiagrams = (nodeId: string): EditorDiagram[] => {
  const query = normalizedQuery.value
  const diagrams = nodeDiagrams(nodeId)
  if (!query) return diagrams
  return diagrams.filter(diagram => diagram.name.toLowerCase().includes(query))
}

const MAX_SEARCH_TREE_ROWS = 250

// Track which nodes are used in any diagram instance
const usedNodeIds = computed(() => {
  const used = new Set<string>()
  for (const diagram of props.diagrams) {
    if (diagram._isDeleted) continue
    // Light diagram list may omit attrs — skip until hydrated.
    const instances = diagram.parsedAttrs?.instances?.nodes
    if (!instances) continue
    for (const instance of instances) {
      used.add(instance.modelNodeId)
    }
  }
  return used
})

const isNodeUsed = (nodeId: string): boolean => usedNodeIds.value.has(nodeId)

const onDragNodeStart = (event: DragEvent, nodeId: string) => {
  const node = nodeById.value.get(nodeId)
  if (!node || props.navigationOnlyMode) {
    event.preventDefault()
    return
  }
  event.dataTransfer?.setData("application/x-model-node-id", nodeId)
  event.dataTransfer?.setData("text/plain", `node:${nodeId}`)

  const row = event.currentTarget as HTMLElement
  const selectBtn = row.querySelector(".tree-node__select")
  if (selectBtn && event.dataTransfer) {
    const ghost = selectBtn.cloneNode(true) as HTMLElement
    ghost.style.position = "fixed"
    ghost.style.left = "-9999px"
    ghost.style.top = "-9999px"
    ghost.style.display = "inline-flex"
    ghost.style.alignItems = "center"
    ghost.style.gap = "6px"
    ghost.style.padding = "4px 10px"
    ghost.style.borderRadius = "8px"
    ghost.style.background = "var(--surface)"
    ghost.style.border = "1px solid var(--border)"
    ghost.style.fontSize = "13px"
    ghost.style.whiteSpace = "nowrap"
    document.body.appendChild(ghost)
    event.dataTransfer.setDragImage(ghost, 10, 10)
    requestAnimationFrame(() => {
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost)
    })
  }
}

const onDragDiagramStart = (event: DragEvent, diagramId: string) => {
  event.dataTransfer?.setData("application/x-model-diagram-id", diagramId)
  event.dataTransfer?.setData("text/plain", `diagram:${diagramId}`)
}

const treeScrollEl = ref<HTMLElement | null>(null)
const dropTarget = ref<{ nodeId: string | null; position: "above" | "below" | "inside" } | null>(null)
const renamingNodeId = ref<string | null>(null)
const renamingNodeName = ref("")
const renamingDiagramId = ref<string | null>(null)
const renamingDiagramName = ref("")

const isDescendant = (nodeId: string, potentialParentId: string): boolean => {
  const children = childNodes(potentialParentId)
  for (const child of children) {
    if (child.id === nodeId) return true
    if (isDescendant(nodeId, child.id)) return true
  }
  return false
}

const maybeAutoScrollTree = (event: DragEvent): void => {
  const el = treeScrollEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (event.clientY < rect.top + DRAG_SCROLL_EDGE_PX) {
    el.scrollTop -= DRAG_SCROLL_STEP_PX
  } else if (event.clientY > rect.bottom - DRAG_SCROLL_EDGE_PX) {
    el.scrollTop += DRAG_SCROLL_STEP_PX
  }
}

const onTreeDragOver = (event: DragEvent, targetNodeId: string | null) => {
  const isNodeDrag = event.dataTransfer?.types.includes("application/x-model-node-id")
  const isDiagramDrag = event.dataTransfer?.types.includes("application/x-model-diagram-id")
  if (!isNodeDrag && !isDiagramDrag) return
  event.preventDefault()
  maybeAutoScrollTree(event)
  if (!targetNodeId) {
    dropTarget.value = { nodeId: null, position: "inside" }
    return
  }
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const y = event.clientY - rect.top
  const topBand = rect.height * 0.25
  const bottomBand = rect.height * 0.75

  const targetNode = nodeById.value.get(targetNodeId)
  if (!targetNode) {
    dropTarget.value = null
    return
  }

  if (isDiagramDrag) {
    dropTarget.value = isDirectory(targetNode) ? { nodeId: targetNodeId, position: "inside" } : null
    return
  }

  if (isDirectory(targetNode)) {
    if (y < topBand) dropTarget.value = { nodeId: targetNodeId, position: "above" }
    else if (y > bottomBand) dropTarget.value = { nodeId: targetNodeId, position: "below" }
    else dropTarget.value = { nodeId: targetNodeId, position: "inside" }
  } else {
    dropTarget.value = { nodeId: targetNodeId, position: y < rect.height / 2 ? "above" : "below" }
  }
}

const onTreeDragLeave = (event: DragEvent) => {
  const related = event.relatedTarget as Node | null
  const current = event.currentTarget as HTMLElement
  if (related && current.contains(related)) return
  dropTarget.value = null
}

const onTreeDrop = (event: DragEvent, targetNodeId: string | null) => {
  event.preventDefault()
  const draggedNodeId = event.dataTransfer?.getData("application/x-model-node-id")
  const draggedDiagramId = event.dataTransfer?.getData("application/x-model-diagram-id")
  const targetPosition = dropTarget.value?.position ?? "inside"
  dropTarget.value = null
  if (!draggedNodeId && !draggedDiagramId) return

  if (draggedDiagramId) {
    if (!targetNodeId) {
      emit("moveDiagram", draggedDiagramId, null)
      return
    }
    const targetNode = nodeById.value.get(targetNodeId)
    if (!targetNode || !isDirectory(targetNode)) return
    emit("moveDiagram", draggedDiagramId, targetNodeId)
    return
  }

  if (!draggedNodeId || draggedNodeId === targetNodeId) return
  const draggedNode = nodeById.value.get(draggedNodeId)
  if (!draggedNode || props.navigationOnlyMode) return

  // Prevent dropping a node onto its own descendant
  if (targetNodeId && isDescendant(targetNodeId, draggedNodeId)) return
  emit("moveNode", draggedNodeId, targetNodeId, targetPosition)
}

const getDropClass = (nodeId: string): Record<string, boolean> => {
  if (!dropTarget.value || dropTarget.value.nodeId !== nodeId) return EMPTY_DROP_CLASS
  return {
    "tree-node__row--drop-above": dropTarget.value.position === "above",
    "tree-node__row--drop-below": dropTarget.value.position === "below",
    "tree-node__row--drop-inside": dropTarget.value.position === "inside",
  }
}

const startRenameNode = (node: EditorNode) => {
  renamingNodeId.value = node.id
  renamingNodeName.value = node.name
}

const cancelRenameNode = () => {
  renamingNodeId.value = null
  renamingNodeName.value = ""
}

const commitRenameNode = (node: EditorNode) => {
  const nextName = renamingNodeName.value.trim()
  if (!nextName) {
    cancelRenameNode()
    return
  }
  if (nextName !== node.name) {
    emit("renameNode", node.id, nextName)
  }
  cancelRenameNode()
}

const startRenameDiagram = (diagram: EditorDiagram) => {
  renamingDiagramId.value = diagram.id
  renamingDiagramName.value = diagram.name
}

const cancelRenameDiagram = () => {
  renamingDiagramId.value = null
  renamingDiagramName.value = ""
}

const commitRenameDiagram = (diagram: EditorDiagram) => {
  const nextName = renamingDiagramName.value.trim()
  if (!nextName) {
    cancelRenameDiagram()
    return
  }
  if (nextName !== diagram.name) {
    emit("renameDiagram", diagram.id, nextName)
  }
  cancelRenameDiagram()
}

type TreeNodeRow = {
  kind: "node"
  node: EditorNode
  depth: number
}

type TreeDiagramRow = {
  kind: "diagram"
  nodeId: string | null
  diagram: EditorDiagram
  depth: number
}

type TreeStatusRow = {
  kind: "loading" | "error" | "loadMore"
  scope: TreeParentScope
  depth: number
  message?: string
}

type TreeSearchRow = {
  kind: "search"
  hit: ModelSearchHit
}

type TreeRow = TreeNodeRow | TreeDiagramRow | TreeStatusRow | TreeSearchRow

const treeRows = computed<{ rows: TreeRow[]; truncated: boolean }>(() => {
  const rows: TreeRow[] = []
  const query = normalizedQuery.value
  const limit = query ? MAX_SEARCH_TREE_ROWS : Number.POSITIVE_INFINITY

  if (query && props.searchHits !== undefined) {
    for (const hit of props.searchHits.slice(0, limit)) {
      rows.push({ kind: "search", hit })
    }
    return { rows, truncated: props.searchHits.length > limit }
  }

  const pushRow = (row: TreeRow): boolean => {
    rows.push(row)
    return rows.length >= limit
  }

  const pushScopeStatus = (scope: TreeParentScope, depth: number): boolean => {
    const key = scopeKey(scope)
    if (props.childrenLoading?.has(key)) {
      if (pushRow({ kind: "loading", scope, depth })) return true
    }
    const branchError = props.childrenErrors?.get(key)
    if (branchError) {
      if (pushRow({ kind: "error", scope, depth, message: branchError })) return true
    }
    if (props.childrenPages?.get(key)?.nextPage != null) {
      if (pushRow({ kind: "loadMore", scope, depth })) return true
    }
    return false
  }

  for (const diagram of visibleRootDiagrams.value) {
    if (pushRow({ kind: "diagram", nodeId: null, diagram, depth: 0 })) {
      return { rows, truncated: !!query }
    }
  }

  const pushNode = (node: EditorNode, depth: number): boolean => {
    if (pushRow({ kind: "node", node, depth })) return true
    if (!isExpandable(node) || !expandedNodes.value.has(node.id)) return false
    for (const diagram of visibleNodeDiagrams(node.id)) {
      if (pushRow({ kind: "diagram", nodeId: node.id, diagram, depth: depth + 1 })) return true
    }
    for (const child of visibleChildNodes(node.id)) {
      if (pushNode(child, depth + 1)) return true
    }
    return pushScopeStatus(nodeScope(node.id), depth + 1)
  }

  for (const rootNode of visibleRootNodes.value) {
    if (pushNode(rootNode, 0)) {
      return { rows, truncated: !!query }
    }
  }
  if (pushScopeStatus({ kind: "root" }, 0)) {
    return { rows, truncated: !!query }
  }
  return { rows, truncated: false }
})

const visibleTreeRows = computed(() => treeRows.value.rows)
const searchResultsTruncated = computed(() => treeRows.value.truncated)

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: visibleTreeRows.value.length,
    getScrollElement: () => treeScrollEl.value,
    estimateSize: () => TREE_ROW_HEIGHT,
    overscan: TREE_VIRTUAL_OVERSCAN,
    // Fallback until scroll parent is measured (also helps happy-dom tests).
    initialRect: { width: 320, height: 480 },
  })),
)

const virtualTreeItems = computed(() =>
  rowVirtualizer.value.getVirtualItems().flatMap((vRow) => {
    const row = visibleTreeRows.value[vRow.index]
    if (!row) return []
    return [{ vRow, row }]
  }),
)

const expandToNode = (nodeId: string): void => {
  const chain: string[] = []
  let current = nodeById.value.get(nodeId)
  while (current?.parentNodeId) {
    chain.push(current.parentNodeId)
    current = nodeById.value.get(current.parentNodeId)
  }
  const next = new Set(expandedNodes.value)
  for (const id of chain) next.add(id)
  expandedNodes.value = next
}

const expandPath = (nodeIds: readonly string[]): void => {
  const next = new Set(expandedNodes.value)
  for (const id of nodeIds) next.add(id)
  expandedNodes.value = next
}

const scrollToTreeIndex = async (
  index: number,
  isCurrent: () => boolean = () => true
): Promise<void> => {
  if (index < 0 || !isCurrent()) return
  await nextTick()
  if (!isCurrent()) return
  rowVirtualizer.value.scrollToIndex(index, { align: "auto" })
  await nextTick()
}

const focusNode = async (
  nodeId: string,
  isCurrent: () => boolean = () => true
): Promise<void> => {
  if (!isCurrent()) return
  expandToNode(nodeId)
  await nextTick()
  if (!isCurrent()) return
  const index = visibleTreeRows.value.findIndex(
    (row) => row.kind === "node" && row.node.id === nodeId,
  )
  await scrollToTreeIndex(index, isCurrent)
}

const focusDiagram = async (
  diagramId: string,
  isCurrent: () => boolean = () => true
): Promise<void> => {
  if (!isCurrent()) return
  const diagram = props.diagrams.find((d) => d.id === diagramId && !d._isDeleted)
  if (diagram?.nodeId && !(props.treeRootNodeId && diagram.nodeId === props.treeRootNodeId)) {
    expandToNode(diagram.nodeId)
    // Ensure the parent folder itself is expanded so the diagram row is visible
    const next = new Set(expandedNodes.value)
    next.add(diagram.nodeId)
    expandedNodes.value = next
  }
  await nextTick()
  if (!isCurrent()) return
  const index = visibleTreeRows.value.findIndex(
    (row) => row.kind === "diagram" && row.diagram.id === diagramId,
  )
  await scrollToTreeIndex(index, isCurrent)
}

watch(normalizedQuery, (query, prev) => {
  if (query) {
    if (props.searchHits !== undefined) return
    const next = new Set(expandedNodes.value)
    for (const id of collectAncestorIds(matchingNodeIds.value)) {
      next.add(id)
    }
    for (const id of matchingNodeIds.value) {
      const node = nodeById.value.get(id)
      if (node && isDirectory(node)) next.add(id)
    }
    expandedNodes.value = next
    return
  }
  // Leaving search mode
  if (!prev) return
  if (props.selectedNodeId) {
    focusNode(props.selectedNodeId)
    return
  }
  if (props.selectedDiagramId) {
    focusDiagram(props.selectedDiagramId)
  }
})

watch(treeSearchQuery, query => emit("searchQueryChange", query))

watch(
  () => props.searchQuery,
  query => {
    if (query === undefined || query === treeSearchQuery.value) return
    treeSearchQuery.value = query
  },
)

defineExpose({ expandToNode, expandPath, focusNode, focusDiagram })
</script>

<template>
  <div class="panel">
    <div class="panel__header">
      <div class="panel__title-row">
        <h3 class="panel__title">{{ modelName || t("models.entityName") }}</h3>
        <span v-if="totalNodesCount > 0" class="panel__count">{{ totalNodesCount }}</span>
      </div>
      <div class="panel__header-actions">
        <button
          type="button"
          class="btn--icon"
          :class="{ 'btn--icon--active': !!syncSelectionEnabled }"
          :title="syncSelectionEnabled ? t('models.disableSelectionSync') : t('models.enableSelectionSync')"
          @click="emit('toggleSyncSelection')"
        >
          <UiIcon name="sync_alt" />
        </button>
        <button type="button" class="btn--icon" :title="t('models.addRootFolder')" @click="emit('createFolder', null)">
          <UiIcon name="create_new_folder" />
        </button>
        <button type="button" class="btn--icon" :title="t('models.addRootNode')" @click="emit('createNode', null)">
          <UiIcon name="add_box" />
        </button>
        <button type="button" class="btn--icon" :title="t('models.createDiagramTitle')" @click="emit('createDiagram', null)">
          <UiIcon name="dashboard" />
        </button>
      </div>
    </div>

    <div class="panel__search">
      <SearchInput v-model="treeSearchQuery" compact :placeholder="t('common.search')" />
    </div>

    <div
      ref="treeScrollEl"
      class="tree"
      @dragover.self.prevent="onTreeDragOver($event, null)"
      @drop.self.prevent="onTreeDrop($event, null)"
    >
      <EmptyState
        v-if="
          visibleTreeRows.length === 0 &&
          !searchLoading &&
          !searchError &&
          !treeFocusLoading &&
          !treeFocusError
        "
        variant="compact"
        icon="account_tree"
        :title="normalizedQuery ? t('models.noSearchResults') : t('models.noNodes')"
        :description="normalizedQuery ? '' : t('models.createFolderOrNodeHint')"
      />
      <div v-if="searchResultsTruncated" class="tree__truncated">
        {{ t('models.searchResultsTruncated', { count: MAX_SEARCH_TREE_ROWS }) }}
      </div>
      <div v-if="normalizedQuery && searchLoading" data-tree-search-loading class="tree-search-status" role="status">
        {{ t("models.treeSearchLoading") }}
      </div>
      <div
        v-if="normalizedQuery && searchError"
        data-tree-search-error
        class="tree-search-status tree-search-status--error"
        role="status"
      >
        <span>{{ t("models.treeSearchError") }}</span>
        <button type="button" class="tree-status-row__action" @click="emit('retrySearch')">
          {{ t("common.retry") }}
        </button>
      </div>
      <div
        v-if="treeFocusLoading"
        data-tree-focus-loading
        class="tree-search-status"
        role="status"
      >
        {{ t("models.treeFocusLoading") }}
      </div>
      <div
        v-if="treeFocusError"
        data-tree-focus-error
        class="tree-search-status tree-search-status--error"
        role="status"
      >
        <span>{{ treeFocusError }}</span>
        <button type="button" class="tree-status-row__action" @click="emit('retryTreeFocus')">
          {{ t("common.retry") }}
        </button>
      </div>
      <div
        v-if="visibleTreeRows.length > 0"
        class="tree__virtual"
        :style="{ height: `${rowVirtualizer.getTotalSize()}px` }"
      >
        <div
          v-for="{ vRow, row } in virtualTreeItems"
          :key="String(vRow.key)"
          class="tree__virtual-item"
          :style="{
            height: `${vRow.size}px`,
            transform: `translateY(${vRow.start}px)`,
          }"
        >
          <div v-if="row.kind === 'node'" class="tree-node">
            <div
              class="tree-node__row tree-node__row--flattened"
              :class="{ 'tree-node__row--active': selectedNodeId === row.node.id, ...getDropClass(row.node.id) }"
              :style="{ '--tree-depth': String(row.depth) }"
              :data-tree-node-id="row.node.id"
              :draggable="!props.navigationOnlyMode"
              @dragstart="onDragNodeStart($event, row.node.id)"
              @dragover.prevent="onTreeDragOver($event, row.node.id)"
              @dragleave="onTreeDragLeave"
              @drop.prevent="onTreeDrop($event, row.node.id)"
            >
              <button
                v-if="isExpandable(row.node)"
                type="button"
                class="tree-node__toggle"
                :aria-expanded="expandedNodes.has(row.node.id)"
                :aria-label="
                  expandedNodes.has(row.node.id)
                    ? t('models.collapseTreeNode', { name: row.node.name })
                    : t('models.expandTreeNode', { name: row.node.name })
                "
                @click="onToggleNode(row.node)"
              >
                <UiIcon :name="expandedNodes.has(row.node.id) ? 'expand_more' : 'chevron_right'" />
              </button>
              <button
                type="button"
                class="tree-node__select"
                :class="{ 'tree-node__select--unused': !isDirectory(row.node) && !isNodeUsed(row.node.id) }"
                @click="emit('selectNode', row.node.id)"
                @dblclick="isExpandable(row.node) && onToggleNode(row.node)"
              >
                <LazyIconImg
                  v-if="nodeTypeIconById.get(row.node.nodeTypeId)"
                  :icon-id="nodeTypeIconById.get(row.node.nodeTypeId)!"
                  :alt="row.node.name"
                  img-class="tree-node__icon-svg"
                  eager
                />
                <UiIcon
                  v-else
                  :name="isDirectory(row.node) ? DEFAULT_ENTITY_ICONS.folder : DEFAULT_ENTITY_ICONS.node"
                  class="tree-node__icon-symbol"
                />
                <input
                  v-if="renamingNodeId === row.node.id"
                  v-model="renamingNodeName"
                  class="tree-node__rename-input"
                  type="text"
                  @click.stop
                  @keydown.enter.prevent="commitRenameNode(row.node)"
                  @keydown.esc.prevent="cancelRenameNode"
                  @blur="commitRenameNode(row.node)"
                >
                <span
                  v-else
                  class="tree-node__name"
                  :class="{
                    'tree-node__name--ancestor':
                      !!normalizedQuery && !matchingNodeIds.has(row.node.id),
                  }"
                >{{ row.node.name }}</span>
              </button>
              <div class="tree-node__actions">
                <button
                  v-if="isDirectory(row.node)"
                  type="button"
                  class="btn--icon"
                  :title="t('models.addChildFolder')"
                  @click.stop="emit('createFolder', row.node.id)"
                >
                  <UiIcon name="create_new_folder" />
                </button>
                <button
                  v-if="isDirectory(row.node)"
                  type="button"
                  class="btn--icon"
                  :title="t('models.addChildNode')"
                  @click.stop="emit('createNode', row.node.id)"
                >
                  <UiIcon name="add_box" />
                </button>
                <button
                  v-if="isDirectory(row.node)"
                  type="button"
                  class="btn--icon"
                  :title="t('models.createDiagramTitle')"
                  @click.stop="emit('createDiagram', row.node.id)"
                >
                  <UiIcon name="dashboard" />
                </button>
                <button
                  v-if="isDirectory(row.node)"
                  type="button"
                  class="btn--icon"
                  :title="t('models.renameFolder')"
                  @click.stop="startRenameNode(row.node)"
                >
                  <UiIcon name="edit" />
                </button>
                <button
                  type="button"
                  class="btn--icon btn--icon--danger"
                  :title="t('common.delete')"
                  @click.stop="emit('deleteNode', row.node.id)"
                >
                  <UiIcon name="delete" />
                </button>
              </div>
            </div>
          </div>

          <div
            v-else-if="row.kind === 'diagram'"
            class="diagram-row diagram-row--flattened"
            :class="{ 'diagram-row--active': selectedDiagramId === row.diagram.id }"
            :style="{ '--tree-depth': String(row.depth) }"
            :data-tree-diagram-id="row.diagram.id"
            :draggable="!props.navigationOnlyMode"
            @dragstart="onDragDiagramStart($event, row.diagram.id)"
          >
            <button
              v-if="renamingDiagramId !== row.diagram.id"
              type="button"
              class="diagram-row__select"
              :title="t('models.openDiagramDoubleClick')"
              @dblclick="emit('openDiagram', row.diagram.id)"
            >
              <UiIcon name="dashboard" />
              <span>{{ row.diagram.name }}</span>
              <span
                v-if="diagramLockFor(row.diagram.id)"
                class="diagram-row__lock-pip"
                :class="{ 'diagram-row__lock-pip--own': isDiagramLockedByCurrentUser(row.diagram.id) }"
                :title="diagramLockBadgeTitle(diagramLockFor(row.diagram.id)!)"
              >
                <svg class="diagram-row__lock-pip-icon" viewBox="0 0 12 12" fill="none">
                  <rect x="2" y="5.5" width="8" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2" />
                  <path d="M3.5 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                </svg>
              </span>
              <span v-if="selectedDiagramId === row.diagram.id" class="diagram-row__badge">{{ t("models.diagramOpened") }}</span>
            </button>
            <div v-else class="diagram-row__select diagram-row__rename-wrap">
              <UiIcon name="dashboard" />
              <input
                v-model="renamingDiagramName"
                class="diagram-row__rename-input"
                type="text"
                @click.stop
                @keydown.enter.prevent="commitRenameDiagram(row.diagram)"
                @keydown.esc.prevent="cancelRenameDiagram"
                @blur="commitRenameDiagram(row.diagram)"
              >
            </div>
            <button
              v-if="renamingDiagramId !== row.diagram.id"
              type="button"
              class="btn--icon diagram-row__edit-btn"
              :title="t('models.renameDiagram')"
              @click.stop="startRenameDiagram(row.diagram)"
            >
              <UiIcon name="edit" />
            </button>
            <button
              type="button"
              class="btn--icon btn--icon--danger"
              @click="emit('deleteDiagram', row.diagram.id)"
            >
              <UiIcon name="delete" />
            </button>
          <button
            type="button"
            class="btn--icon diagram-row__copy-btn"
            :title="t('models.diagramCopy.title')"
            @click.stop="emit('copyDiagramToModel', row.diagram.id)"
          >
            <UiIcon name="content_copy" />
          </button>
          </div>
          <div
            v-else-if="row.kind === 'search'"
            class="tree-node"
            :data-tree-search-hit-id="row.hit.id"
          >
            <div class="tree-node__row tree-node__row--flattened">
              <span class="tree-node__toggle" aria-hidden="true"></span>
              <button
                type="button"
                class="tree-node__select tree-search-hit__select"
                @click="emit('selectSearchHit', row.hit)"
              >
                <LazyIconImg
                  v-if="searchHitTypeIconId(row.hit)"
                  :icon-id="searchHitTypeIconId(row.hit)!"
                  :alt="row.hit.name || row.hit.id"
                  img-class="tree-node__icon-svg"
                />
                <UiIcon
                  v-else
                  :name="searchHitIconName(row.hit)"
                  class="tree-node__icon-symbol"
                />
                <span class="tree-search-hit__label">
                  <span class="tree-node__name">{{ row.hit.name || row.hit.id }}</span>
                  <span
                    v-if="searchHitBreadcrumb(row.hit)"
                    class="tree-search-hit__breadcrumb"
                    :aria-label="t('models.searchHitPath', { path: searchHitBreadcrumb(row.hit) })"
                  >
                    {{ searchHitBreadcrumb(row.hit) }}
                  </span>
                </span>
              </button>
            </div>
          </div>
          <div
            v-else
            class="tree-status-row"
            :style="{ '--tree-depth': String(row.depth) }"
            :data-tree-loading="row.kind === 'loading' ? '' : undefined"
            :data-tree-error="row.kind === 'error' ? '' : undefined"
            :data-tree-load-more="row.kind === 'loadMore' ? '' : undefined"
            :role="row.kind === 'loading' || row.kind === 'error' ? 'status' : undefined"
            :aria-live="row.kind === 'loading' || row.kind === 'error' ? 'polite' : undefined"
          >
            <span v-if="row.kind === 'loading'">{{ t("models.treeLoading") }}</span>
            <template v-else-if="row.kind === 'error'">
              <span :title="row.message">{{ t("models.treeLoadError") }}</span>
              <button type="button" class="tree-status-row__action" @click="emit('loadChildren', row.scope)">
                {{ t("common.retry") }}
              </button>
            </template>
            <button
              v-else
              type="button"
              class="tree-status-row__action"
              @click="emit('loadNextChildrenPage', row.scope)"
            >
              {{ t("models.treeLoadMore") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding: 14px 16px;
  flex-shrink: 0;
}

.panel__title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.panel__title {
  margin: 0;
  font-size: var(--heading-font-size, 14px);
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: var(--heading-letter-spacing, -0.01em);
}

.panel__count {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 2px 9px;
  border-radius: 12px;
  font-variant-numeric: tabular-nums;
}

.panel__header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.panel__search {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.panel__search :deep(.search-box) {
  width: 100%;
}

.tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px;
  border-bottom: 1px solid var(--border);
  position: relative;
}

.tree__virtual {
  position: relative;
  width: 100%;
}

.tree__virtual-item {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  box-sizing: border-box;
}

.tree__truncated {
  margin: 0 10px 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface-muted);
}

.tree-search-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 10px 8px;
  color: var(--text-muted);
  font-size: 12px;
}

.tree-search-status--error {
  color: var(--danger);
}

.tree-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding-left: calc(42px + (var(--tree-depth, 0) * 16px));
  color: var(--text-muted);
  font-size: 12px;
}

.tree-status-row__action {
  border: 0;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  font: inherit;
  padding: 0;
}

.tree-node {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tree-node__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border-radius: 8px;
  border-left: 3px solid transparent;
  box-sizing: border-box;
  transition: background 0.15s ease, border-left-color 0.15s ease;
}

.tree-node__row--flattened {
  padding-left: calc(10px + (var(--tree-depth, 0) * 16px));
}

.tree-node__row:hover {
  background: var(--surface-strong);
}

.tree-node__row:not(.tree-node__row--active):hover {
  border-left-color: rgba(124, 92, 252, 0.3);
}

.tree-node__row--active {
  background: var(--primary-soft);
  border-left-color: var(--primary);
}

.tree-node__row--active:hover {
  background: var(--primary-soft);
}

.tree-node__row--drop-above {
  border-top: 2px solid var(--primary);
}

.tree-node__row--drop-below {
  border-bottom: 2px solid var(--primary);
}

.tree-node__row--drop-inside {
  background: var(--primary-soft);
  outline: 2px dashed var(--primary);
  outline-offset: -2px;
}

.tree-node__toggle {
  border: none;
  background: transparent;
  color: var(--text-subtle);
  width: 24px;
  height: 24px;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tree-node__toggle .ui-icon {
  width: 18px;
  height: 18px;
}

.tree-node__select {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  text-align: left;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--base-text);
  cursor: pointer;
  font-family: inherit;
}

.tree-node__select--unused .tree-node__name {
  font-style: italic;
  color: var(--text-subtle);
}

.tree-node__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
}

.tree-node__name--ancestor {
  color: var(--text-subtle);
  font-weight: 400;
}

.tree-search-hit__select {
  align-items: flex-start;
}

.tree-search-hit__label {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.tree-search-hit__breadcrumb {
  color: var(--text-subtle);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-node__rename-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--primary);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
  font-size: 13px;
  font-family: inherit;
  padding: 2px 6px;
  outline: none;
}

.tree-node__icon-symbol,
.tree-node__icon-svg,
.tree-node__select :deep(.tree-node__icon-symbol),
.diagram-row__select :deep(.ui-icon),
.diagram-row__rename-wrap :deep(.ui-icon) {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--text-subtle);
}

.tree-node__icon-svg {
  object-fit: contain;
}

.tree-node__row--active .tree-node__icon-symbol,
.tree-node__row--active .tree-node__icon-svg {
  color: var(--primary);
}

.tree-node__actions {
  display: none;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.tree-node__row--active .tree-node__actions,
.tree-node__row:hover .tree-node__actions {
  display: flex;
}

.diagram-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  height: 100%;
  padding: 9px 10px;
  margin-left: 14px;
  border-radius: 8px;
  border-left: 3px solid transparent;
  box-sizing: border-box;
  transition: background 0.15s ease, border-left-color 0.15s ease;
}

.diagram-row--flattened {
  margin-left: 0;
  padding-left: calc(10px + (var(--tree-depth, 0) * 16px));
}

.diagram-row:hover {
  background: var(--surface-strong);
}

.diagram-row:not(.diagram-row--active):hover {
  border-left-color: color-mix(in srgb, var(--accent) 65%, transparent);
}

.diagram-row .btn--icon--danger,
.diagram-row .diagram-row__edit-btn,
.diagram-row .diagram-row__copy-btn {
  display: none;
  flex-shrink: 0;
}

.diagram-row--active .btn--icon--danger,
.diagram-row--active .diagram-row__edit-btn,
.diagram-row--active .diagram-row__copy-btn,
.diagram-row:hover .btn--icon--danger,
.diagram-row:hover .diagram-row__edit-btn,
.diagram-row:hover .diagram-row__copy-btn {
  display: flex;
}

.diagram-row--active {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-left-color: var(--accent);
}

.diagram-row--active:hover {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}

.diagram-row__select {
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  cursor: pointer;
  flex: 1;
  min-width: 0;
  font-family: inherit;
}

.diagram-row--active .diagram-row__select {
  color: var(--accent);
}

.diagram-row__badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 999px;
  padding: 1px 6px;
  margin-left: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

.diagram-row__lock-pip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  border-radius: 5px;
  background: var(--warning-soft);
  color: var(--warning);
  flex-shrink: 0;
  animation: lock-pip-appear 0.2s ease;
}

.diagram-row__lock-pip--own {
  background: var(--success-soft);
  color: var(--success);
}

.diagram-row__lock-pip-icon {
  width: 12px;
  height: 12px;
}

@keyframes lock-pip-appear {
  from {
    opacity: 0;
    transform: scale(0.7);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.diagram-row__rename-wrap {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.diagram-row__rename-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  background: var(--surface);
  color: var(--base-text);
}

.diagram-row__rename-input:focus {
  outline: none;
  border-color: var(--primary);
}

</style>
