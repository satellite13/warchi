<script setup lang="ts">
import { computed, nextTick, ref, toRef } from "vue"
import { useI18n } from "vue-i18n"
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions"
import { compareVersions } from "../../../utils/version"
import { parseTypeAttrs } from "../../notations/notationAttrs"
import type { DiagramLockStatusResponse, NodeTypeResponse } from "../../../types/api"
import type { EditorDiagram, EditorNode } from "../types"
import { useTreeSearch } from "../composables/useTreeSearch"

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
}>()

const diagramLocksResolved = computed(() => props.diagramLocks ?? [])

function diagramLockFor(id: string): DiagramLockStatusResponse | null {
  return diagramLocksResolved.value.find((l) => l.diagramId === id && l.isLocked) ?? null
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
  createDiagram: [nodeId: string]
  deleteDiagram: [diagramId: string]
  moveDiagram: [diagramId: string, newNodeId: string]
  moveNode: [nodeId: string, targetNodeId: string | null, position: "above" | "below" | "inside"]
  renameNode: [nodeId: string, name: string]
  renameDiagram: [diagramId: string, name: string]
  toggleSyncSelection: []
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

const {
  expandedNodes,
  treeSearchQuery,
  totalNodesCount,
  filteredRootNodes,
  filteredChildNodes,
  childNodes,
  toggleNode,
} = useTreeSearch({
  nodes: toRef(props, 'nodes'),
  treeRootNodeId: toRef(props, 'treeRootNodeId'),
  isDirectory,
  nodeIndexById,
})

/** Диаграммы узла: по одному на имя (последняя версия), без baseline-дубликатов в списке */
const nodeDiagrams = (nodeId: string): EditorDiagram[] => {
  const list = props.diagrams.filter((d) => d.nodeId === nodeId && !d._isDeleted)
  const byName = new Map<string, EditorDiagram>()
  for (const d of list) {
    const key = d.name.trim()
    const existing = byName.get(key)
    if (!existing || compareVersions(d.version, existing.version) > 0) {
      byName.set(key, d)
    }
  }
  return [...byName.values()]
}

// Track which nodes are used in any diagram instance
const usedNodeIds = computed(() => {
  const used = new Set<string>()
  for (const diagram of props.diagrams) {
    if (diagram._isDeleted) continue
    for (const instance of diagram.parsedAttrs.instances.nodes) {
      used.add(instance.modelNodeId)
    }
  }
  return used
})

const isNodeUsed = (nodeId: string): boolean => usedNodeIds.value.has(nodeId)

const onDragNodeStart = (event: DragEvent, nodeId: string) => {
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
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }
}

const onDragDiagramStart = (event: DragEvent, diagramId: string) => {
  event.dataTransfer?.setData("application/x-model-diagram-id", diagramId)
  event.dataTransfer?.setData("text/plain", `diagram:${diagramId}`)
}

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

const onTreeDragOver = (event: DragEvent, targetNodeId: string | null) => {
  const isNodeDrag = event.dataTransfer?.types.includes("application/x-model-node-id")
  const isDiagramDrag = event.dataTransfer?.types.includes("application/x-model-diagram-id")
  if (!isNodeDrag && !isDiagramDrag) return
  event.preventDefault()
  if (!targetNodeId) {
    dropTarget.value = { nodeId: null, position: "inside" }
    return
  }
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const y = event.clientY - rect.top
  const topBand = rect.height * 0.25
  const bottomBand = rect.height * 0.75

  const targetNode = props.nodes.find((n) => n.id === targetNodeId)
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
    if (!targetNodeId) return
    const targetNode = props.nodes.find((n) => n.id === targetNodeId)
    if (!targetNode || !isDirectory(targetNode)) return
    emit("moveDiagram", draggedDiagramId, targetNodeId)
    return
  }

  if (!draggedNodeId || draggedNodeId === targetNodeId) return

  // Prevent dropping a node onto its own descendant
  if (targetNodeId && isDescendant(targetNodeId, draggedNodeId)) return

  emit("moveNode", draggedNodeId, targetNodeId, targetPosition)
}

