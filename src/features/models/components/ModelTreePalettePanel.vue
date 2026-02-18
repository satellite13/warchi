<script setup lang="ts">
import { computed, ref } from "vue"
import type { NodeTypeResponse } from "../../../types/api"
import type { EditorDiagram, EditorNode } from "../types"

const props = defineProps<{
  nodes: EditorNode[]
  diagrams: EditorDiagram[]
  nodeTypes: NodeTypeResponse[]
  selectedNodeId: string | null
  selectedDiagramId: string | null
  modelName?: string
}>()

const emit = defineEmits<{
  selectNode: [nodeId: string]
  openDiagram: [diagramId: string]
  createNode: [parentNodeId: string | null]
  createFolder: [parentNodeId: string | null]
  deleteNode: [nodeId: string]
  createDiagram: [nodeId: string]
  deleteDiagram: [diagramId: string]
  moveNode: [nodeId: string, newParentNodeId: string | null]
}>()

const expandedNodes = ref<Set<string>>(new Set())
const treeSearchQuery = ref("")

const nodeTypeNameById = computed(() => {
  const map = new Map<string, string>()
  for (const type of props.nodeTypes) map.set(type.id, type.name)
  return map
})

const isDirectory = (node: EditorNode): boolean =>
  (nodeTypeNameById.value.get(node.nodeTypeId) ?? "").trim().toLowerCase() === "directory"

const rootNodes = computed(() => props.nodes.filter((node) => !node.parentNodeId && !node._isDeleted))

const childNodes = (nodeId: string): EditorNode[] =>
  props.nodes.filter((node) => node.parentNodeId === nodeId && !node._isDeleted)

const nodeMatchesSearch = (node: EditorNode, query: string): boolean => {
  if (node.name.toLowerCase().includes(query)) return true
  return childNodes(node.id).some((child) => nodeMatchesSearch(child, query))
}

const filteredRootNodes = computed(() => {
  const query = treeSearchQuery.value.trim().toLowerCase()
  if (!query) return rootNodes.value
  return rootNodes.value.filter((node) => nodeMatchesSearch(node, query))
})

const filteredChildNodes = (nodeId: string): EditorNode[] => {
  const query = treeSearchQuery.value.trim().toLowerCase()
  if (!query) return childNodes(nodeId)
  return childNodes(nodeId).filter((child) => nodeMatchesSearch(child, query))
}

const nodeDiagrams = (nodeId: string): EditorDiagram[] =>
  props.diagrams.filter((diagram) => diagram.nodeId === nodeId && !diagram._isDeleted)

const toggleNode = (nodeId: string) => {
  const next = new Set(expandedNodes.value)
  if (next.has(nodeId)) next.delete(nodeId)
  else next.add(nodeId)
  expandedNodes.value = next
}

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

const dropTarget = ref<{ nodeId: string | null; position: "above" | "below" | "inside" } | null>(null)

const isDescendant = (nodeId: string, potentialParentId: string): boolean => {
  const children = childNodes(potentialParentId)
  for (const child of children) {
    if (child.id === nodeId) return true
    if (isDescendant(nodeId, child.id)) return true
  }
  return false
}

