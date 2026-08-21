<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  DiagramReferenceResponse,
  LinkResponse,
  LinkTypeResponse,
  NodeResponse,
  RelationResponse,
} from '@/types/api'
import {
  useLazyTraceability,
  type TraceabilityBranchQuery,
  type TraceabilityDirection,
} from '../composables/useLazyTraceability'
import type {
  EditorDiagram,
  EditorGraphNeighbor,
  EditorLink,
  EditorNode,
  ModelPartialRequestGuard,
  TraceabilityNeighborRef,
} from '../types'
import {
  computeTraceabilityLinkStatus,
  type TraceabilityLinkStatus,
} from '../utils/traceabilityLinkStatus'
import ModelTraceBranch from './ModelTraceBranch.vue'

type DirectionMode = 'down' | 'up'

type NodeDragEligibility = {
  allowed: boolean
  reason: string
}

const props = defineProps<{
  modelId: string
  selectedNode: EditorNode | null
  nodes: EditorNode[]
  linkTypes: LinkTypeResponse[]
  activeDiagram: EditorDiagram | null
  activeNotationId: string | null
  isDiagramReadOnly: boolean
  relations: RelationResponse[]
  canConnect: (sourceModelNodeId: string, targetModelNodeId: string) => boolean
  canDragNodeToDiagram: (nodeId: string) => NodeDragEligibility
  isDiagramOnlyEdgeModelLinkId?: (modelLinkId: string) => boolean
  authoritativeRevision: number
  diagramRevision: number
  beginRequest: (requestKey: string) => ModelPartialRequestGuard
  isRequestCurrent: (guard: ModelPartialRequestGuard) => boolean
  mergePartialEntities: (
    nodes: readonly NodeResponse[],
    links: readonly LinkResponse[],
    guard: ModelPartialRequestGuard
  ) => boolean
  resolveBranchRows: (
    rowIds: readonly TraceabilityNeighborRef[],
    query: TraceabilityBranchQuery
  ) => EditorGraphNeighbor[]
  resolveDiagramReferences: (
    remoteRows: readonly DiagramReferenceResponse[],
    selectedNodeId: string
  ) => DiagramReferenceResponse[]
}>()

const emit = defineEmits<{
  'open-diagram': [diagramId: string]
  'focus-node': [nodeId: string]
  'add-node-to-diagram': [nodeId: string]
}>()

const { t } = useI18n()

const direction = ref<DirectionMode>('down')
const ALL_LINK_TYPES_FILTER = '__all__'
const rootNodeId = ref<string | null>(null)
const selectedLinkTypeFilter = ref<string>(ALL_LINK_TYPES_FILTER)
const backStack = ref<string[]>([])
const forwardStack = ref<string[]>([])
const expandedLinkKeys = ref<Set<string>>(new Set())
const diagramsOpen = ref(true)
const treeOpen = ref(true)
const suppressNextSelectionReset = ref(false)
const traceability = useLazyTraceability({
  modelId: computed(() => props.modelId || null),
  authoritativeRevision: computed(() => props.authoritativeRevision),
  diagramRevision: computed(() => props.diagramRevision),
  beginRequest: props.beginRequest,
  isRequestCurrent: props.isRequestCurrent,
  mergePartialEntities: props.mergePartialEntities,
  resolveBranchRows: props.resolveBranchRows,
  resolveDiagramReferences: props.resolveDiagramReferences,
})

const openDiagramFromKeyboard = (event: KeyboardEvent, diagramId: string): void => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('open-diagram', diagramId)
}

const nodeById = computed(() => {
  const map = new Map<string, EditorNode>()
  for (const node of props.nodes) map.set(node.id, node)
  return map
})

const linkTypeNameById = computed(() => {
  const map = new Map<string, string>()
  for (const linkType of props.linkTypes) {
    map.set(linkType.id, linkType.name)
  }
  return map
})

const getLinkTypeName = (linkTypeId: string): string =>
  linkTypeNameById.value.get(linkTypeId) ?? t('models.traceabilityUnknownLinkType')