const getDropClass = (nodeId: string) => {
  if (!dropTarget.value || dropTarget.value.nodeId !== nodeId) return {}
  return {
    "tree-node__row--drop-above": dropTarget.value.position === "above",
    "tree-node__row--drop-below": dropTarget.value.position === "below",
    "tree-node__row--drop-inside": dropTarget.value.position === "inside"
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

const expandToNode = (nodeId: string) => {
  const chain: string[] = []
  let current = props.nodes.find((n) => n.id === nodeId)
  while (current?.parentNodeId) {
    chain.push(current.parentNodeId)
    current = props.nodes.find((n) => n.id === current!.parentNodeId)
  }
  const next = new Set(expandedNodes.value)
  for (const id of chain) next.add(id)
  expandedNodes.value = next
}

const focusNode = (nodeId: string) => {
  expandToNode(nodeId)
  nextTick(() => {
    const row = document.querySelector(`[data-tree-node-id="${nodeId}"]`) as HTMLElement | null
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  })
}

type TreeNodeRow = {
  kind: "node"
  node: EditorNode
  depth: number
}

type TreeDiagramRow = {
  kind: "diagram"
  nodeId: string
  diagram: EditorDiagram
  depth: number
}

type TreeRow = TreeNodeRow | TreeDiagramRow

const treeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = []

  const pushNode = (node: EditorNode, depth: number) => {
    rows.push({ kind: "node", node, depth })
    if (!isDirectory(node) || !expandedNodes.value.has(node.id)) return
    for (const diagram of nodeDiagrams(node.id)) {
      rows.push({ kind: "diagram", nodeId: node.id, diagram, depth: depth + 1 })
    }
    for (const child of filteredChildNodes(node.id)) {
      pushNode(child, depth + 1)
    }
  }

  for (const rootNode of filteredRootNodes.value) {
    pushNode(rootNode, 0)
  }
  return rows
})

defineExpose({ expandToNode, focusNode })
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
          class="mini-btn"
          :class="{ 'mini-btn--active': !!syncSelectionEnabled }"
          :title="syncSelectionEnabled ? t('models.disableSelectionSync') : t('models.enableSelectionSync')"
          @click="emit('toggleSyncSelection')"
        >
          <UiIcon name="swap_horiz" />
        </button>
        <button type="button" class="mini-btn" :title="t('models.addRootFolder')" @click="emit('createFolder', null)">
          <UiIcon name="create_new_folder" />
        </button>
        <button type="button" class="mini-btn" :title="t('models.addRootNode')" @click="emit('createNode', null)">
          <UiIcon name="add_box" />
        </button>
      </div>
    </div>

    <div class="panel__search">
      <div class="panel__search-wrap">
        <UiIcon name="search" class="panel__search-icon" />
        <input
          v-model="treeSearchQuery"
          type="text"
          class="panel__search-input"
          :placeholder="t('common.search')"
        >
        <button
          v-if="treeSearchQuery"
          type="button"
          class="panel__search-clear"
          :title="t('common.clearSearch')"
          @click="treeSearchQuery = ''"
        >
          <UiIcon name="close" />
        </button>
      </div>
    </div>

    <div
      class="tree"
      @dragover.self.prevent="onTreeDragOver($event, null)"
      @drop.self.prevent="onTreeDrop($event, null)"
    >
      <div v-if="treeRows.length === 0" class="tree__empty">
        <UiIcon name="account_tree" class="tree__empty-icon" />
        <span class="tree__empty-text">{{ t("models.noNodes") }}</span>
        <span class="tree__empty-hint">{{ t("models.createFolderOrNodeHint") }}</span>
      </div>
      <template v-for="row in treeRows" :key="row.kind === 'node' ? row.node.id : row.diagram.id">
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
              v-if="isDirectory(row.node)"
              type="button"
              class="tree-node__toggle"
              @click="toggleNode(row.node.id)"
            >
              <UiIcon :name="expandedNodes.has(row.node.id) ? 'expand_more' : 'chevron_right'" />
            </button>
            <button
              type="button"
              class="tree-node__select"
              :class="{ 'tree-node__select--unused': !isDirectory(row.node) && !isNodeUsed(row.node.id) }"
              @click="emit('selectNode', row.node.id)"
              @dblclick="isDirectory(row.node) && toggleNode(row.node.id)"
            >
              <img
                v-if="nodeTypeIconById.get(row.node.nodeTypeId)"
                class="tree-node__icon-svg"
                :src="`/icons/${nodeTypeIconById.get(row.node.nodeTypeId)}.svg`"
                :alt="row.node.name"
              >
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
              <span v-else class="tree-node__name">{{ row.node.name }}</span>
              <span v-if="!isDirectory(row.node)" class="tree-node__type">{{ nodeTypeNameById.get(row.node.nodeTypeId) }}</span>
            </button>
            <div class="tree-node__actions">
              <button
                v-if="isDirectory(row.node)"
                type="button"
                class="mini-btn"
                :title="t('models.addChildFolder')"
                @click.stop="emit('createFolder', row.node.id)"
              >
                <UiIcon name="create_new_folder" />
              </button>
              <button
                v-if="isDirectory(row.node)"
                type="button"
                class="mini-btn"
                :title="t('models.addChildNode')"
                @click.stop="emit('createNode', row.node.id)"
              >
                <UiIcon name="add_box" />
              </button>
              <button
                v-if="isDirectory(row.node)"
                type="button"
                class="mini-btn"
                :title="t('models.createDiagramTitle')"
                @click.stop="emit('createDiagram', row.node.id)"
              >
                <UiIcon name="add_chart" />
              </button>
              <button
                v-if="isDirectory(row.node)"
                type="button"
                class="mini-btn"
                :title="t('models.renameFolder')"
                @click.stop="startRenameNode(row.node)"
              >
                <UiIcon name="edit" />
              </button>
              <button
                type="button"
                class="mini-btn mini-btn--danger"
                :title="t('common.delete')"
                @click.stop="emit('deleteNode', row.node.id)"
              >
                <UiIcon name="delete" />
              </button>
            </div>
          </div>
        </div>

        <div
          v-else
          class="diagram-row diagram-row--flattened"
          :class="{ 'diagram-row--active': selectedDiagramId === row.diagram.id }"
          :style="{ '--tree-depth': String(row.depth) }"
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
            <UiIcon name="table_chart" />
            <span>{{ row.diagram.name }}</span>
            <span
              v-if="diagramLockFor(row.diagram.id)"
              class="diagram-row__badge diagram-row__badge--lock"
              :class="{ 'diagram-row__badge--lock-own': isDiagramLockedByCurrentUser(row.diagram.id) }"
              :title="diagramLockBadgeTitle(diagramLockFor(row.diagram.id)!)"
            >
              <UiIcon name="lock" class="diagram-row__lock-icon" />
            </span>
            <span v-if="selectedDiagramId === row.diagram.id" class="diagram-row__badge">{{ t("models.diagramOpened") }}</span>
          </button>
          <div v-else class="diagram-row__select diagram-row__rename-wrap">
            <UiIcon name="table_chart" />
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
            class="mini-btn diagram-row__edit-btn"
            :title="t('models.renameDiagram')"
            @click.stop="startRenameDiagram(row.diagram)"
          >
            <UiIcon name="edit" />
          </button>
          <button
            type="button"
            class="mini-btn mini-btn--danger"
            @click="emit('deleteDiagram', row.diagram.id)"
          >
            <UiIcon name="delete" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

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