const onTreeDragOver = (event: DragEvent, targetNodeId: string | null) => {
  if (!event.dataTransfer?.types.includes("application/x-model-node-id")) return
  event.preventDefault()
  if (!targetNodeId) {
    dropTarget.value = { nodeId: null, position: "inside" }
    return
  }
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const y = event.clientY - rect.top
  const third = rect.height / 3

  const targetNode = props.nodes.find((n) => n.id === targetNodeId)
  if (targetNode && isDirectory(targetNode)) {
    if (y < third) dropTarget.value = { nodeId: targetNodeId, position: "above" }
    else if (y > third * 2) dropTarget.value = { nodeId: targetNodeId, position: "below" }
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
  dropTarget.value = null
  if (!draggedNodeId || draggedNodeId === targetNodeId) return

  // Prevent dropping a node onto its own descendant
  if (targetNodeId && isDescendant(targetNodeId, draggedNodeId)) return

  let newParentId: string | null = null
  if (!targetNodeId) {
    newParentId = null
  } else {
    const targetNode = props.nodes.find((n) => n.id === targetNodeId)
    if (targetNode && isDirectory(targetNode)) {
      // Drop inside a directory
      newParentId = targetNodeId
    } else {
      // Drop as sibling: use target's parent
      newParentId = targetNode?.parentNodeId ?? null
    }
  }

  emit("moveNode", draggedNodeId, newParentId)
}

const getDropClass = (nodeId: string) => {
  if (!dropTarget.value || dropTarget.value.nodeId !== nodeId) return {}
  return {
    "tree-node__row--drop-above": dropTarget.value.position === "above",
    "tree-node__row--drop-below": dropTarget.value.position === "below",
    "tree-node__row--drop-inside": dropTarget.value.position === "inside"
  }
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

defineExpose({ expandToNode })
</script>

<template>
  <div class="panel">
    <div class="panel__header">
      <div class="panel__title-row">
        <span class="material-symbols-outlined">schema</span>
        <span class="panel__title">{{ modelName || "Модель" }}</span>
      </div>
      <div class="panel__header-actions">
        <button type="button" class="mini-btn" title="Добавить корневую папку" @click="emit('createFolder', null)">
          <span class="material-symbols-outlined">create_new_folder</span>
        </button>
        <button type="button" class="mini-btn" title="Добавить корневую ноду" @click="emit('createNode', null)">
          <span class="material-symbols-outlined">add_box</span>
        </button>
      </div>
    </div>

    <div class="tree-search">
      <span class="material-symbols-outlined tree-search__icon">search</span>
      <input
        v-model="treeSearchQuery"
        type="text"
        class="tree-search__input"
        placeholder="Поиск..."
      >
      <button
        v-if="treeSearchQuery"
        type="button"
        class="tree-search__clear"
        @click="treeSearchQuery = ''"
      >
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div class="tree">
      <div v-if="filteredRootNodes.length === 0" class="tree__empty">
        <span class="material-symbols-outlined tree__empty-icon">account_tree</span>
        <span class="tree__empty-text">Нет нод</span>
        <span class="tree__empty-hint">Создайте папку или ноду в шапке</span>
      </div>
      <template v-for="node in filteredRootNodes" :key="node.id">
        <div class="tree-node">
          <div
            class="tree-node__row"
            :class="{ 'tree-node__row--active': selectedNodeId === node.id, ...getDropClass(node.id) }"
            :data-tree-node-id="node.id"
            draggable="true"
            @dragstart="onDragNodeStart($event, node.id)"
            @dragover.prevent="onTreeDragOver($event, node.id)"
            @dragleave="onTreeDragLeave"
            @drop.prevent="onTreeDrop($event, node.id)"
          >
            <button
              v-if="isDirectory(node)"
              type="button"
              class="tree-node__toggle"
              @click="toggleNode(node.id)"
            >
              <span class="material-symbols-outlined">
                {{ expandedNodes.has(node.id) ? "expand_more" : "chevron_right" }}
              </span>
            </button>
            <button type="button" class="tree-node__select" @click="emit('selectNode', node.id)">
              <span class="material-symbols-outlined">{{ isDirectory(node) ? "folder" : "category" }}</span>
              <span class="tree-node__name">{{ node.name }}</span>
              <span v-if="!isDirectory(node)" class="tree-node__type">{{ nodeTypeNameById.get(node.nodeTypeId) }}</span>
            </button>
            <div class="tree-node__actions">
              <button
                v-if="isDirectory(node)"
                type="button"
                class="mini-btn"
                title="Добавить дочернюю папку"
                @click.stop="emit('createFolder', node.id)"
              >
                <span class="material-symbols-outlined">create_new_folder</span>
              </button>
              <button
                v-if="isDirectory(node)"
                type="button"
                class="mini-btn"
                title="Добавить дочернюю ноду"
                @click.stop="emit('createNode', node.id)"
              >
                <span class="material-symbols-outlined">add_box</span>
              </button>
              <button
                v-if="isDirectory(node)"
                type="button"
                class="mini-btn"
                title="Создать диаграмму"
                @click.stop="emit('createDiagram', node.id)"
              >
                <span class="material-symbols-outlined">add_chart</span>
              </button>
              <button type="button" class="mini-btn mini-btn--danger" title="Удалить" @click.stop="emit('deleteNode', node.id)">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>

          <div v-if="expandedNodes.has(node.id)" class="tree-node__children">
            <div
              v-for="diagram in nodeDiagrams(node.id)"
              :key="diagram.id"
              class="diagram-row"
              :class="{ 'diagram-row--active': selectedDiagramId === diagram.id }"
            >
              <button
                type="button"
                class="diagram-row__select"
                title="Открыть диаграмму (двойной клик)"
                @dblclick="emit('openDiagram', diagram.id)"
              >
                <span class="material-symbols-outlined">table_chart</span>
                <span>{{ diagram.name }}</span>
                <span v-if="selectedDiagramId === diagram.id" class="diagram-row__badge">Открыта</span>
              </button>
              <button type="button" class="mini-btn mini-btn--danger" @click="emit('deleteDiagram', diagram.id)">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>

            <div
              v-for="child in filteredChildNodes(node.id)"
              :key="child.id"
              class="tree-node tree-node--nested"
            >
              <div
                class="tree-node__row"
                :class="{ 'tree-node__row--active': selectedNodeId === child.id, ...getDropClass(child.id) }"
                :data-tree-node-id="child.id"
                draggable="true"
                @dragstart="onDragNodeStart($event, child.id)"
                @dragover.prevent="onTreeDragOver($event, child.id)"
                @dragleave="onTreeDragLeave"
                @drop.prevent="onTreeDrop($event, child.id)"
              >
                <button
                  v-if="isDirectory(child)"
                  type="button"
                  class="tree-node__toggle"
                  @click="toggleNode(child.id)"
                >
                  <span class="material-symbols-outlined">
                    {{ expandedNodes.has(child.id) ? "expand_more" : "chevron_right" }}
                  </span>
                </button>
                <button type="button" class="tree-node__select" @click="emit('selectNode', child.id)">
                  <span class="material-symbols-outlined">{{ isDirectory(child) ? "folder" : "category" }}</span>
                  <span class="tree-node__name">{{ child.name }}</span>
                  <span v-if="!isDirectory(child)" class="tree-node__type">{{ nodeTypeNameById.get(child.nodeTypeId) }}</span>
                </button>
                <div class="tree-node__actions">
                  <button
                    v-if="isDirectory(child)"
                    type="button"
                    class="mini-btn"
                    title="Добавить дочернюю папку"
                    @click.stop="emit('createFolder', child.id)"
                  >
                    <span class="material-symbols-outlined">create_new_folder</span>
                  </button>
                  <button
                    v-if="isDirectory(child)"
                    type="button"
                    class="mini-btn"
                    title="Добавить дочернюю ноду"
                    @click.stop="emit('createNode', child.id)"
                  >
                    <span class="material-symbols-outlined">add_box</span>
                  </button>
                  <button
                    v-if="isDirectory(child)"
                    type="button"
                    class="mini-btn"
                    @click.stop="emit('createDiagram', child.id)"
                  >
                    <span class="material-symbols-outlined">add_chart</span>
                  </button>
                  <button type="button" class="mini-btn mini-btn--danger" @click.stop="emit('deleteNode', child.id)">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
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
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
}

.panel__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel__title {
  font-size: 14px;
  font-weight: 600;
}

.panel__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.icon-btn,
.mini-btn {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.mini-btn {
  width: 22px;
  height: 22px;
}

.icon-btn .material-symbols-outlined,
.mini-btn .material-symbols-outlined {
  font-size: 16px;
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

.tree-search {
  position: relative;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tree-search__icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--text-subtle);
  pointer-events: none;
}

.tree-search__input {
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

.tree-search__input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(124, 92, 252, 0.12);
}

.tree-search__input::placeholder {
  color: var(--text-subtle);
}

.tree-search__clear {
  position: absolute;
  right: 18px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--surface-strong);
  color: var(--text-subtle);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.tree-search__clear .material-symbols-outlined {
  font-size: 14px;
}

.tree-search__clear:hover {
  background: var(--border-strong);
  color: var(--base-text);
}

.tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

.tree__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 32px 16px;
  animation: fadeIn 0.4s ease;
}

.tree__empty-icon {
  font-size: 36px;
  color: var(--border-strong);
  margin-bottom: 4px;
}

.tree__empty-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}

.tree__empty-hint {
  font-size: 12px;
  color: var(--text-subtle);
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
  gap: 4px;
  border-radius: 8px;
  padding: 2px;
  transition: background 0.15s ease;
}

.tree-node__row:hover {
  background: var(--surface-strong);
}

.tree-node__row--active {
  background: var(--primary-soft);
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
  width: 22px;
  height: 22px;
  cursor: pointer;
}

.tree-node__toggle .material-symbols-outlined {
  font-size: 18px;
}

.tree-node__select {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  text-align: left;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--base-text);
  cursor: pointer;
}

.tree-node__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.tree-node__type {
  font-size: 10px;
  color: var(--text-subtle);
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
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 2px 4px;
  margin-left: 14px;
}

.diagram-row .mini-btn--danger {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.diagram-row:hover .mini-btn--danger {
  opacity: 1;
}

.diagram-row--active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.diagram-row__select {
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--base-text);
  cursor: pointer;
}

.diagram-row--active .diagram-row__select {
  color: var(--accent);
  font-weight: 600;
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
}

</style>
