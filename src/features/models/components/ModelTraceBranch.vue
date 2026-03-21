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
  return `${source} → ${target}`
}

const isCycle = (nodeId: string) => props.path.includes(nodeId)
</script>

<template>
  <div v-if="links.length > 0" class="tb">
    <div v-for="link in links" :key="link.id" class="tb__item">
      <button type="button" class="tb__link" @click="toggleLink(nodeId, link.id)">
        <UiIcon
          class="tb__expand"
          :name="isLinkExpanded(nodeId, link.id) ? 'expand_more' : 'chevron_right'"
        />
        <UiIcon name="route" class="tb__link-icon" />
        <span class="tb__link-text">{{ linkLabel(link) }}</span>
      </button>

      <div v-if="isLinkExpanded(nodeId, link.id)" class="tb__children">
        <template v-if="nodeById.get(resolveNextNodeId(link))">
          <button
            type="button"
            class="tb__node"
            :class="{ 'tb__node--cycle': isCycle(resolveNextNodeId(link)) }"
            @click="emit('setRoot', resolveNextNodeId(link))"
          >
            <span class="tb__node-dot" />
            <span class="tb__node-name">
              {{ nodeById.get(resolveNextNodeId(link))?.name }}
            </span>
            <span v-if="isCycle(resolveNextNodeId(link))" class="tb__node-cycle-badge">
              ∞
            </span>
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
.tb {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: 11px;
  padding-left: 12px;
  border-left: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.tb__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
}

.tb__item::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 13px;
  width: 10px;
  height: 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.tb__link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: none;
  font-family: inherit;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  text-align: left;
  transition: all 0.12s ease;
}

.tb__link:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.tb__expand {
  width: 14px;
  height: 14px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.tb__link-icon {
  width: 12px;
  height: 12px;
  color: var(--accent, var(--text-subtle));
  flex-shrink: 0;
}

.tb__link-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.tb__children {
  margin-left: 8px;
  margin-top: 1px;
}

.tb__node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-muted);
  font-family: inherit;
  cursor: pointer;
  transition: all 0.12s ease;
}

.tb__node:hover {
  border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
  background: var(--primary-soft);
}

.tb__node--cycle {
  opacity: 0.55;
  cursor: default;
  border-style: dashed;
}

.tb__node--cycle:hover {
  border-color: var(--border);
  background: var(--surface-muted);
}

.tb__node-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--primary);
  flex-shrink: 0;
}

.tb__node--cycle .tb__node-dot {
  background: var(--text-subtle);
}

.tb__node-name {
  font-size: 12px;
  color: var(--base-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.tb__node-cycle-badge {
  font-size: 11px;
  color: var(--text-subtle);
  font-weight: 600;
}
</style>
