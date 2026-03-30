<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CompositeSerializedCComponent } from '../../notationAttrs'
import { createId } from '../../notationAttrs'
import CompositeNodeInspector from './CompositeNodeInspector.vue'

type TreeNodeRef = { node: CompositeSerializedCComponent; parentId: string | null; depth: number }

const props = defineProps<{
  modelValue: CompositeSerializedCComponent
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: CompositeSerializedCComponent): void
  (e: 'target-options', value: Array<{ id: string; label: string }>): void
  (e: 'update:selectedId', value: string | null): void
}>()
const { t } = useI18n()

const selectedId = ref<string | null>(null)

watch(selectedId, (id) => emit('update:selectedId', id))

function cloneRoot(): CompositeSerializedCComponent {
  return JSON.parse(JSON.stringify(props.modelValue)) as CompositeSerializedCComponent
}

function ensureId(node: CompositeSerializedCComponent): void {
  if (!node.id) node.id = createId()
  if (node.content) ensureId(node.content)
  if (Array.isArray(node.children)) node.children.forEach(ensureId)
}

function traverse(
  root: CompositeSerializedCComponent,
  visitor: (node: CompositeSerializedCComponent, parentId: string | null, depth: number) => void,
  parentId: string | null = null,
  depth = 0,
): void {
  visitor(root, parentId, depth)
  if (root.content) traverse(root.content, visitor, root.id ?? null, depth + 1)
  if (Array.isArray(root.children))
    root.children.forEach((child) => traverse(child, visitor, root.id ?? null, depth + 1))
}

const treeNodes = computed<TreeNodeRef[]>(() => {
  const out: TreeNodeRef[] = []
  traverse(props.modelValue, (node, parentId, depth) => {
    out.push({ node, parentId, depth })
  })
  return out
})

const targetOptions = computed(() =>
  treeNodes.value
    .filter(({ node }) => typeof node.id === 'string' && node.id.length > 0)
    .map(({ node, depth }) => ({
      id: node.id as string,
      label: `${'  '.repeat(depth)}${node.label || node.type}`,
    })),
)

const containerTargetOptions = computed(() =>
  treeNodes.value
    .filter(({ node }) => typeof node.id === 'string' && node.id.length > 0 && (node.type === 'container' || node.type === 'shape'))
    .map(({ node, depth }) => ({
      id: node.id as string,
      label: `${'  '.repeat(depth)}${node.label || node.type}`,
    })),
)

watch(targetOptions, (next) => emit('target-options', next), { immediate: true })

function replaceNodeById(
  root: CompositeSerializedCComponent,
  nodeId: string,
  updater: (node: CompositeSerializedCComponent) => void,
): boolean {
  if (root.id === nodeId) {
    updater(root)
    return true
  }
  if (root.content && replaceNodeById(root.content, nodeId, updater)) return true
  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      if (replaceNodeById(child, nodeId, updater)) return true
    }
  }
  return false
}

function findParentCollection(
  root: CompositeSerializedCComponent,
  nodeId: string,
): { collection: CompositeSerializedCComponent[]; index: number } | null {
  if (Array.isArray(root.children)) {
    const idx = root.children.findIndex((child) => child.id === nodeId)
    if (idx >= 0) return { collection: root.children, index: idx }
    for (const child of root.children) {
      const nested = findParentCollection(child, nodeId)
      if (nested) return nested
    }
  }
  if (root.content) {
    if (root.content.id === nodeId) return null
    return findParentCollection(root.content, nodeId)
  }
  return null
}

/** Only containers can accept children directly. Shape delegates to its inner content container. */
function canAcceptChildren(node: CompositeSerializedCComponent): boolean {
  return node.type === 'container'
}

function findNearestContainer(nodeId: string): string | null {
  const entry = treeNodes.value.find((n) => n.node.id === nodeId)
  if (!entry) return null
  if (canAcceptChildren(entry.node)) return nodeId
  // For shape, target its inner content container
  if (entry.node.type === 'shape' && entry.node.content?.id) return entry.node.content.id
  // Walk up to parent
  if (entry.parentId) return findNearestContainer(entry.parentId)
  return null
}

function addChild(type: CompositeSerializedCComponent['type']): void {
  const next = cloneRoot()
  ensureId(next)
  const rawTargetId = selectedId.value ?? next.id!
  const targetId = findNearestContainer(rawTargetId) ?? next.id!
  const newNode: CompositeSerializedCComponent =
    type === 'container'
      ? { id: createId(), type: 'container', label: shortId('container'), direction: 'column', children: [] }
      : type === 'text'
        ? { id: createId(), type: 'text', label: shortId('text'), text: 'Text' }
        : type === 'icon'
          ? { id: createId(), type: 'icon', label: shortId('icon'), source: '' }
          : type === 'divider'
            ? { id: createId(), type: 'divider', label: shortId('divider') }
            : {
                id: createId(),
                type: 'shape',
                label: shortId('shape'),
                borderColor: '#333333',
                borderWidth: 1,
                backgroundColor: '#f5f5f5',
                padding: 4,
                content: { id: createId(), type: 'container', label: shortId('container'), children: [] },
              }

  const updated = replaceNodeById(next, targetId, (node) => {
    if (!Array.isArray(node.children)) node.children = []
    node.children.push(newNode)
  })
  if (updated) {
    selectedId.value = newNode.id!
    emit('update:modelValue', next)
  }
}