const linkTypeOptions = computed(() =>
  props.linkTypes
    .map(linkType => ({ id: linkType.id, name: linkType.name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
)

const traceDirection = computed<TraceabilityDirection>(() =>
  direction.value === 'down' ? 'outgoing' : 'incoming'
)
const selectedLinkTypeId = computed<string | null>(() =>
  selectedLinkTypeFilter.value === ALL_LINK_TYPES_FILTER ? null : selectedLinkTypeFilter.value
)
const branchQuery = (nodeId: string): TraceabilityBranchQuery => ({
  nodeId,
  direction: traceDirection.value,
  linkTypeId: selectedLinkTypeId.value,
})

const rootNode = computed(() => {
  const rootId = rootNodeId.value
  if (!rootId) return null
  return nodeById.value.get(rootId) ?? null
})

const diagramsUsingRootNode = traceability.diagramReferences

const canGoBack = computed(() => backStack.value.length > 0)
const canGoForward = computed(() => forwardStack.value.length > 0)

const breadcrumbs = computed(() => {
  const crumbs: { id: string; name: string }[] = []
  for (const id of backStack.value) {
    const node = nodeById.value.get(id)
    if (node) crumbs.push({ id, name: node.name })
  }
  if (rootNode.value) {
    crumbs.push({ id: rootNode.value.id, name: rootNode.value.name })
  }
  return crumbs
})

const rootBranchCount = computed(() => {
  const rootId = rootNodeId.value
  if (!rootId) return 0
  return traceability.getBranchState(branchQuery(rootId)).totalElements
})

watch(
  () => props.selectedNode?.id ?? null,
  nodeId => {
    if (suppressNextSelectionReset.value && nodeId === rootNodeId.value) {
      suppressNextSelectionReset.value = false
      return
    }
    suppressNextSelectionReset.value = false
    rootNodeId.value = nodeId
    backStack.value = []
    forwardStack.value = []
    expandedLinkKeys.value = new Set()
    direction.value = 'down'
  },
  { immediate: true }
)

watch(
  rootNodeId,
  nodeId => {
    if (nodeId) void traceability.selectRoot(branchQuery(nodeId))
  },
  { immediate: true }
)

watch([traceDirection, selectedLinkTypeId], () => {
  expandedLinkKeys.value = new Set()
  const rootId = rootNodeId.value
  if (rootId) void traceability.changeFilter(branchQuery(rootId))
})

const focusRootOnDiagram = () => {
  if (!rootNodeId.value) return
  suppressNextSelectionReset.value = true
  emit('focus-node', rootNodeId.value)
}

const onNodeDragStart = (event: DragEvent, nodeId: string): void => {
  const eligibility = props.canDragNodeToDiagram(nodeId)
  if (!eligibility.allowed) {
    event.preventDefault()
    return
  }
  event.dataTransfer?.setData('application/x-model-node-id', nodeId)
  event.dataTransfer?.setData('text/plain', `node:${nodeId}`)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
  }
}

const requestNodeAddToDiagram = (nodeId: string): void => {
  if (!props.canDragNodeToDiagram(nodeId).allowed) return
  emit('add-node-to-diagram', nodeId)
}

const nodeDragAriaLabel = (nodeId: string, nodeName: string): string => {
  const eligibility = props.canDragNodeToDiagram(nodeId)
  return eligibility.allowed
    ? t('models.traceabilityAddNodeToDiagram', { name: nodeName })
    : t(eligibility.reason)
}

const onNodeKeyboardRequest = (event: KeyboardEvent, nodeId: string): void => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  requestNodeAddToDiagram(nodeId)
}

const isLinkExpanded = (nodeId: string, linkId: string): boolean =>
  expandedLinkKeys.value.has(`${nodeId}:${linkId}`)

const toggleLink = (nodeId: string, linkId: string) => {
  const key = `${nodeId}:${linkId}`
  const next = new Set(expandedLinkKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedLinkKeys.value = next
}

const setRootFromTree = (nextRootId: string) => {
  const currentRootId = rootNodeId.value
  if (!currentRootId || currentRootId === nextRootId) return
  backStack.value = [...backStack.value, currentRootId]
  forwardStack.value = []
  rootNodeId.value = nextRootId
  expandedLinkKeys.value = new Set()
}

const navigateToBreadcrumb = (targetId: string) => {
  const currentRootId = rootNodeId.value
  if (!currentRootId || currentRootId === targetId) return
  const idx = backStack.value.indexOf(targetId)
  if (idx === -1) return
  const removed = backStack.value.slice(idx + 1)
  backStack.value = backStack.value.slice(0, idx)
  forwardStack.value = [...removed, currentRootId, ...forwardStack.value]
  rootNodeId.value = targetId
  expandedLinkKeys.value = new Set()
}

const goBack = () => {
  if (!canGoBack.value) return
  const currentRootId = rootNodeId.value
  const prevRootId = backStack.value[backStack.value.length - 1] ?? null
  if (!currentRootId || !prevRootId) return
  backStack.value = backStack.value.slice(0, -1)
  forwardStack.value = [...forwardStack.value, currentRootId]
  rootNodeId.value = prevRootId
  expandedLinkKeys.value = new Set()
}

const goForward = () => {
  if (!canGoForward.value) return
  const currentRootId = rootNodeId.value
  const nextRootId = forwardStack.value[forwardStack.value.length - 1] ?? null
  if (!currentRootId || !nextRootId) return
  forwardStack.value = forwardStack.value.slice(0, -1)
  backStack.value = [...backStack.value, currentRootId]
  rootNodeId.value = nextRootId
  expandedLinkKeys.value = new Set()
}

const toggleDirection = () => {
  direction.value = direction.value === 'down' ? 'up' : 'down'
  expandedLinkKeys.value = new Set()
}

const getLinkStatus = (link: EditorLink): TraceabilityLinkStatus =>
  computeTraceabilityLinkStatus({
    link,
    activeDiagram: props.activeDiagram,
    activeNotationId: props.activeNotationId,
    isDiagramReadOnly: props.isDiagramReadOnly,
    relations: props.relations,
    canConnect: props.canConnect,
    isDiagramOnlyEdgeModelLinkId: props.isDiagramOnlyEdgeModelLinkId,
  })
</script>

<template>
  <div class="tp">
    <!-- Empty state -->
    <div v-if="!selectedNode" class="tp-empty">
      <div class="tp-empty__graphic">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <circle cx="16" cy="16" r="5" stroke="currentColor" stroke-width="1.2" opacity="0.3" />
          <circle cx="40" cy="16" r="5" stroke="currentColor" stroke-width="1.2" opacity="0.2" />
          <circle cx="28" cy="40" r="5" stroke="currentColor" stroke-width="1.2" opacity="0.25" />
          <path
            d="M20 19L25 36"
            stroke="currentColor"
            stroke-width="1"
            stroke-dasharray="2 3"
            opacity="0.2"
          />
          <path
            d="M36 19L31 36"
            stroke="currentColor"
            stroke-width="1"
            stroke-dasharray="2 3"
            opacity="0.15"
          />
          <path
            d="M21 16L35 16"
            stroke="currentColor"
            stroke-width="1"
            stroke-dasharray="2 3"
            opacity="0.18"
          />
        </svg>
      </div>
      <span class="tp-empty__text">{{ t('models.traceabilityNoNode') }}</span>
      <span class="tp-empty__hint">{{ t('models.traceabilityNoNodeHint') }}</span>
    </div>

    <template v-else>
      <!-- Diagrams section -->
      <div class="tp-section">
        <button
          type="button"
          class="tp-section__head tp-section__head--no-hover"
          :aria-expanded="diagramsOpen"
          aria-controls="traceability-diagrams-panel"
          @click="diagramsOpen = !diagramsOpen"
        >
          <UiIcon
            name="chevron_right"
            class="tp-section__chevron"
            :class="{ 'tp-section__chevron--open': diagramsOpen }"
          />
          <span class="tp-section__label">{{ t('models.traceabilityDiagramsTitle') }}</span>
          <span class="tp-section__count">{{ traceability.diagramsTotalElements.value }}</span>
        </button>

        <Transition name="tp-collapse">
          <div
            v-show="diagramsOpen"
            id="traceability-diagrams-panel"
            class="tp-section__body"
          >
            <div
              v-if="traceability.diagramsLoading.value && diagramsUsingRootNode.length === 0"
              class="tp-section__status"
              role="status"
              aria-live="polite"
            >
              <UiIcon name="sync" class="spin" />
              <span>{{ t('models.traceabilityLoadingDiagrams') }}</span>
            </div>
            <div
              v-if="traceability.diagramsError.value"
              class="tp-section__status tp-section__status--error"
              role="alert"
            >
              <span>{{ traceability.diagramsError.value }}</span>
              <button
                type="button"
                class="tp-section__action"
                data-testid="diagram-references-retry"
                @click="traceability.retryDiagrams"
              >
                {{ t('common.retry') }}
              </button>
            </div>
            <div
              v-if="
                diagramsUsingRootNode.length === 0 &&
                !traceability.diagramsLoading.value &&
                !traceability.diagramsError.value
              "
              class="tp-section__empty"
            >
              {{ t('models.traceabilityNoDiagrams') }}
            </div>
            <div v-if="diagramsUsingRootNode.length > 0" class="tp-diagrams">
              <div
                v-for="diagram in diagramsUsingRootNode"
                :key="diagram.id"
                class="tp-diagram"
                role="button"
                tabindex="0"
                @mousedown.prevent
                @selectstart.prevent
                @keydown="openDiagramFromKeyboard($event, diagram.id)"
                @dblclick.prevent="emit('open-diagram', diagram.id)"
              >
                <UiIcon name="dashboard" class="tp-diagram__icon" />
                <span class="tp-diagram__name">{{ diagram.name }}</span>
                <span class="tp-diagram__version">{{ diagram.version }}</span>
              </div>
              <button
                v-if="
                  traceability.diagramsNextPage.value !== null &&
                  !traceability.diagramsError.value
                "
                type="button"
                class="tp-section__action tp-section__action--more"
                @click="traceability.loadMoreDiagrams"
              >
                {{ t('models.traceabilityLoadMore') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Trace tree section -->
      <div class="tp-section tp-section--tree">
        <div class="tp-section__head tp-section__head--tree">
          <button
            type="button"
            class="tp-section__toggle"
            :aria-expanded="treeOpen"
            aria-controls="traceability-tree-panel"
            @click="treeOpen = !treeOpen"
          >
            <UiIcon
              name="chevron_right"
              class="tp-section__chevron"
              :class="{ 'tp-section__chevron--open': treeOpen }"
            />
            <span class="tp-section__label">{{ t('models.traceabilityTreeTitle') }}</span>
          </button>
          <div class="tp-nav">
            <button
              type="button"
              class="tp-nav__dir"
              :title="
                direction === 'down'
                  ? t('models.traceabilityDirectionDown')
                  : t('models.traceabilityDirectionUp')
              "
              @click="toggleDirection"
            >
              <UiIcon :name="direction === 'down' ? 'south' : 'north'" />
              <span class="tp-nav__dir-label">
                {{
                  direction === 'down'
                    ? t('models.traceabilityDirectionDown')
                    : t('models.traceabilityDirectionUp')
                }}
              </span>
              <span class="tp-nav__dir-count">
                {{ rootBranchCount }}
              </span>
            </button>
            <label class="tp-nav__filter">
              <UiIcon name="filter_alt" class="tp-nav__filter-icon" />
              <select v-model="selectedLinkTypeFilter" class="tp-nav__filter-select">
                <option :value="ALL_LINK_TYPES_FILTER">
                  {{ t('models.traceabilityAllLinkTypes') }}
                </option>
                <option
                  v-for="typeOption in linkTypeOptions"
                  :key="typeOption.id"
                  :value="typeOption.id"
                >
                  {{ typeOption.name }}
                </option>
              </select>
            </label>
            <div class="tp-nav__arrows">
              <button
                type="button"
                class="tp-nav__btn"
                :title="t('common.back')"
                :disabled="!canGoBack"
                @click="goBack"
              >
                <UiIcon name="arrow_back" />
              </button>
              <button
                type="button"
                class="tp-nav__btn"
                :title="t('common.forward')"
                :disabled="!canGoForward"
                @click="goForward"
              >
                <UiIcon name="arrow_forward" />
              </button>
            </div>
          </div>
        </div>

        <Transition name="tp-collapse">
          <div
            v-show="treeOpen && rootNode"
            id="traceability-tree-panel"
            class="tp-section__body tp-section__body--tree"
          >
            <div v-if="breadcrumbs.length > 1" class="tp-breadcrumb tp-breadcrumb--in-tree">
              <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.id">
                <span v-if="idx > 0" class="tp-breadcrumb__sep">/</span>
                <button
                  type="button"
                  class="tp-breadcrumb__item"
                  :class="{ 'tp-breadcrumb__item--current': idx === breadcrumbs.length - 1 }"
                  :disabled="idx === breadcrumbs.length - 1"
                  @click="navigateToBreadcrumb(crumb.id)"
                >
                  {{ crumb.name }}
                </button>
              </template>
            </div>
            <div v-if="rootNode" class="tp-tree">
              <button type="button" class="tp-tree__root" @click="focusRootOnDiagram">
                <span class="tp-tree__root-dot" />
                <span class="tp-tree__root-name">{{ rootNode.name }}</span>
                <span
                  class="tp-tree__drag-handle"
                  :class="{ 'tp-tree__drag-handle--disabled': !canDragNodeToDiagram(rootNode.id).allowed }"
                  :title="t(canDragNodeToDiagram(rootNode.id).reason)"
                  :draggable="canDragNodeToDiagram(rootNode.id).allowed"
                  :aria-disabled="!canDragNodeToDiagram(rootNode.id).allowed"
                  :aria-label="nodeDragAriaLabel(rootNode.id, rootNode.name)"
                  :tabindex="canDragNodeToDiagram(rootNode.id).allowed ? 0 : -1"
                  data-testid="trace-node-drag-root"
                  role="button"
                  @click.stop
                  @mousedown.stop
                  @pointerdown.stop
                  @dragstart.stop="onNodeDragStart($event, rootNode.id)"
                  @keydown.stop="onNodeKeyboardRequest($event, rootNode.id)"
                >
                  <UiIcon name="drag_indicator" class="tp-tree__drag-handle-icon" />
                </span>
              </button>
              <ModelTraceBranch
                :node-id="rootNode.id"
                :path="[rootNode.id]"
                :instance-path="[]"
                :node-by-id="nodeById"
                :direction="traceDirection"
                :link-type-id="selectedLinkTypeId"
                :get-branch-state="traceability.getBranchState"
                :load-branch="traceability.loadBranch"
                :load-more="traceability.loadMore"
                :retry="traceability.retry"
                :get-link-type-name="getLinkTypeName"
                :is-link-expanded="isLinkExpanded"
                :toggle-link="toggleLink"
                :get-link-status="getLinkStatus"
                :can-drag-node-to-diagram="canDragNodeToDiagram"
                @set-root="setRootFromTree"
                @request-add-node="requestNodeAddToDiagram"
              />
            </div>
          </div>
        </Transition>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-size: 12px;
  color: var(--base-text);
}

/* ---- Empty state ---- */
.tp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 48px 24px;
  flex: 1;
}

.tp-empty__graphic {
  color: var(--border-strong);
  opacity: 0.6;
}

.tp-empty__text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}

.tp-empty__hint {
  font-size: 11px;
  color: var(--text-subtle);
}

/* ---- Breadcrumb ---- */
.tp-breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none;
}

