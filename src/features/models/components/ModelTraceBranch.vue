<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorLink, EditorNode } from '../types'
import type { TraceabilityLinkStatus } from '../utils/traceabilityLinkStatus'

const props = defineProps<{
  nodeId: string
  path: string[]
  nodeById: Map<string, EditorNode>
  getLinksForNode: (nodeId: string) => EditorLink[]
  getLinkTypeName: (linkTypeId: string) => string
  resolveNextNodeId: (link: EditorLink) => string
  isLinkExpanded: (nodeId: string, linkId: string) => boolean
  toggleLink: (nodeId: string, linkId: string) => void
  getLinkStatus: (link: EditorLink) => TraceabilityLinkStatus
}>()

const emit = defineEmits<{
  setRoot: [nodeId: string]
}>()

const { t } = useI18n()

const links = computed(() => props.getLinksForNode(props.nodeId))
const statusByLinkId = computed(() => {
  const map = new Map<string, TraceabilityLinkStatus>()
  for (const link of links.value) {
    map.set(link.id, props.getLinkStatus(link))
  }
  return map
})

const linkLabel = (link: EditorLink) => {
  const source = props.nodeById.get(link.sourceId)?.name ?? link.sourceId
  const target = props.nodeById.get(link.targetId)?.name ?? link.targetId
  return `${source} → ${target}`
}

const linkTypeLabel = (link: EditorLink): string => props.getLinkTypeName(link.linkTypeId)

const isCycle = (nodeId: string) => props.path.includes(nodeId)

const getStatus = (link: EditorLink): TraceabilityLinkStatus =>
  statusByLinkId.value.get(link.id) ?? props.getLinkStatus(link)

const linkClasses = (link: EditorLink): Record<string, boolean> => {
  const status = getStatus(link)
  return {
    'tb__link--on-diagram': status.hasActiveDiagram && status.onDiagram,
    'tb__link--missing-on-diagram': status.hasActiveDiagram && !status.onDiagram,
  }
}

const disabledReasonToI18nKey = (
  status: TraceabilityLinkStatus
): 'models.traceabilityDragHint' | `models.traceabilityDragDisabled${string}` => {
  if (status.draggable) return 'models.traceabilityDragHint'
  switch (status.reason) {
    case 'alreadyOnDiagram':
      return 'models.traceabilityDragDisabledAlreadyOnDiagram'
    case 'missingEndpointInstances':
      return 'models.traceabilityDragDisabledMissingEndpointInstances'
    case 'missingRelation':
      return 'models.traceabilityDragDisabledMissingRelation'
    case 'connectNotAllowed':
      return 'models.traceabilityDragDisabledConnectNotAllowed'
    case 'readOnly':
      return 'models.traceabilityDragDisabledReadOnly'
    case 'noActiveDiagram':
    default:
      return 'models.traceabilityDragDisabledNoActiveDiagram'
  }
}

const dragHandleTitle = (link: EditorLink): string => {
  const status = getStatus(link)
  return t(disabledReasonToI18nKey(status))
}

const onLinkDragStart = (event: DragEvent, link: EditorLink) => {
  const status = getStatus(link)
  if (!status.draggable) {
    event.preventDefault()
    return
  }
  event.dataTransfer?.setData('application/x-warchi-model-link-id', link.id)
  event.dataTransfer?.setData('text/plain', `model-link:${link.id}`)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
  }
}
</script>

<template>
  <div v-if="links.length > 0" class="tb">
    <div v-for="link in links" :key="link.id" class="tb__item">
      <button type="button" class="tb__link" :class="linkClasses(link)" @click="toggleLink(nodeId, link.id)">
        <UiIcon
          class="tb__expand"
          :name="isLinkExpanded(nodeId, link.id) ? 'expand_more' : 'chevron_right'"
        />
        <UiIcon name="route" class="tb__link-icon" />
        <span class="tb__link-text">{{ linkLabel(link) }}</span>
        <span
          class="tb__drag-handle"
          :class="{ 'tb__drag-handle--disabled': !getStatus(link).draggable }"
          :title="dragHandleTitle(link)"
          :draggable="getStatus(link).draggable"
          @dragstart.stop="onLinkDragStart($event, link)"
        >
          <UiIcon name="drag_indicator" class="tb__drag-handle-icon" />
        </span>
        <span class="tb__link-type">{{ linkTypeLabel(link) }}</span>
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
            :get-link-type-name="getLinkTypeName"
            :resolve-next-node-id="resolveNextNodeId"
            :is-link-expanded="isLinkExpanded"
            :toggle-link="toggleLink"
            :get-link-status="getLinkStatus"
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

.tb__link--on-diagram .tb__link-text {
  font-weight: 600;
}

.tb__link--missing-on-diagram .tb__link-text {
  font-style: italic;
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
  max-width: 150px;
}

.tb__link-type {
  flex-shrink: 0;
  margin-left: auto;
  padding: 1px 5px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--base-text) 8%, transparent);
  color: var(--text-subtle);
  font-size: 10px;
  line-height: 1.2;
}

.tb__drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-subtle);
  cursor: grab;
  flex-shrink: 0;
}

.tb__drag-handle:hover {
  background: var(--surface);
  color: var(--base-text);
}

.tb__drag-handle:active {
  cursor: grabbing;
}

.tb__drag-handle--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tb__drag-handle--disabled:hover {
  background: transparent;
  color: var(--text-subtle);
}

.tb__drag-handle-icon {
  width: 14px;
  height: 14px;
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