.icon-btn,
.mini-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.icon-btn .ui-icon,
.mini-btn .ui-icon {
  width: 16px;
  height: 16px;
}

.icon-btn:hover,
.mini-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
}

.mini-btn--danger:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--danger-soft);
}

.mini-btn--active {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
}

.panel__search {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.panel__search-wrap {
  position: relative;
  min-width: 0;
  flex: 1;
}

.panel__search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: var(--text-subtle);
  pointer-events: none;
}

.panel__search-input {
  width: 100%;
  padding: 7px 10px 7px 34px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  background: var(--surface-muted);
  color: var(--base-text);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.panel__search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(124, 92, 252, 0.12);
}

.panel__search-input::placeholder {
  color: var(--text-subtle);
}

.panel__search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: var(--surface-strong);
  color: var(--text-subtle);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.panel__search-clear .ui-icon {
  width: 14px;
  height: 14px;
}

.panel__search-clear:hover {
  background: var(--border-strong);
  color: var(--base-text);
}

.tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px;
  border-bottom: 1px solid var(--border);
}

.tree__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  text-align: center;
  animation: fadeIn 0.4s ease;
}

.tree__empty-icon {
  width: 28px;
  height: 28px;
  color: var(--border-strong);
}

.tree__empty-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  margin: 0;
}

.tree__empty-hint {
  font-size: 12px;
  color: var(--text-subtle);
  margin: 0;
}

.tree-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
  animation: fadeSlideIn 0.25s ease both;
}

.tree-node--nested {
  margin-left: 14px;
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
.tree-node__icon-svg {
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

.tree-node__type {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.tree-node__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tree-node__row:hover .tree-node__actions {
  opacity: 1;
}

.tree-node__children {
  margin-left: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.diagram-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
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

.diagram-row .mini-btn--danger,
.diagram-row .diagram-row__edit-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.diagram-row:hover .mini-btn--danger,
.diagram-row:hover .diagram-row__edit-btn {
  opacity: 1;
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

.diagram-row__badge--lock {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  color: var(--warning);
  border-color: var(--warning);
}

.diagram-row__badge--lock-own {
  color: var(--success);
  border-color: var(--success);
}

.diagram-row__lock-icon {
  font-size: 14px;
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
