<script setup lang="ts">
import { computed } from 'vue'
import type { EditorLink, EditorNode } from '../types'

const props = defineProps<{
  nodeId: string
  path: string[]
  nodeById: Map<string, EditorNode>
  getLinksForNode: (nodeId: string) => EditorLink[]
  resolveNextNodeId: (link: EditorLink) => string
  isLinkExpanded: (nodeId: string, linkId: string) => boolean
  toggleLink: (nodeId: string, linkId: string) => void
}>()

const emit = defineEmits<{
  setRoot: [nodeId: string]
}>()

const links = computed(() => props.getLinksForNode(props.nodeId))

const linkLabel = (link: EditorLink) => {
  const source = props.nodeById.get(link.sourceId)?.name ?? link.sourceId
  const target = props.nodeById.get(link.targetId)?.name ?? link.targetId
  return `${source} -> ${target}`
}

const isCycle = (nodeId: string) => props.path.includes(nodeId)
</script>

<template>
  <div class="trace-tree__branch">
    <div v-for="link in links" :key="link.id" class="trace-tree__item">
      <button type="button" class="trace-tree__link" @click="toggleLink(nodeId, link.id)">
        <UiIcon
          class="trace-tree__link-expand-icon"
          :name="isLinkExpanded(nodeId, link.id) ? 'expand_more' : 'chevron_right'"
        />
        <UiIcon name="route" class="trace-tree__link-icon" />
        <span class="trace-tree__link-label">{{ linkLabel(link) }}</span>
      </button>
      <div v-if="isLinkExpanded(nodeId, link.id)" class="trace-tree__child">
        <template v-if="nodeById.get(resolveNextNodeId(link))">
          <button
            type="button"
            class="trace-tree__node"
            @dblclick="emit('setRoot', resolveNextNodeId(link))"
          >
            <UiIcon name="account_tree" class="trace-tree__node-icon" />
            <span class="trace-tree__node-label">{{ nodeById.get(resolveNextNodeId(link))?.name }}</span>
          </button>
          <ModelTraceBranch
            v-if="!isCycle(resolveNextNodeId(link))"
            :node-id="resolveNextNodeId(link)"
            :path="[...path, resolveNextNodeId(link)]"
            :node-by-id="nodeById"
            :get-links-for-node="getLinksForNode"
            :resolve-next-node-id="resolveNextNodeId"
            :is-link-expanded="isLinkExpanded"
            :toggle-link="toggleLink"
            @set-root="emit('setRoot', $event)"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trace-tree__branch {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-left: 14px;
  padding-left: 10px;
  border-left: 1px dashed color-mix(in srgb, var(--border) 70%, transparent);
}

.trace-tree__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.trace-tree__link,
.trace-tree__node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 0;
  padding: 5px 8px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.trace-tree__link:hover,
.trace-tree__node:hover {
  border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
  background: var(--surface-strong);
}

.trace-tree__link-expand-icon {
  color: var(--text-subtle);
}

.trace-tree__link-icon,
.trace-tree__node-icon {
  color: var(--primary);
}

.trace-tree__link-label,
.trace-tree__node-label {
  color: var(--base-text);
  font-size: 13px;
}

.trace-tree__child {
  margin-left: 14px;
  margin-top: 2px;
}

</style>
