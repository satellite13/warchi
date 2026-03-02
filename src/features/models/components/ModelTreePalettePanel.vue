<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { useI18n } from "vue-i18n"
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions"
import { compareVersions } from "../../../utils/version"
import { parseTypeAttrs } from "../../notations/notationAttrs"
import type { NodeTypeResponse } from "../../../types/api"
import type { EditorDiagram, EditorNode } from "../types"

const props = defineProps<{
  nodes: EditorNode[]
  diagrams: EditorDiagram[]
  nodeTypes: NodeTypeResponse[]
  treeRootNodeId?: string | null
  selectedNodeId: string | null
  selectedDiagramId: string | null
  modelName?: string
  syncSelectionEnabled?: boolean
}>()

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

const expandedNodes = ref<Set<string>>(new Set())
const treeSearchQuery = ref("")

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

const sortNodesByTreeOrder = (nodes: EditorNode[]): EditorNode[] =>
  [...nodes].sort((a, b) => {
    const orderDiff = (a.parsedAttrs.treeOrder ?? 0) - (b.parsedAttrs.treeOrder ?? 0)
    if (orderDiff !== 0) return orderDiff
    return (nodeIndexById.value.get(a.id) ?? 0) - (nodeIndexById.value.get(b.id) ?? 0)
  })

const rootNodes = computed(() => {
  const topParentId = props.treeRootNodeId ?? null
  return sortNodesByTreeOrder(
    props.nodes.filter(
      (node) =>
        !node._isDeleted &&
        node.id !== props.treeRootNodeId &&
        (node.parentNodeId ?? null) === topParentId
    )
  )
})

const totalNodesCount = computed(() =>
  props.nodes.filter((n) => !n._isDeleted && n.id !== props.treeRootNodeId).length
)

