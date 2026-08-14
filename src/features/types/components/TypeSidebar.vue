<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { DEFAULT_ENTITY_ICONS } from '@/config/iconOptions'
import type { TypeItem } from '../composables/useTypeEditor'
import { toAccessLabel } from '@/utils/accessPermission'
import EditorSidebarShell from '@/components/list/EditorSidebarShell.vue'
import SidebarListItem from '@/components/list/SidebarListItem.vue'
import CollapsibleSection from '@/components/ui/CollapsibleSection.vue'

const props = defineProps<{
  nodeTypes: TypeItem[]
  linkTypes: TypeItem[]
  currentUserId: string | null
  selectedTypeId: string | null
  isLoading: boolean
  selectionMode: boolean
  checkedIds: Set<string>
}>()

const emit = defineEmits<{
  selectType: [id: string]
  addType: [kind: 'node' | 'link']
  toggleSelectionMode: []
  toggleCheck: [id: string]
  batchShare: []
}>()

const typeSearchQuery = ref('')
const { t, locale } = useI18n()

function sortTypes(types: TypeItem[]): TypeItem[] {
  const localeTag = locale.value === 'ru' ? 'ru' : 'en'
  return [...types].sort((a, b) =>
    (a.name || '~~~').localeCompare(b.name || '~~~', localeTag, {
      sensitivity: 'base',
      numeric: true,
    }),
  )
}

const filteredNodeTypes = computed(() => {
  const query = typeSearchQuery.value.trim().toLowerCase()
  const filtered = !query
    ? props.nodeTypes
    : props.nodeTypes.filter(item => item.name.toLowerCase().includes(query))
  return sortTypes(filtered)
})

const filteredLinkTypes = computed(() => {
  const query = typeSearchQuery.value.trim().toLowerCase()
  const filtered = !query
    ? props.linkTypes
    : props.linkTypes.filter(item => item.name.toLowerCase().includes(query))
  return sortTypes(filtered)
})

const totalCount = computed(() => props.nodeTypes.length + props.linkTypes.length)
const checkedCount = computed(() => props.checkedIds.size)

function isCheckable(item: TypeItem): boolean {
  return !item._isNew && !!props.currentUserId && item.ownerId === props.currentUserId
}

function handleItemClick(id: string) {
  if (props.selectionMode) {
    const item =
      props.nodeTypes.find(item => item.id === id) ?? props.linkTypes.find(item => item.id === id)
    if (item && isCheckable(item)) {
      emit('toggleCheck', id)
    }
  } else {
    emit('selectType', id)
  }
}

const nodeTypesExpanded = ref(true)
const linkTypesExpanded = ref(true)
</script>

