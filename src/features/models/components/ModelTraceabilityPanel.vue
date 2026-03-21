<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorDiagram, EditorLink, EditorNode } from '../types'
import ModelTraceBranch from './ModelTraceBranch.vue'

type DirectionMode = 'down' | 'up'

const props = defineProps<{
  selectedNode: EditorNode | null
  nodes: EditorNode[]
  links: EditorLink[]
  diagrams: EditorDiagram[]
}>()

const { t } = useI18n()

const direction = ref<DirectionMode>('down')
const rootNodeId = ref<string | null>(null)
const backStack = ref<string[]>([])
const forwardStack = ref<string[]>([])
const expandedLinkKeys = ref<Set<string>>(new Set())
const diagramsOpen = ref(true)
const treeOpen = ref(true)

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

const rootNode = computed(() => {
  const rootId = rootNodeId.value
  if (!rootId) return null
  return nodeById.value.get(rootId) ?? null
})

const diagramsUsingRootNode = computed(() => {
  const rootId = rootNodeId.value
  if (!rootId) return []
  return props.diagrams.filter((diagram) =>
    diagram.parsedAttrs.instances.nodes.some((instance) => instance.modelNodeId === rootId)
  )
})

const canGoBack = computed(() => backStack.value.length > 0)
const canGoForward = computed(() => forwardStack.value.length > 0)

watch(
  () => props.selectedNode?.id ?? null,
  (nodeId) => {
    rootNodeId.value = nodeId
    backStack.value = []
    forwardStack.value = []
    expandedLinkKeys.value = new Set()
    direction.value = 'down'
  },
  { immediate: true }
)

const getLinksForNode = (nodeId: string): EditorLink[] =>
  direction.value === 'down'
    ? (linksBySourceId.value.get(nodeId) ?? [])
    : (linksByTargetId.value.get(nodeId) ?? [])

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
</script>

<template>
  <div class="trace">
    <div v-if="!selectedNode" class="trace__empty">
      <UiIcon name="account_tree" class="trace__empty-icon" />
      <span class="trace__empty-text">{{ t('models.traceabilityNoNode') }}</span>
    </div>
    <template v-else>
      <div class="trace__section">
        <div class="trace__section-header">
          <button type="button" class="trace__section-toggle" @click="diagramsOpen = !diagramsOpen">
            <UiIcon
              name="chevron_right"
              class="trace__section-arrow"
              :class="{ 'trace__section-arrow--closed': !diagramsOpen }"
            />
            <div class="trace__section-title">{{ t('models.traceabilityDiagramsTitle') }}</div>
          </button>
          <span class="trace__counter">{{ diagramsUsingRootNode.length }}</span>
        </div>
        <div v-if="diagramsOpen && diagramsUsingRootNode.length === 0" class="trace__hint">
          {{ t('models.traceabilityNoDiagrams') }}
        </div>
        <ul v-else-if="diagramsOpen" class="trace__diagrams-list">
          <li v-for="diagram in diagramsUsingRootNode" :key="diagram.id" class="trace__diagram-item">
            <UiIcon name="table_chart" class="trace__diagram-icon" />
            <span class="trace__diagram-name">{{ diagram.name }}</span>
            <span class="trace__diagram-version">{{ diagram.version }}</span>
          </li>
        </ul>
      </div>

      <div class="trace__section">
        <div class="trace__section-header">
          <button type="button" class="trace__section-toggle" @click="treeOpen = !treeOpen">
            <UiIcon
              name="chevron_right"
              class="trace__section-arrow"
              :class="{ 'trace__section-arrow--closed': !treeOpen }"
            />
            <div class="trace__section-title">{{ t('models.traceabilityTreeTitle') }}</div>
          </button>
          <div class="trace__section-controls">
            <button
              type="button"
              class="trace__icon-btn"
              :class="{ 'trace__icon-btn--active': direction === 'down' }"
              :title="t('models.traceabilityDirectionDown')"
              @click="direction = 'down'"
            >
              <UiIcon name="south" />
            </button>
            <button
              type="button"
              class="trace__icon-btn"
              :class="{ 'trace__icon-btn--active': direction === 'up' }"
              :title="t('models.traceabilityDirectionUp')"
              @click="direction = 'up'"
            >
              <UiIcon name="north" />
            </button>
            <button
              type="button"
              class="trace__icon-btn"
              :title="t('common.back')"
              :disabled="!canGoBack"
              @click="goBack"
            >
              <UiIcon name="arrow_back" />
            </button>
            <button
              type="button"
              class="trace__icon-btn"
              :title="t('common.forward')"
              :disabled="!canGoForward"
              @click="goForward"
            >
              <UiIcon name="arrow_forward" />
            </button>
          </div>
        </div>
        <div v-if="treeOpen && rootNode" class="trace-tree">
          <div class="trace-tree__node trace-tree__node--root">
            <UiIcon name="account_tree" class="trace-tree__root-icon" />
            <span class="trace-tree__root-label">{{ rootNode.name }}</span>
          </div>
          <ModelTraceBranch
            :node-id="rootNode.id"
            :path="[rootNode.id]"
            :node-by-id="nodeById"
            :get-links-for-node="getLinksForNode"
            :resolve-next-node-id="resolveNextNodeId"
            :is-link-expanded="isLinkExpanded"
            :toggle-link="toggleLink"
            @set-root="setRootFromTree"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.trace {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
}