function removeSelected(): void {
  if (!selectedId.value) return
  const next = cloneRoot()
  const parent = findParentCollection(next, selectedId.value)
  if (!parent) return
  parent.collection.splice(parent.index, 1)
  selectedId.value = null
  emit('update:modelValue', next)
}

function moveSelected(direction: -1 | 1): void {
  if (!selectedId.value) return
  const next = cloneRoot()
  const parent = findParentCollection(next, selectedId.value)
  if (!parent) return
  const targetIdx = parent.index + direction
  if (targetIdx < 0 || targetIdx >= parent.collection.length) return
  const [item] = parent.collection.splice(parent.index, 1)
  parent.collection.splice(targetIdx, 0, item)
  emit('update:modelValue', next)
}

function reparentSelected(newParentId: string): void {
  if (!selectedId.value || !newParentId || selectedId.value === newParentId) return
  const resolvedParentId = findNearestContainer(newParentId)
  if (!resolvedParentId || resolvedParentId === selectedId.value) return
  const next = cloneRoot()
  const parent = findParentCollection(next, selectedId.value)
  if (!parent) return
  const [node] = parent.collection.splice(parent.index, 1)
  const moved = replaceNodeById(next, resolvedParentId, (target) => {
    if (!Array.isArray(target.children)) target.children = []
    target.children.push(node)
  })
  if (moved) emit('update:modelValue', next)
}

function updateSelectedField(field: string, value: unknown): void {
  if (!selectedId.value) return
  const next = cloneRoot()
  const ok = replaceNodeById(next, selectedId.value, (node) => {
    const parts = field.split('.')
    if (parts.length === 1) {
      ;(node as unknown as Record<string, unknown>)[field] = value
    } else {
      let target = node as unknown as Record<string, unknown>
      for (let i = 0; i < parts.length - 1; i++) {
        if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
          target[parts[i]] = {}
        }
        target = target[parts[i]] as Record<string, unknown>
      }
      target[parts[parts.length - 1]] = value
    }
  })
  if (ok) emit('update:modelValue', next)
}

const selectedNode = computed(
  () => treeNodes.value.find((n) => n.node.id === selectedId.value)?.node ?? null,
)

/** Whether the selected node can be removed (not root, not shape's content container) */
const canRemoveSelected = computed(() => {
  if (!selectedId.value) return false
  // Root node
  if (selectedId.value === props.modelValue.id) return false
  // Check if it's removable (has a parent collection)
  return findParentCollection(props.modelValue, selectedId.value) !== null
})

/** Whether the selected node can be moved up/down */
const canMoveSelected = computed(() => {
  if (!selectedId.value) return false
  return findParentCollection(props.modelValue, selectedId.value) !== null
})

/** Generate short human-readable id for new nodes */
function shortId(type: string): string {
  const counters: Record<string, number> = {}
  function count(node: CompositeSerializedCComponent) {
    const t = node.type
    counters[t] = (counters[t] ?? 0) + 1
    if (node.content) count(node.content)
    if (Array.isArray(node.children)) node.children.forEach(count)
  }
  count(props.modelValue)
  const n = (counters[type] ?? 0) + 1
  return `${type}${n}`
}

const TYPE_ICONS: Record<string, string> = {
  container: 'view_column',
  text: 'text_fields',
  icon: 'image',
  divider: 'horizontal_rule',
  shape: 'crop_square',
}
</script>

