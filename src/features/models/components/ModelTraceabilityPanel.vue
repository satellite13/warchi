<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LinkTypeResponse, RelationResponse } from '@/types/api'
import type { EditorDiagram, EditorLink, EditorNode } from '../types'
import { computeTraceabilityLinkStatus, type TraceabilityLinkStatus } from '../utils/traceabilityLinkStatus'
import ModelTraceBranch from './ModelTraceBranch.vue'

type DirectionMode = 'down' | 'up'

const props = defineProps<{
  selectedNode: EditorNode | null
  nodes: EditorNode[]
  links: EditorLink[]
  diagrams: EditorDiagram[]
  linkTypes: LinkTypeResponse[]
  activeDiagram: EditorDiagram | null
  activeNotationId: string | null
  isDiagramReadOnly: boolean
  relations: RelationResponse[]
  canConnect: (sourceModelNodeId: string, targetModelNodeId: string) => boolean
  isDiagramOnlyEdgeModelLinkId?: (modelLinkId: string) => boolean
}>()

const emit = defineEmits<{
  'open-diagram': [diagramId: string]
  'focus-node': [nodeId: string]
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

const nodeById = computed(() => {
  const map = new Map<string, EditorNode>()
  for (const node of props.nodes) map.set(node.id, node)
  return map
})

const linksBySourceId = computed(() => {
  const map = new Map<string, EditorLink[]>()
  for (const link of props.links) {
    if (!map.has(link.sourceId)) map.set(link.sourceId, [])
    map.get(link.sourceId)!.push(link)
  }
  return map
})

const linksByTargetId = computed(() => {
  const map = new Map<string, EditorLink[]>()
  for (const link of props.links) {
    if (!map.has(link.targetId)) map.set(link.targetId, [])
    map.get(link.targetId)!.push(link)
  }
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

const linkTypeOptions = computed(() => {
  const usedTypeIds = new Set(props.links.map((link) => link.linkTypeId))
  return Array.from(usedTypeIds)
    .map((id) => ({ id, name: getLinkTypeName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
})

const matchesSelectedLinkType = (link: EditorLink): boolean =>
  selectedLinkTypeFilter.value === ALL_LINK_TYPES_FILTER ||
  link.linkTypeId === selectedLinkTypeFilter.value

const rootNode = computed(() => {
  const rootId = rootNodeId.value
  if (!rootId) return null
  return nodeById.value.get(rootId) ?? null
})

const diagramsUsingRootNode = computed(() => {
  const rootId = rootNodeId.value
  if (!rootId) return []
  return props.diagrams.filter((diagram) =>
    diagram.parsedAttrs.instances.nodes.some((instance) => instance.modelNodeId === rootId),
  )
})

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

const outgoingCount = computed(() => {
  const rootId = rootNodeId.value
  if (!rootId) return 0
  return (linksBySourceId.value.get(rootId) ?? []).filter(matchesSelectedLinkType).length
})

const incomingCount = computed(() => {
  const rootId = rootNodeId.value
  if (!rootId) return 0
  return (linksByTargetId.value.get(rootId) ?? []).filter(matchesSelectedLinkType).length
})

watch(
  () => props.selectedNode?.id ?? null,
  (nodeId) => {
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
  { immediate: true },
)

watch(linkTypeOptions, (options) => {
  if (selectedLinkTypeFilter.value === ALL_LINK_TYPES_FILTER) return
  const selectedExists = options.some((option) => option.id === selectedLinkTypeFilter.value)
  if (!selectedExists) {
    selectedLinkTypeFilter.value = ALL_LINK_TYPES_FILTER
  }
})

const focusRootOnDiagram = () => {
  if (!rootNodeId.value) return
  suppressNextSelectionReset.value = true
  emit('focus-node', rootNodeId.value)
}

const getLinksForNode = (nodeId: string): EditorLink[] =>
  direction.value === 'down'
    ? (linksBySourceId.value.get(nodeId) ?? []).filter(matchesSelectedLinkType)
    : (linksByTargetId.value.get(nodeId) ?? []).filter(matchesSelectedLinkType)

const resolveNextNodeId = (link: EditorLink): string =>
  direction.value === 'down' ? link.targetId : link.sourceId

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
          @click="diagramsOpen = !diagramsOpen"
        >
          <UiIcon
            name="chevron_right"
            class="tp-section__chevron"
            :class="{ 'tp-section__chevron--open': diagramsOpen }"
          />
          <span class="tp-section__label">{{ t('models.traceabilityDiagramsTitle') }}</span>
          <span class="tp-section__count">{{ diagramsUsingRootNode.length }}</span>
        </button>

        <Transition name="tp-collapse">
          <div v-if="diagramsOpen" class="tp-section__body">
            <div v-if="diagramsUsingRootNode.length === 0" class="tp-section__empty">
              {{ t('models.traceabilityNoDiagrams') }}
            </div>
            <div v-else class="tp-diagrams">
              <div
                v-for="diagram in diagramsUsingRootNode"
                :key="diagram.id"
                class="tp-diagram"
                @mousedown.prevent
                @selectstart.prevent
                @dblclick.prevent="emit('open-diagram', diagram.id)"
              >
                <UiIcon name="dashboard" class="tp-diagram__icon" />
                <span class="tp-diagram__name">{{ diagram.name }}</span>
                <span class="tp-diagram__version">{{ diagram.version }}</span>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Trace tree section -->
      <div class="tp-section tp-section--tree">
        <div class="tp-section__head tp-section__head--tree">
          <button type="button" class="tp-section__toggle" @click="treeOpen = !treeOpen">
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
                {{ direction === 'down' ? outgoingCount : incomingCount }}
              </span>
            </button>
            <label class="tp-nav__filter">
              <UiIcon name="filter_alt" class="tp-nav__filter-icon" />
              <select v-model="selectedLinkTypeFilter" class="tp-nav__filter-select">
                <option :value="ALL_LINK_TYPES_FILTER">
                  {{ t('models.traceabilityAllLinkTypes') }}
                </option>
                <option v-for="typeOption in linkTypeOptions" :key="typeOption.id" :value="typeOption.id">
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
          <div v-if="treeOpen && rootNode" class="tp-section__body tp-section__body--tree">
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
            <div class="tp-tree">
              <div class="tp-tree__root" @click="focusRootOnDiagram">
                <span class="tp-tree__root-dot" />
                <span class="tp-tree__root-name">{{ rootNode.name }}</span>
              </div>
              <ModelTraceBranch
                :node-id="rootNode.id"
                :path="[rootNode.id]"
                :node-by-id="nodeById"
                :get-links-for-node="getLinksForNode"
                :get-link-type-name="getLinkTypeName"
                :resolve-next-node-id="resolveNextNodeId"
                :is-link-expanded="isLinkExpanded"
                :toggle-link="toggleLink"
                :get-link-status="getLinkStatus"
                @set-root="setRootFromTree"
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
  transition: color 0.15s ease, background 0.15s ease;
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
