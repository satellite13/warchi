<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { deleteUnused } from '../api'
import type { UnusedLink, UnusedNode } from '../types'

const props = defineProps<{
  modelId: string
  nodes: UnusedNode[]
  links: UnusedLink[]
}>()

const emit = defineEmits<{ deleted: [] }>()

const { t } = useI18n()

const selectedNodeIds = ref<Set<string>>(new Set())
const selectedLinkIds = ref<Set<string>>(new Set())
const deleting = ref(false)
const error = ref<string | null>(null)

watch(
  () => [props.nodes, props.links] as const,
  () => {
    selectedNodeIds.value = new Set()
    selectedLinkIds.value = new Set()
    error.value = null
  }
)

const allNodesSelected = computed(
  () => props.nodes.length > 0 && selectedNodeIds.value.size === props.nodes.length
)
const allLinksSelected = computed(
  () => props.links.length > 0 && selectedLinkIds.value.size === props.links.length
)
const selectedCount = computed(
  () => selectedNodeIds.value.size + selectedLinkIds.value.size
)

function toggleNode(id: string, checked: boolean): void {
  const next = new Set(selectedNodeIds.value)
  if (checked) {
    next.add(id)
  } else {
    next.delete(id)
  }
  selectedNodeIds.value = next
}

function toggleLink(id: string, checked: boolean): void {
  const next = new Set(selectedLinkIds.value)
  if (checked) {
    next.add(id)
  } else {
    next.delete(id)
  }
  selectedLinkIds.value = next
}

function toggleAllNodes(checked: boolean): void {
  selectedNodeIds.value = checked ? new Set(props.nodes.map(node => node.id)) : new Set()
}

function toggleAllLinks(checked: boolean): void {
  selectedLinkIds.value = checked ? new Set(props.links.map(link => link.id)) : new Set()
}

async function onDelete(): Promise<void> {
  if (selectedCount.value === 0 || deleting.value) return
  if (!window.confirm(t('models.validationReportDeleteConfirm', { count: selectedCount.value }))) {
    return
  }
  deleting.value = true
  error.value = null
  const result = await deleteUnused(props.modelId, {
    nodeIds: [...selectedNodeIds.value],
    linkIds: [...selectedLinkIds.value],
  })
  deleting.value = false
  if (result.success) {
    selectedNodeIds.value = new Set()
    selectedLinkIds.value = new Set()
    emit('deleted')
  } else {
    error.value = result.error.message?.trim() || t('models.validationReportDeleteError')
  }
}
</script>

<template>
  <div class="validation-unused">
    <p class="validation-unused__hint">{{ t('models.validationReportUnusedHint') }}</p>
    <p v-if="error" class="validation-unused__error">{{ error }}</p>

    <div v-if="nodes.length > 0" class="validation-unused__block">
      <label class="validation-unused__block-header">
        <input
          type="checkbox"
          :checked="allNodesSelected"
          @change="toggleAllNodes(($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('models.validationReportUnusedNodes') }}</span>
      </label>
      <ul class="validation-unused__list">
        <li v-for="node in nodes" :key="node.id" class="validation-unused__item">
          <label>
            <input
              type="checkbox"
              :checked="selectedNodeIds.has(node.id)"
              @change="toggleNode(node.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="validation-unused__name">{{ node.name }}</span>
            <span v-if="node.parentName" class="validation-unused__parent">{{ node.parentName }}</span>
          </label>
        </li>
      </ul>
    </div>

    <div v-if="links.length > 0" class="validation-unused__block">
      <label class="validation-unused__block-header">
        <input
          type="checkbox"
          :checked="allLinksSelected"
          @change="toggleAllLinks(($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('models.validationReportUnusedLinks') }}</span>
      </label>
      <ul class="validation-unused__list">
        <li v-for="link in links" :key="link.id" class="validation-unused__item">
          <label>
            <input
              type="checkbox"
              :checked="selectedLinkIds.has(link.id)"
              @change="toggleLink(link.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="validation-unused__name">{{ link.sourceName }} → {{ link.targetName }}</span>
            <span class="validation-unused__parent">{{ link.linkTypeName }}</span>
          </label>
        </li>
      </ul>
    </div>

    <button
      class="validation-unused__delete"
      type="button"
      :disabled="selectedCount === 0 || deleting"
      @click="onDelete"
    >
      {{ t('models.validationReportDeleteSelected', { count: selectedCount }) }}
    </button>
  </div>
</template>

<style scoped>
.validation-unused {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.validation-unused__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-subtle);
}

.validation-unused__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

.validation-unused__block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.validation-unused__block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.validation-unused__list {
  margin: 0;
  padding: 0 0 0 24px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.validation-unused__item label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
}

.validation-unused__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.validation-unused__parent {
  color: var(--text-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.validation-unused__delete {
  align-self: flex-start;
  padding: 6px 14px;
  border: 1px solid var(--danger);
  border-radius: 8px;
  background: var(--danger);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.validation-unused__delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