.tp-breadcrumb--in-tree {
  border-bottom: none;
  border-top: 1px solid var(--border);
}

.tp-breadcrumb::-webkit-scrollbar {
  display: none;
}

.tp-breadcrumb__sep {
  font-size: 10px;
  color: var(--text-subtle);
  flex-shrink: 0;
  padding: 0 2px;
  user-select: none;
}

.tp-breadcrumb__item {
  border: none;
  background: none;
  font-family: inherit;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.tp-breadcrumb__item:hover:not(:disabled) {
  color: var(--primary);
  background: var(--primary-soft);
}

.tp-breadcrumb__item--current {
  font-weight: 600;
  color: var(--base-text);
  cursor: default;
}

.tp-breadcrumb__item--current:hover {
  color: var(--base-text);
  background: none;
}

/* ---- Section ---- */
.tp-section {
  border-bottom: 1px solid var(--border);
}

.tp-section--tree {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-bottom: none;
}

.tp-section__head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border: none;
  background: none;
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s ease;
}

.tp-section__head:hover {
  background: var(--surface-strong);
}

.tp-section__head--no-hover:hover {
  background: none;
}

.tp-section__head--tree {
  cursor: default;
  justify-content: space-between;
}

.tp-section__head--tree:hover {
  background: none;
}