const childNodes = (nodeId: string): EditorNode[] =>
  sortNodesByTreeOrder(
    props.nodes.filter(
      (node) => node.parentNodeId === nodeId && !node._isDeleted && node.id !== props.treeRootNodeId
    )
  )

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
      <div v-if="filteredRootNodes.length === 0" class="tree__empty">
        <UiIcon name="account_tree" class="tree__empty-icon" />
        <span class="tree__empty-text">{{ t("models.noNodes") }}</span>
        <span class="tree__empty-hint">{{ t("models.createFolderOrNodeHint") }}</span>
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
              <UiIcon :name="expandedNodes.has(node.id) ? 'expand_more' : 'chevron_right'" />
            </button>
            <button
              type="button"
              class="tree-node__select"
              :class="{ 'tree-node__select--unused': !isDirectory(node) && !isNodeUsed(node.id) }"
              @click="emit('selectNode', node.id)"
              @dblclick="isDirectory(node) && toggleNode(node.id)"
            >
              <img
                v-if="nodeTypeIconById.get(node.nodeTypeId)"
                class="tree-node__icon-svg"
                :src="`/icons/${nodeTypeIconById.get(node.nodeTypeId)}.svg`"
                :alt="node.name"
              >
              <UiIcon
                v-else
                :name="isDirectory(node) ? DEFAULT_ENTITY_ICONS.folder : DEFAULT_ENTITY_ICONS.node"
                class="tree-node__icon-symbol"
              />
              <input
                v-if="renamingNodeId === node.id"
                v-model="renamingNodeName"
                class="tree-node__rename-input"
                type="text"
                @click.stop
                @keydown.enter.prevent="commitRenameNode(node)"
                @keydown.esc.prevent="cancelRenameNode"
                @blur="commitRenameNode(node)"
              >
              <span v-else class="tree-node__name">{{ node.name }}</span>
              <span v-if="!isDirectory(node)" class="tree-node__type">{{ nodeTypeNameById.get(node.nodeTypeId) }}</span>
            </button>
            <div class="tree-node__actions">
              <button
                v-if="isDirectory(node)"
                type="button"
                class="mini-btn"
                :title="t('models.addChildFolder')"
                @click.stop="emit('createFolder', node.id)"
              >
                <UiIcon name="create_new_folder" />
              </button>
              <button
                v-if="isDirectory(node)"
                type="button"
                class="mini-btn"
                :title="t('models.addChildNode')"
                @click.stop="emit('createNode', node.id)"
              >
                <UiIcon name="add_box" />
              </button>
              <button
                v-if="isDirectory(node)"
                type="button"
                class="mini-btn"
                :title="t('models.createDiagramTitle')"
                @click.stop="emit('createDiagram', node.id)"
              >
                <UiIcon name="add_chart" />
              </button>
              <button
                v-if="isDirectory(node)"
                type="button"
                class="mini-btn"
                :title="t('models.renameFolder')"
                @click.stop="startRenameNode(node)"
              >
                <UiIcon name="edit" />
              </button>
              <button type="button" class="mini-btn mini-btn--danger" :title="t('common.delete')" @click.stop="emit('deleteNode', node.id)">
                <UiIcon name="delete" />
              </button>
            </div>
          </div>

          <div v-if="expandedNodes.has(node.id)" class="tree-node__children">
            <div
              v-for="diagram in nodeDiagrams(node.id)"
              :key="diagram.id"
              class="diagram-row"
              :class="{ 'diagram-row--active': selectedDiagramId === diagram.id }"
              draggable="true"
              @dragstart="onDragDiagramStart($event, diagram.id)"
            >
              <button
                v-if="renamingDiagramId !== diagram.id"
                type="button"
                class="diagram-row__select"
                :title="t('models.openDiagramDoubleClick')"
                @dblclick="emit('openDiagram', diagram.id)"
              >
                <UiIcon name="table_chart" />
                <span>{{ diagram.name }}</span>
                <span v-if="selectedDiagramId === diagram.id" class="diagram-row__badge">{{ t("models.diagramOpened") }}</span>
              </button>
              <div
                v-else
                class="diagram-row__select diagram-row__rename-wrap"
              >
                <UiIcon name="table_chart" />
                <input
                  v-model="renamingDiagramName"
                  class="diagram-row__rename-input"
                  type="text"
                  @click.stop
                  @keydown.enter.prevent="commitRenameDiagram(diagram)"
                  @keydown.esc.prevent="cancelRenameDiagram"
                  @blur="commitRenameDiagram(diagram)"
                >
              </div>
              <button
                v-if="renamingDiagramId !== diagram.id"
                type="button"
                class="mini-btn diagram-row__edit-btn"
                :title="t('models.renameDiagram')"
                @click.stop="startRenameDiagram(diagram)"
              >
                <UiIcon name="edit" />
              </button>
              <button type="button" class="mini-btn mini-btn--danger" @click="emit('deleteDiagram', diagram.id)">
                <UiIcon name="delete" />
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
                  <UiIcon :name="expandedNodes.has(child.id) ? 'expand_more' : 'chevron_right'" />
                </button>
                <button
                  type="button"
                  class="tree-node__select"
                  :class="{ 'tree-node__select--unused': !isDirectory(child) && !isNodeUsed(child.id) }"
                  @click="emit('selectNode', child.id)"
                  @dblclick="isDirectory(child) && toggleNode(child.id)"
                >
                  <img
                    v-if="nodeTypeIconById.get(child.nodeTypeId)"
                    class="tree-node__icon-svg"
                    :src="`/icons/${nodeTypeIconById.get(child.nodeTypeId)}.svg`"
                    :alt="child.name"
                  >
                  <UiIcon
                    v-else
                    :name="isDirectory(child) ? DEFAULT_ENTITY_ICONS.folder : DEFAULT_ENTITY_ICONS.node"
                    class="tree-node__icon-symbol"
                  />
                  <input
                    v-if="renamingNodeId === child.id"
                    v-model="renamingNodeName"
                    class="tree-node__rename-input"
                    type="text"
                    @click.stop
                    @keydown.enter.prevent="commitRenameNode(child)"
                    @keydown.esc.prevent="cancelRenameNode"
                    @blur="commitRenameNode(child)"
                  >
                  <span v-else class="tree-node__name">{{ child.name }}</span>
                  <span v-if="!isDirectory(child)" class="tree-node__type">{{ nodeTypeNameById.get(child.nodeTypeId) }}</span>
                </button>
                <div class="tree-node__actions">
                  <button
                    v-if="isDirectory(child)"
                    type="button"
                    class="mini-btn"
                    :title="t('models.addChildFolder')"
                    @click.stop="emit('createFolder', child.id)"
                  >
                    <UiIcon name="create_new_folder" />
                  </button>
                  <button
                    v-if="isDirectory(child)"
                    type="button"
                    class="mini-btn"
                    :title="t('models.addChildNode')"
                    @click.stop="emit('createNode', child.id)"
                  >
                    <UiIcon name="add_box" />
                  </button>
                  <button
                    v-if="isDirectory(child)"
                    type="button"
                    class="mini-btn"
                    :title="t('models.renameFolder')"
                    @click.stop="startRenameNode(child)"
                  >
                    <UiIcon name="edit" />
                  </button>
                  <button
                    v-if="isDirectory(child)"
                    type="button"
                    class="mini-btn"
                    @click.stop="emit('createDiagram', child.id)"
                  >
                    <UiIcon name="add_chart" />
                  </button>
                  <button type="button" class="mini-btn mini-btn--danger" @click.stop="emit('deleteNode', child.id)">
                    <UiIcon name="delete" />
                  </button>
                </div>
              </div>

              <div v-if="isDirectory(child) && expandedNodes.has(child.id)" class="tree-node__children">
                <div
                  v-for="diagram in nodeDiagrams(child.id)"
                  :key="diagram.id"
                  class="diagram-row"
                  :class="{ 'diagram-row--active': selectedDiagramId === diagram.id }"
                  draggable="true"
                  @dragstart="onDragDiagramStart($event, diagram.id)"
                >
                  <button
                    v-if="renamingDiagramId !== diagram.id"
                    type="button"
                    class="diagram-row__select"
                    :title="t('models.openDiagramDoubleClick')"
                    @dblclick="emit('openDiagram', diagram.id)"
                  >
                    <UiIcon name="table_chart" />
                    <span>{{ diagram.name }}</span>
                    <span v-if="selectedDiagramId === diagram.id" class="diagram-row__badge">{{ t("models.diagramOpened") }}</span>
                  </button>
                  <div
                    v-else
                    class="diagram-row__select diagram-row__rename-wrap"
                  >
                    <UiIcon name="table_chart" />
                    <input
                      v-model="renamingDiagramName"
                      class="diagram-row__rename-input"
                      type="text"
                      @click.stop
                      @keydown.enter.prevent="commitRenameDiagram(diagram)"
                      @keydown.esc.prevent="cancelRenameDiagram"
                      @blur="commitRenameDiagram(diagram)"
                    >
                  </div>
                  <button
                    v-if="renamingDiagramId !== diagram.id"
                    type="button"
                    class="mini-btn diagram-row__edit-btn"
                    :title="t('models.renameDiagram')"
                    @click.stop="startRenameDiagram(diagram)"
                  >
                    <UiIcon name="edit" />
                  </button>
                  <button type="button" class="mini-btn mini-btn--danger" @click="emit('deleteDiagram', diagram.id)">
                    <UiIcon name="delete" />
                  </button>
                </div>

                <div
                  v-for="grandchild in filteredChildNodes(child.id)"
                  :key="grandchild.id"
                  class="tree-node tree-node--nested"
                >
                  <div
                    class="tree-node__row"
                    :class="{ 'tree-node__row--active': selectedNodeId === grandchild.id, ...getDropClass(grandchild.id) }"
                    :data-tree-node-id="grandchild.id"
                    draggable="true"
                    @dragstart="onDragNodeStart($event, grandchild.id)"
                    @dragover.prevent="onTreeDragOver($event, grandchild.id)"
                    @dragleave="onTreeDragLeave"
                    @drop.prevent="onTreeDrop($event, grandchild.id)"
                  >
                    <button
                      v-if="isDirectory(grandchild)"
                      type="button"
                      class="tree-node__toggle"
                      @click="toggleNode(grandchild.id)"
                    >
                      <UiIcon :name="expandedNodes.has(grandchild.id) ? 'expand_more' : 'chevron_right'" />
                    </button>
                    <button
                      type="button"
                      class="tree-node__select"
                      :class="{ 'tree-node__select--unused': !isDirectory(grandchild) && !isNodeUsed(grandchild.id) }"
                      @click="emit('selectNode', grandchild.id)"
                      @dblclick="isDirectory(grandchild) && toggleNode(grandchild.id)"
                    >
                      <img
                        v-if="nodeTypeIconById.get(grandchild.nodeTypeId)"
                        class="tree-node__icon-svg"
                        :src="`/icons/${nodeTypeIconById.get(grandchild.nodeTypeId)}.svg`"
                        :alt="grandchild.name"
                      >
                      <UiIcon
                        v-else
                        :name="isDirectory(grandchild) ? DEFAULT_ENTITY_ICONS.folder : DEFAULT_ENTITY_ICONS.node"
                        class="tree-node__icon-symbol"
                      />
                      <input
                        v-if="renamingNodeId === grandchild.id"
                        v-model="renamingNodeName"
                        class="tree-node__rename-input"
                        type="text"
                        @click.stop
                        @keydown.enter.prevent="commitRenameNode(grandchild)"
                        @keydown.esc.prevent="cancelRenameNode"
                        @blur="commitRenameNode(grandchild)"
                      >
                      <span v-else class="tree-node__name">{{ grandchild.name }}</span>
                      <span v-if="!isDirectory(grandchild)" class="tree-node__type">{{ nodeTypeNameById.get(grandchild.nodeTypeId) }}</span>
                    </button>
                    <div class="tree-node__actions">
                      <button
                        v-if="isDirectory(grandchild)"
                        type="button"
                        class="mini-btn"
                        :title="t('models.addChildFolder')"
                        @click.stop="emit('createFolder', grandchild.id)"
                      >
                        <UiIcon name="create_new_folder" />
                      </button>
                      <button
                        v-if="isDirectory(grandchild)"
                        type="button"
                        class="mini-btn"
                        :title="t('models.addChildNode')"
                        @click.stop="emit('createNode', grandchild.id)"
                      >
                        <UiIcon name="add_box" />
                      </button>
                      <button
                        v-if="isDirectory(grandchild)"
                        type="button"
                        class="mini-btn"
                        :title="t('models.renameFolder')"
                        @click.stop="startRenameNode(grandchild)"
                      >
                        <UiIcon name="edit" />
                      </button>
                      <button
                        v-if="isDirectory(grandchild)"
                        type="button"
                        class="mini-btn"
                        @click.stop="emit('createDiagram', grandchild.id)"
                      >
                        <UiIcon name="add_chart" />
                      </button>
                      <button type="button" class="mini-btn mini-btn--danger" @click.stop="emit('deleteNode', grandchild.id)">
                        <UiIcon name="delete" />
                      </button>
                    </div>
                  </div>
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