<template>
  <EditorSidebarShell
    v-model:search-query="typeSearchQuery"
    :title="t('types.title')"
    :count="totalCount"
    :is-loading="isLoading"
    :search-placeholder="t('types.searchTypePlaceholder')"
  >
    <template #actions>
      <button
        type="button"
        class="btn--icon"
        :class="{ 'btn--icon--active': selectionMode }"
        :title="t('types.selectMode')"
        @click="emit('toggleSelectionMode')"
      >
        <UiIcon name="checklist" />
      </button>
      <button
        v-if="!selectionMode"
        type="button"
        class="btn--icon"
        :title="t('types.addNodeType')"
        @click="emit('addType', 'node')"
      >
        <UiIcon :name="DEFAULT_ENTITY_ICONS.nodeType" />
      </button>
      <button
        v-if="!selectionMode"
        type="button"
        class="btn--icon"
        :title="t('types.addLinkType')"
        @click="emit('addType', 'link')"
      >
        <UiIcon :name="DEFAULT_ENTITY_ICONS.link" />
      </button>
    </template>

    <CollapsibleSection
      class="type-sidebar__section"
      :title="t('types.nodeTypes')"
      :open="nodeTypesExpanded"
      variant="panel"
      @toggle="nodeTypesExpanded = !nodeTypesExpanded"
    >
      <template #header-extra>
        <span v-if="nodeTypes.length > 0" class="type-sidebar__section-count">{{
          nodeTypes.length
        }}</span>
      </template>
      <div v-if="nodeTypes.length === 0" class="ess-empty">{{ t('types.noTypes') }}</div>
      <div v-else-if="filteredNodeTypes.length === 0" class="ess-empty">
        {{ t('common.nothingFound') }}
      </div>
      <ul v-else class="type-sidebar__items">
        <SidebarListItem
          v-for="(typeItem, idx) in filteredNodeTypes"
          :key="typeItem.id"
          :title="typeItem.name || t('common.unnamed')"
          :icon-id="typeItem.parsedAttrs?.icon || ''"
          :icon="DEFAULT_ENTITY_ICONS.nodeType"
          :active="!selectionMode && selectedTypeId === typeItem.id"
          :checked="selectionMode && checkedIds.has(typeItem.id)"
          :show-checkbox="selectionMode"
          :checkbox-disabled="!isCheckable(typeItem)"
          :badge="
            !typeItem._isNew ? toAccessLabel(typeItem.accessPermission, locale) || '' : ''
          "
          :is-new="!!typeItem._isNew"
          :new-label="t('common.new')"
          :animation-index="idx"
          @click="handleItemClick(typeItem.id)"
        />
      </ul>
    </CollapsibleSection>

    <CollapsibleSection
      class="type-sidebar__section"
      :title="t('types.linkTypes')"
      :open="linkTypesExpanded"
      variant="panel"
      @toggle="linkTypesExpanded = !linkTypesExpanded"
    >
      <template #header-extra>
        <span v-if="linkTypes.length > 0" class="type-sidebar__section-count">{{
          linkTypes.length
        }}</span>
      </template>
      <div v-if="linkTypes.length === 0" class="ess-empty">{{ t('types.noTypes') }}</div>
      <div v-else-if="filteredLinkTypes.length === 0" class="ess-empty">
        {{ t('common.nothingFound') }}
      </div>
      <ul v-else class="type-sidebar__items">
        <SidebarListItem
          v-for="(typeItem, idx) in filteredLinkTypes"
          :key="typeItem.id"
          :title="typeItem.name || t('common.unnamed')"
          :icon-id="typeItem.parsedAttrs?.icon || ''"
          :icon="DEFAULT_ENTITY_ICONS.link"
          tone="accent"
          :active="!selectionMode && selectedTypeId === typeItem.id"
          :checked="selectionMode && checkedIds.has(typeItem.id)"
          :show-checkbox="selectionMode"
          :checkbox-disabled="!isCheckable(typeItem)"
          :badge="
            !typeItem._isNew ? toAccessLabel(typeItem.accessPermission, locale) || '' : ''
          "
          :is-new="!!typeItem._isNew"
          :new-label="t('common.new')"
          :animation-index="idx"
          @click="handleItemClick(typeItem.id)"
        />
      </ul>
    </CollapsibleSection>

    <template #footer>
      <Transition name="batch-bar">
        <div v-if="selectionMode && checkedCount > 0" class="type-sidebar__batch-bar">
          <span class="type-sidebar__batch-count">{{
            t('types.selectedCount', { count: checkedCount })
          }}</span>
          <button
            type="button"
            class="btn btn--primary type-sidebar__batch-share-btn"
            @click="emit('batchShare')"
          >
            <UiIcon name="share" />
            {{ t('types.shareSelected') }}
          </button>
        </div>
      </Transition>
    </template>
  </EditorSidebarShell>
</template>

<style scoped>
.type-sidebar__section {
  padding: 4px 0 0;
}

.type-sidebar__section + .type-sidebar__section {
  margin-top: 4px;
}

.type-sidebar__section-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  background: var(--surface-strong);
  padding: 2px 6px;
  border-radius: 8px;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

.type-sidebar__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.type-sidebar__batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
}

.type-sidebar__batch-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.type-sidebar__batch-share-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease;
}

.type-sidebar__batch-share-btn:hover {
  background: var(--primary-hover);
}

.type-sidebar__batch-share-btn .ui-icon {
  width: 16px;
  height: 16px;
}

.batch-bar-enter-active,
.batch-bar-leave-active {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.batch-bar-enter-from,
.batch-bar-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