.tp-section__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  padding: 0;
  font-family: inherit;
  cursor: pointer;
}

.tp-section__toggle:hover .tp-section__label {
  color: var(--base-text);
}

.tp-section__chevron {
  width: 14px;
  height: 14px;
  color: var(--text-subtle);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.tp-section__chevron--open {
  transform: rotate(90deg);
}

.tp-section__label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
  transition: color 0.12s ease;
}

.tp-section__count {
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--surface-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  margin-left: auto;
}

.tp-section__body {
  overflow: hidden;
}

.tp-section__body--tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.tp-section__body--tree::-webkit-scrollbar {
  width: 5px;
}

.tp-section__body--tree::-webkit-scrollbar-track {
  background: transparent;
}

.tp-section__body--tree::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.tp-section__body--tree::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}

.tp-section__empty {
  padding: 10px 12px;
  font-size: 11px;
  color: var(--text-subtle);
}

.tp-section__status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  color: var(--text-subtle);
}

.tp-section__status--error {
  color: var(--danger);
}

.tp-section__action {
  border: 0;
  background: none;
  color: var(--primary);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.tp-section__action--more {
  align-self: flex-start;
  min-height: 28px;
  padding: 4px 12px;
}

/* ---- Navigation ---- */
.tp-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tp-nav__filter {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 24px;
  padding: 0 8px 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
}

.tp-nav__filter-icon {
  width: 13px;
  height: 13px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.tp-nav__filter-select {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 11px;
  min-width: 0;
  max-width: 130px;
  outline: none;
  cursor: pointer;
}

.tp-nav__filter-select:focus {
  color: var(--base-text);
}

.tp-nav__dir {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px 0 5px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-muted);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tp-nav__dir .ui-icon {
  width: 14px;
  height: 14px;
}

.tp-nav__dir:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}

.tp-nav__dir-label {
  line-height: 1;
}

.tp-nav__dir-count {
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--base-text) 8%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  color: var(--text-subtle);
}