<template>
  <div class="tree-editor">
    <div class="tree-editor__toolbar">
      <button type="button" class="tree-editor__tool-btn" @click="addChild('container')">
        <UiIcon name="view_column" />{{ t('nodeStyle.compositeAddContainer') }}
      </button>
      <button type="button" class="tree-editor__tool-btn" @click="addChild('text')">
        <UiIcon name="text_fields" />{{ t('nodeStyle.compositeAddText') }}
      </button>
      <button type="button" class="tree-editor__tool-btn" @click="addChild('icon')">
        <UiIcon name="image" />{{ t('nodeStyle.compositeAddIcon') }}
      </button>
      <button type="button" class="tree-editor__tool-btn" @click="addChild('divider')">
        <UiIcon name="horizontal_rule" />{{ t('nodeStyle.compositeAddDivider') }}
      </button>
      <button type="button" class="tree-editor__tool-btn" @click="addChild('shape')">
        <UiIcon name="crop_square" />{{ t('nodeStyle.compositeAddShape') }}
      </button>
    </div>

    <div class="tree-editor__body">
      <!-- Tree panel -->
      <div class="tree-editor__tree-panel">
        <div class="tree-editor__tree">
          <button
            v-for="entry in treeNodes"
            :key="entry.node.id ?? `${entry.depth}-${entry.node.type}`"
            type="button"
            class="tree-editor__row"
            :class="{ 'tree-editor__row--active': selectedId === entry.node.id }"
            @click="selectedId = entry.node.id ?? null"
          >
            <span class="tree-editor__row-inner" :style="{ paddingLeft: `${entry.depth * 16}px` }">
              <span class="tree-editor__row-icon-wrap" :class="`tree-editor__row-icon-wrap--${entry.node.type}`">
                <UiIcon
                  :name="TYPE_ICONS[entry.node.type] ?? 'help'"
                  class="tree-editor__row-icon"
                />
              </span>
              <span class="tree-editor__row-type">{{ entry.node.label || entry.node.type }}</span>
            </span>
          </button>
        </div>

        <!-- Actions under tree -->
        <div v-if="selectedNode" class="tree-editor__actions">
          <button type="button" class="tree-editor__act-btn" :disabled="!canMoveSelected" @click="moveSelected(-1)">
            <UiIcon name="arrow_upward" />
          </button>
          <button type="button" class="tree-editor__act-btn" :disabled="!canMoveSelected" @click="moveSelected(1)">
            <UiIcon name="arrow_downward" />
          </button>
          <select
            class="tree-editor__reparent"
            @change="reparentSelected(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t('nodeStyle.compositeReparentTo') }}</option>
            <option v-for="target in containerTargetOptions" :key="`p-${target.id}`" :value="target.id">
              {{ target.label }}
            </option>
          </select>
          <button type="button" class="tree-editor__act-btn tree-editor__act-btn--danger" :disabled="!canRemoveSelected" @click="removeSelected">
            <UiIcon name="delete" />
          </button>
        </div>
      </div>

      <!-- Inspector panel -->
      <div class="tree-editor__inspector-panel">
        <CompositeNodeInspector
          :selected-node="selectedNode"
          @update:field="updateSelectedField"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tree-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tree-editor__toolbar {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tree-editor__tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 11px;
  color: var(--base-text);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.tree-editor__tool-btn:hover {
  background: var(--surface-muted);
  border-color: var(--border-strong);
}

.tree-editor__tool-btn :deep(.ui-icon) {
  width: 14px;
  height: 14px;
  color: var(--text-subtle);
}

.tree-editor__body {
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: 6px;
}

.tree-editor__tree-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 0;
}

.tree-editor__tree {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.tree-editor__row {
  display: flex;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 0;
  cursor: pointer;
  transition: background 0.1s ease;
}

.tree-editor__row:hover {
  background: var(--surface-muted);
}

.tree-editor__row--active {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
}

.tree-editor__row--active:hover {
  background: color-mix(in srgb, var(--primary) 18%, transparent);
}

.tree-editor__row-inner {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  min-width: 0;
}

.tree-editor__row-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  flex-shrink: 0;
}

.tree-editor__row-icon-wrap--container { background: color-mix(in srgb, #6366f1 14%, transparent); color: #6366f1; }
.tree-editor__row-icon-wrap--text { background: color-mix(in srgb, #0ea5e9 14%, transparent); color: #0ea5e9; }
.tree-editor__row-icon-wrap--icon { background: color-mix(in srgb, #f59e0b 14%, transparent); color: #f59e0b; }
.tree-editor__row-icon-wrap--divider { background: color-mix(in srgb, #94a3b8 14%, transparent); color: #94a3b8; }
.tree-editor__row-icon-wrap--shape { background: color-mix(in srgb, #10b981 14%, transparent); color: #10b981; }

.tree-editor__row-icon {
  width: 14px;
  height: 14px;
  color: inherit;
  flex-shrink: 0;
}

.tree-editor__row-type {
  font-size: 11px;
  font-weight: 600;
  color: var(--base-text);
  flex-shrink: 0;
}

.tree-editor__row-id {
  font-size: 10px;
  color: var(--text-subtle);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-editor__actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.tree-editor__act-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  cursor: pointer;
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.tree-editor__act-btn:hover {
  background: var(--surface-muted);
}

.tree-editor__act-btn :deep(.ui-icon) {
  width: 14px;
  height: 14px;
  color: var(--text-subtle);
}

.tree-editor__act-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.tree-editor__act-btn--danger :deep(.ui-icon) {
  color: var(--danger);
}

.tree-editor__reparent {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
}

.tree-editor__inspector-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}
</style>
