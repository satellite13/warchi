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
}>()

const expandedNodes = ref<Set<string>>(new Set())

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

    <div class="tree">
      <div v-if="rootNodes.length === 0" class="tree__empty">
        <span class="material-symbols-outlined tree__empty-icon">account_tree</span>
        <span class="tree__empty-text">Нет нод</span>
        <span class="tree__empty-hint">Создайте папку или ноду в шапке</span>
      </div>
      <template v-for="node in rootNodes" :key="node.id">
        <div class="tree-node">
          <div
            class="tree-node__row"
            :class="{ 'tree-node__row--active': selectedNodeId === node.id }"
            draggable="true"
            @dragstart="onDragNodeStart($event, node.id)"
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
              v-for="child in childNodes(node.id)"
              :key="child.id"
              class="tree-node tree-node--nested"
            >
              <div
                class="tree-node__row"
                :class="{ 'tree-node__row--active': selectedNodeId === child.id }"
                draggable="true"
                @dragstart="onDragNodeStart($event, child.id)"
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