.tp-nav__arrows {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.tp-nav__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.12s ease;
}

.tp-nav__btn .ui-icon {
  width: 14px;
  height: 14px;
}

.tp-nav__btn:hover:not(:disabled) {
  background: var(--surface-strong);
  color: var(--primary);
}

.tp-nav__btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.tp-nav__btn + .tp-nav__btn {
  border-left: 1px solid var(--border);
}

/* ---- Diagrams list ---- */
.tp-diagrams {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 0;
}

.tp-diagram {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
  transition: background 0.12s ease;
}

.tp-diagram * {
  -webkit-user-select: none;
  user-select: none;
}

.tp-diagram:hover {
  background: var(--surface-strong);
}

.tp-diagram__icon {
  width: 14px;
  height: 14px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.tp-diagram__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.tp-diagram__version {
  font-size: 10px;
  color: var(--text-subtle);
  padding: 1px 5px;
  background: var(--surface-strong);
  border-radius: 3px;
  flex-shrink: 0;
}

/* ---- Trace tree ---- */
.tp-tree {
  padding: 8px 12px 12px;
}

.tp-tree__root {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  background: var(--primary-soft);
  border: 1px solid color-mix(in srgb, var(--primary) 25%, var(--border));
  border-radius: 6px;
  margin-bottom: 4px;
  cursor: pointer;
}

.tp-tree__root-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  flex-shrink: 0;
}

.tp-tree__root-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.tp-tree__drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 2px;
  border-radius: 4px;
  color: var(--text-subtle);
  cursor: grab;
  flex-shrink: 0;
}

.tp-tree__drag-handle:hover {
  background: var(--surface);
  color: var(--base-text);
}

.tp-tree__drag-handle:active {
  cursor: grabbing;
}

.tp-tree__drag-handle--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tp-tree__drag-handle--disabled:hover {
  background: transparent;
  color: var(--text-subtle);
}

.tp-tree__drag-handle-icon {
  width: 14px;
  height: 14px;
}

/* ---- Collapse transition ---- */
.tp-collapse-enter-active,
.tp-collapse-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.tp-collapse-enter-from,
.tp-collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

.tp-collapse-enter-to,
.tp-collapse-leave-from {
  opacity: 1;
  max-height: 800px;
}
</style>
