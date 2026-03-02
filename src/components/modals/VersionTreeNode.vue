<script setup lang="ts">
import type { VersionTreeNode as VersionTreeNodeType, VersionTreeItem } from "@/utils/versionTree"
import VersionTreeNode from "./VersionTreeNode.vue"

const props = defineProps<{
  node: VersionTreeNodeType<VersionTreeItem>
  /** Корневой узел — без вертикальной линии слева. */
  isRoot?: boolean
}>()

const emit = defineEmits<{
  open: [id: string]
}>()
</script>

<template>
  <li class="version-tree__node" :class="{ 'version-tree__node--root': isRoot }">
    <div class="version-tree__branch">
      <button
        type="button"
        class="version-tree__item"
        @click="emit('open', node.item.id)"
      >
        <span class="version-tree__dot" aria-hidden="true" />
        <span class="version-tree__version">v{{ node.item.version }}</span>
        <UiIcon name="arrow_forward" class="version-tree__icon" />
      </button>
    </div>
    <ul v-if="node.children.length > 0" class="version-tree__list">
      <VersionTreeNode
        v-for="child in node.children"
        :key="child.item.id"
        :node="child"
        @open="emit('open', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.version-tree__node {
  list-style: none;
  margin: 0;
  position: relative;
}

.version-tree__node--root > .version-tree__branch::before {
  display: none;
}

.version-tree__branch {
  position: relative;
  padding-left: 0;
}

/* Горизонтальная ветка от вертикальной линии к узлу */
.version-tree__node:not(.version-tree__node--root) > .version-tree__branch::before {
  content: "";
  position: absolute;
  left: -13px;
  top: 50%;
  width: 13px;
  height: 1px;
  background: var(--border);
  margin-top: -1px;
}

.version-tree__list {
  list-style: none;
  margin: 0;
  padding: 2px 0 2px 12px;
  border-left: 1px solid var(--border);
  margin-left: 10px;
}

.version-tree__node + .version-tree__node {
  margin-top: 6px;
}

.version-tree__list > .version-tree__node {
  margin-top: 6px;
}

.version-tree__list > .version-tree__node:first-child {
  margin-top: 0;
}

.version-tree__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--base-text);
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  font-variant-numeric: tabular-nums;
}

.version-tree__item:hover {
  background: var(--surface-muted);
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary-soft);
}

.version-tree__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--primary);
  opacity: 0.7;
}

.version-tree__item:hover .version-tree__dot {
  opacity: 1;
  background: var(--primary);
}

.version-tree__version {
  flex: 1;
  min-width: 0;
}

.version-tree__icon {
  width: 14px;
  height: 14px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.version-tree__item:hover .version-tree__icon {
  color: var(--primary);
}
</style>
