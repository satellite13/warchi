<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorGraphNeighbor, EditorLink, EditorNode } from '../types'
import type {
  LazyTraceabilityBranchState,
  TraceabilityBranchQuery,
  TraceabilityDirection,
} from '../composables/useLazyTraceability'
import type { TraceabilityLinkStatus } from '../utils/traceabilityLinkStatus'

const props = defineProps<{
  nodeId: string
  path: string[]
  instancePath: string[]
  nodeById: Map<string, EditorNode>
  direction: TraceabilityDirection
  linkTypeId: string | null
  getBranchState: (query: TraceabilityBranchQuery) => LazyTraceabilityBranchState
  loadBranch: (query: TraceabilityBranchQuery, currentPath: ReadonlySet<string>) => Promise<boolean>
  loadMore: (query: TraceabilityBranchQuery) => Promise<boolean>
  retry: (query: TraceabilityBranchQuery) => Promise<boolean>
  getLinkTypeName: (linkTypeId: string) => string
  isLinkExpanded: (nodeId: string, linkId: string) => boolean
  toggleLink: (nodeId: string, linkId: string) => void
  getLinkStatus: (link: EditorLink) => TraceabilityLinkStatus
}>()

const emit = defineEmits<{
  setRoot: [nodeId: string]
}>()

const { t } = useI18n()

const query = computed<TraceabilityBranchQuery>(() => ({
  nodeId: props.nodeId,
  direction: props.direction,
  linkTypeId: props.linkTypeId,
}))
const branchState = computed(() => props.getBranchState(query.value))
const rows = computed(() => branchState.value.rows)
const statusByLinkId = computed(() => {
  const map = new Map<string, TraceabilityLinkStatus>()
  for (const row of rows.value) {
    map.set(row.link.id, props.getLinkStatus(row.link))
  }
  return map
})

const nodeName = (nodeId: string, row: EditorGraphNeighbor): string =>
  row.node.id === nodeId ? row.node.name : (props.nodeById.get(nodeId)?.name ?? nodeId)

const linkLabel = (row: EditorGraphNeighbor): string => {
  const source = nodeName(row.link.sourceId, row)
  const target = nodeName(row.link.targetId, row)
  return `${source} → ${target}`
}

const linkTypeLabel = (link: EditorLink): string => props.getLinkTypeName(link.linkTypeId)

const isCycle = (nodeId: string) => props.path.includes(nodeId)
const resolveNextNodeId = (link: EditorLink): string =>
  props.direction === 'outgoing' ? link.targetId : link.sourceId
const domIdSegment = (value: string): string => {
  const encoded = encodeURIComponent(value)
  return `${encoded.length}-${encoded}`
}
const branchInstanceKey = computed(() =>
  [props.path[0] ?? props.nodeId, ...props.instancePath].map(domIdSegment).join('-')
)
const branchTargetId = (linkId: string): string =>
  `trace-branch-${branchInstanceKey.value}-${domIdSegment(linkId)}`

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

const toggleRow = async (row: EditorGraphNeighbor): Promise<void> => {
  const link = row.link
  const nextNodeId = resolveNextNodeId(link)
  const expanded = props.isLinkExpanded(props.nodeId, link.id)
  props.toggleLink(props.nodeId, link.id)
  if (expanded || isCycle(nextNodeId)) return
  await props.loadBranch(
    {
      nodeId: nextNodeId,
      direction: props.direction,
      linkTypeId: props.linkTypeId,
    },
    new Set(props.path)
  )
}
</script>

<template>
  <div class="tb">
    <div v-for="row in rows" :key="row.link.id" class="tb__item">
      <button
        type="button"
        class="tb__link"
        :class="linkClasses(row.link)"
        :aria-expanded="isLinkExpanded(nodeId, row.link.id)"
        :aria-controls="branchTargetId(row.link.id)"
        @click="toggleRow(row)"
      >
        <UiIcon
          class="tb__expand"
          :name="isLinkExpanded(nodeId, row.link.id) ? 'expand_more' : 'chevron_right'"
        />
        <UiIcon name="route" class="tb__link-icon" />
        <span class="tb__link-text">{{ linkLabel(row) }}</span>
        <span
          class="tb__drag-handle"
          :class="{ 'tb__drag-handle--disabled': !getStatus(row.link).draggable }"
          :title="dragHandleTitle(row.link)"
          :draggable="getStatus(row.link).draggable"
          @dragstart.stop="onLinkDragStart($event, row.link)"
        >
          <UiIcon name="drag_indicator" class="tb__drag-handle-icon" />
        </span>
        <span class="tb__link-type">{{ linkTypeLabel(row.link) }}</span>
      </button>

      <div :id="branchTargetId(row.link.id)" class="tb__children">
        <template
          v-if="
            isLinkExpanded(nodeId, row.link.id) &&
            (nodeById.get(resolveNextNodeId(row.link)) || row.node)
          "
        >
          <button
            type="button"
            class="tb__node"
            :class="{ 'tb__node--cycle': isCycle(resolveNextNodeId(row.link)) }"
            :disabled="isCycle(resolveNextNodeId(row.link))"
            @click="emit('setRoot', resolveNextNodeId(row.link))"
          >
            <span class="tb__node-dot" />
            <span class="tb__node-name">
              {{ nodeName(resolveNextNodeId(row.link), row) }}
            </span>
            <span v-if="isCycle(resolveNextNodeId(row.link))" class="tb__node-cycle-badge">
              ∞
            </span>
          </button>
          <ModelTraceBranch
            v-if="!isCycle(resolveNextNodeId(row.link))"
            :node-id="resolveNextNodeId(row.link)"
            :path="[...path, resolveNextNodeId(row.link)]"
            :instance-path="[...instancePath, row.link.id]"
            :node-by-id="nodeById"
            :direction="direction"
            :link-type-id="linkTypeId"
            :get-branch-state="getBranchState"
            :load-branch="loadBranch"
            :load-more="loadMore"
            :retry="retry"
            :get-link-type-name="getLinkTypeName"
            :is-link-expanded="isLinkExpanded"
            :toggle-link="toggleLink"
            :get-link-status="getLinkStatus"
            @set-root="emit('setRoot', $event)"
          />
        </template>
      </div>
    </div>
    <div v-if="branchState.loading" class="tb__status" role="status" aria-live="polite">
      <UiIcon name="sync" class="spin" />
      <span>{{ t('models.traceabilityLoadingBranch') }}</span>
    </div>
    <div v-else-if="branchState.error" class="tb__status tb__status--error" role="alert">
      <span>{{ branchState.error }}</span>
      <button
        type="button"
        class="tb__status-action"
        data-testid="trace-retry"
        @click="retry(query)"
      >
        {{ t('common.retry') }}
      </button>
    </div>
    <button
      v-else-if="branchState.nextPage !== null && rows.length > 0"
      type="button"
      class="tb__status-action tb__status-action--more"
      data-testid="trace-load-more"
      @click="loadMore(query)"
    >
      {{ t('models.traceabilityLoadMore') }}
    </button>
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

.tb__status {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 8px;
  color: var(--text-subtle);
}

.tb__status--error {
  color: var(--danger);
}

.tb__status-action {
  border: 0;
  background: none;
  color: var(--primary);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.tb__status-action--more {
  align-self: flex-start;
  min-height: 28px;
  padding: 4px 8px;
}
</style>
