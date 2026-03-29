<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CompositeSerializedCComponent } from '../../notationAttrs'
import { createId } from '../../notationAttrs'

type TreeNodeRef = { node: CompositeSerializedCComponent; parentId: string | null; depth: number }

const props = defineProps<{
  modelValue: CompositeSerializedCComponent
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: CompositeSerializedCComponent): void
  (e: 'target-options', value: Array<{ id: string; label: string }>): void
}>()
const { t } = useI18n()

const selectedId = ref<string | null>(null)

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
  depth = 0
): void {
  visitor(root, parentId, depth)
  if (root.content) traverse(root.content, visitor, root.id ?? null, depth + 1)
  if (Array.isArray(root.children)) root.children.forEach((child) => traverse(child, visitor, root.id ?? null, depth + 1))
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
      label: `${'  '.repeat(depth)}${node.type}${node.id ? ` (${node.id})` : ''}`,
    }))
)

watch(
  targetOptions,
  (next) => emit('target-options', next),
  { immediate: true }
)

function replaceNodeById(
  root: CompositeSerializedCComponent,
  nodeId: string,
  updater: (node: CompositeSerializedCComponent) => void
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
  nodeId: string
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

function addChild(type: CompositeSerializedCComponent['type']): void {
  const next = cloneRoot()
  ensureId(next)
  const targetId = selectedId.value ?? next.id!
  const newNode: CompositeSerializedCComponent =
    type === 'container'
      ? { id: createId(), type: 'container', direction: 'column', children: [] }
      : type === 'text'
        ? { id: createId(), type: 'text', text: 'Text' }
        : type === 'icon'
          ? { id: createId(), type: 'icon', source: '/icons/widgets.svg' }
          : type === 'divider'
            ? { id: createId(), type: 'divider' }
            : { id: createId(), type: 'shape', content: { id: createId(), type: 'container', children: [] } }

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
  const next = cloneRoot()
  const parent = findParentCollection(next, selectedId.value)
  if (!parent) return
  const [node] = parent.collection.splice(parent.index, 1)
  const moved = replaceNodeById(next, newParentId, (target) => {
    if (!Array.isArray(target.children)) target.children = []
    target.children.push(node)
  })
  if (moved) emit('update:modelValue', next)
}

function updateSelectedField(field: string, value: string): void {
  if (!selectedId.value) return
  const next = cloneRoot()
  const ok = replaceNodeById(next, selectedId.value, (node) => {
    ;(node as unknown as Record<string, unknown>)[field] = value
  })
  if (ok) emit('update:modelValue', next)
}

const selectedNode = computed(() => treeNodes.value.find((n) => n.node.id === selectedId.value)?.node ?? null)
</script>

<template>
  <div class="tree-editor">
    <div class="tree-editor__toolbar">
      <button type="button" @click="addChild('container')">{{ t('nodeStyle.compositeAddContainer') }}</button>
      <button type="button" @click="addChild('text')">{{ t('nodeStyle.compositeAddText') }}</button>
      <button type="button" @click="addChild('icon')">{{ t('nodeStyle.compositeAddIcon') }}</button>
      <button type="button" @click="addChild('divider')">{{ t('nodeStyle.compositeAddDivider') }}</button>
      <button type="button" @click="addChild('shape')">{{ t('nodeStyle.compositeAddShape') }}</button>
    </div>

    <div class="tree-editor__body">
      <div class="tree-editor__tree">
        <button
          v-for="entry in treeNodes"
          :key="entry.node.id ?? `${entry.depth}-${entry.node.type}`"
          type="button"
          class="tree-editor__row"
          :class="{ 'tree-editor__row--active': selectedId === entry.node.id }"
          @click="selectedId = entry.node.id ?? null"
        >
          <span :style="{ paddingLeft: `${entry.depth * 12}px` }">
            {{ entry.node.type }} {{ entry.node.id ? `(${entry.node.id})` : '' }}
          </span>
        </button>
      </div>

      <div class="tree-editor__props" v-if="selectedNode">
        <div class="tree-editor__actions">
          <button type="button" @click="moveSelected(-1)">{{ t('nodeStyle.compositeMoveUp') }}</button>
          <button type="button" @click="moveSelected(1)">{{ t('nodeStyle.compositeMoveDown') }}</button>
          <button type="button" class="danger" @click="removeSelected">{{ t('nodeStyle.compositeRemove') }}</button>
        </div>
        <label>
          {{ t('nodeStyle.compositeReparentTo') }}
          <select @change="reparentSelected(($event.target as HTMLSelectElement).value)">
            <option value="">--</option>
            <option v-for="target in targetOptions" :key="`p-${target.id}`" :value="target.id">
              {{ target.label }}
            </option>
          </select>
        </label>
        <label v-if="selectedNode.type === 'text'">
          {{ t('nodeStyle.compositeText') }}
          <input :value="selectedNode.text ?? ''" @input="updateSelectedField('text', ($event.target as HTMLInputElement).value)" />
        </label>
        <label v-if="selectedNode.type === 'text'">
          role
          <input :value="selectedNode.role ?? ''" @input="updateSelectedField('role', ($event.target as HTMLInputElement).value)" />
        </label>
        <label v-if="selectedNode.type === 'icon'">
          {{ t('nodeStyle.compositeIconSource') }}
          <input :value="selectedNode.source ?? ''" @input="updateSelectedField('source', ($event.target as HTMLInputElement).value)" />
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tree-editor { display: flex; flex-direction: column; gap: 8px; }
.tree-editor__toolbar { display: flex; gap: 6px; flex-wrap: wrap; }
.tree-editor__body { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tree-editor__tree { border: 1px solid var(--border); border-radius: 8px; overflow: auto; max-height: 260px; }
.tree-editor__row { width: 100%; border: 0; background: transparent; text-align: left; padding: 6px 8px; cursor: pointer; }
.tree-editor__row--active { background: color-mix(in srgb, var(--primary) 12%, transparent); }
.tree-editor__props { border: 1px solid var(--border); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.tree-editor__actions { display: flex; gap: 6px; }
.tree-editor button, .tree-editor select, .tree-editor input { min-height: 30px; border: 1px solid var(--border); border-radius: 6px; padding: 0 8px; background: var(--surface); }
.tree-editor .danger { color: var(--danger); }
.tree-editor label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-muted); }
</style>