.trace__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 220px;
  border: 1px dashed var(--border);
  border-radius: 0;
  background: var(--surface-muted);
  padding: 18px;
}

.trace__empty-icon {
  color: var(--text-subtle);
}

.trace__empty-text {
  color: var(--text-muted);
  text-align: center;
}

.trace__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  cursor: pointer;
  color: var(--base-text);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.trace__icon-btn .ui-icon {
  width: 18px;
  height: 18px;
}

.trace__icon-btn:hover {
  background: var(--surface-strong);
  border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
}

.trace__icon-btn--active {
  background: var(--primary-soft);
  border-color: color-mix(in srgb, var(--primary) 50%, var(--border));
  color: var(--primary);
}

.trace__icon-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.trace__section {
  border: 1px solid var(--border);
  border-radius: 0;
  padding: 12px;
  background: var(--surface);
}

.trace__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding: 0 6px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  transition: background 0.15s ease;
}

.trace__section-header:hover {
  background: var(--surface-muted);
}

.trace__section-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.trace__section-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 28px;
  padding: 0 6px 0 0;
  border: none;
  background: transparent;
  border-radius: 0;
  cursor: pointer;
}

.trace__section-toggle:hover {
  background: var(--surface-muted);
}

.trace__section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--base-text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0;
  line-height: 1;
}

.trace__section-arrow {
  width: 16px;
  height: 16px;
  color: var(--text-subtle);
  transform: rotate(90deg);
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.trace__section-arrow--closed {
  transform: rotate(0deg);
}

.trace__counter {
  min-width: 24px;
  height: 20px;
  padding: 0 6px;
  border-radius: 0;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-muted);
}

.trace__hint {
  color: var(--text-muted);
  font-size: 12px;
}

.trace__diagrams-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.trace__diagram-item {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 0;
  border: 1px solid var(--border);
  background: var(--surface-muted);
}

.trace__diagram-icon {
  color: var(--text-subtle);
}

.trace__diagram-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.trace__diagram-version {
  font-size: 11px;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 0;
  padding: 1px 6px;
}

.trace-tree {
  margin-top: 8px;
}

.trace-tree__node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  border-radius: 0;
  padding: 6px 10px;
}

.trace-tree__node--root {
  font-weight: 600;
  margin-bottom: 6px;
}

.trace-tree__root-icon {
  color: var(--primary);
  width: 16px;
  height: 16px;
}

.trace-tree__root-label {
  color: var(--base-text);
}
</style>
