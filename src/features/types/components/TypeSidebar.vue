<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { DEFAULT_ENTITY_ICONS } from '@/config/iconOptions'
import type { TypeItem } from '../composables/useTypeEditor'
import { toAccessLabel } from '@/utils/accessPermission'
import EditorSidebarShell from '@/components/list/EditorSidebarShell.vue'
import LazyIconImg from '@/components/forms/LazyIconImg.vue'

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
        class="ess-action-btn"
        :class="{ 'ess-action-btn--active': selectionMode }"
        :title="t('types.selectMode')"
        @click="emit('toggleSelectionMode')"
      >
        <UiIcon name="checklist" />
      </button>
      <button
        v-if="!selectionMode"
        type="button"
        class="ess-action-btn"
        :title="t('types.addNodeType')"
        @click="emit('addType', 'node')"
      >
        <UiIcon :name="DEFAULT_ENTITY_ICONS.nodeType" />
      </button>
      <button
        v-if="!selectionMode"
        type="button"
        class="ess-action-btn"
        :title="t('types.addLinkType')"
        @click="emit('addType', 'link')"
      >
        <UiIcon :name="DEFAULT_ENTITY_ICONS.link" />
      </button>
    </template>

    <div class="type-sidebar__section">
      <button
        type="button"
        class="type-sidebar__section-header"
        :aria-expanded="nodeTypesExpanded"
        @click="nodeTypesExpanded = !nodeTypesExpanded"
      >
        <UiIcon
          name="expand_more"
          class="type-sidebar__section-chevron"
          :class="{ 'type-sidebar__section-chevron--collapsed': !nodeTypesExpanded }"
        />
        <span class="type-sidebar__section-label">{{ t('types.nodeTypes') }}</span>
        <span v-if="nodeTypes.length > 0" class="type-sidebar__section-count">{{
          nodeTypes.length
        }}</span>
      </button>
      <div v-show="nodeTypesExpanded" class="type-sidebar__section-content">
        <div v-if="nodeTypes.length === 0" class="ess-empty">{{ t('types.noTypes') }}</div>
        <div v-else-if="filteredNodeTypes.length === 0" class="ess-empty">
          {{ t('common.nothingFound') }}
        </div>
        <ul v-else class="type-sidebar__items">
          <li
            v-for="(typeItem, idx) in filteredNodeTypes"
            :key="typeItem.id"
            class="type-sidebar__item"
            :class="{
              'type-sidebar__item--active': !selectionMode && selectedTypeId === typeItem.id,
              'type-sidebar__item--checked': selectionMode && checkedIds.has(typeItem.id),
            }"
            :style="{ animationDelay: `${idx * 30}ms` }"
            role="button"
            tabindex="0"
            @click="handleItemClick(typeItem.id)"
            @keydown.enter.prevent="handleItemClick(typeItem.id)"
            @keydown.space.prevent="handleItemClick(typeItem.id)"
          >
            <input
              v-if="selectionMode"
              type="checkbox"
              class="type-sidebar__checkbox"
              :checked="checkedIds.has(typeItem.id)"
              :disabled="!isCheckable(typeItem)"
              tabindex="-1"
              @click.stop="handleItemClick(typeItem.id)"
            >
            <LazyIconImg
              v-if="typeItem.parsedAttrs?.icon"
              :icon-id="typeItem.parsedAttrs.icon"
              :alt="typeItem.name ?? ''"
              img-class="type-sidebar__item-icon type-sidebar__item-icon--svg"
              eager
            />
            <UiIcon
              v-else
              :name="DEFAULT_ENTITY_ICONS.nodeType"
              class="type-sidebar__item-icon"
            />
            <div class="type-sidebar__item-info">
              <span class="type-sidebar__item-name">{{
                typeItem.name || t('common.unnamed')
              }}</span>
              <span
                v-if="!typeItem._isNew && toAccessLabel(typeItem.accessPermission, locale)"
                class="type-sidebar__item-badge"
              >
                {{ toAccessLabel(typeItem.accessPermission, locale) }}
              </span>
            </div>
            <span v-if="typeItem._isNew" class="type-sidebar__item-new">{{ t('common.new') }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="type-sidebar__section">
      <button
        type="button"
        class="type-sidebar__section-header"
        :aria-expanded="linkTypesExpanded"
        @click="linkTypesExpanded = !linkTypesExpanded"
      >
        <UiIcon
          name="expand_more"
          class="type-sidebar__section-chevron"
          :class="{ 'type-sidebar__section-chevron--collapsed': !linkTypesExpanded }"
        />
        <span class="type-sidebar__section-label">{{ t('types.linkTypes') }}</span>
        <span v-if="linkTypes.length > 0" class="type-sidebar__section-count">{{
          linkTypes.length
        }}</span>
      </button>
      <div v-show="linkTypesExpanded" class="type-sidebar__section-content">
        <div v-if="linkTypes.length === 0" class="ess-empty">{{ t('types.noTypes') }}</div>
        <div v-else-if="filteredLinkTypes.length === 0" class="ess-empty">
          {{ t('common.nothingFound') }}
        </div>
        <ul v-else class="type-sidebar__items">
          <li
            v-for="(typeItem, idx) in filteredLinkTypes"
            :key="typeItem.id"
            class="type-sidebar__item type-sidebar__item--link"
            :class="{
              'type-sidebar__item--active': !selectionMode && selectedTypeId === typeItem.id,
              'type-sidebar__item--checked': selectionMode && checkedIds.has(typeItem.id),
            }"
            :style="{ animationDelay: `${idx * 30}ms` }"
            role="button"
            tabindex="0"
            @click="handleItemClick(typeItem.id)"
            @keydown.enter.prevent="handleItemClick(typeItem.id)"
            @keydown.space.prevent="handleItemClick(typeItem.id)"
          >
            <input
              v-if="selectionMode"
              type="checkbox"
              class="type-sidebar__checkbox"
              :checked="checkedIds.has(typeItem.id)"
              :disabled="!isCheckable(typeItem)"
              tabindex="-1"
              @click.stop="handleItemClick(typeItem.id)"
            >
            <LazyIconImg
              v-if="typeItem.parsedAttrs?.icon"
              :icon-id="typeItem.parsedAttrs.icon"
              :alt="typeItem.name ?? ''"
              img-class="type-sidebar__item-icon type-sidebar__item-icon--svg"
              eager
            />
            <UiIcon v-else :name="DEFAULT_ENTITY_ICONS.link" class="type-sidebar__item-icon" />
            <div class="type-sidebar__item-info">
              <span class="type-sidebar__item-name">{{
                typeItem.name || t('common.unnamed')
              }}</span>
              <span
                v-if="!typeItem._isNew && toAccessLabel(typeItem.accessPermission, locale)"
                class="type-sidebar__item-badge"
              >
                {{ toAccessLabel(typeItem.accessPermission, locale) }}
              </span>
            </div>
            <span v-if="typeItem._isNew" class="type-sidebar__item-new">{{ t('common.new') }}</span>
          </li>
        </ul>
      </div>
    </div>

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
  padding-top: 10px;
}

.type-sidebar__section + .type-sidebar__section {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.type-sidebar__section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0 4px 6px;
  margin: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.15s ease;
}

.type-sidebar__section-header:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.type-sidebar__section-chevron {
  width: 18px;
  height: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.type-sidebar__section-chevron--collapsed {
  transform: rotate(-90deg);
}

.type-sidebar__section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  flex: 1;
  min-width: 0;
}

.type-sidebar__section-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  background: var(--surface-strong);
  padding: 2px 6px;
  border-radius: 8px;
  font-variant-numeric: tabular-nums;
}

.type-sidebar__section-content {
  padding-top: 2px;
}

.type-sidebar__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.type-sidebar__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition:
    background 0.15s ease,
    border-left-color 0.15s ease;
  border-left: 3px solid transparent;
  box-sizing: border-box;
  animation: typeSidebarFadeIn 0.25s ease both;
}

.type-sidebar__item:hover {
  background: var(--surface-strong);
}

.type-sidebar__item:not(.type-sidebar__item--active):hover {
  border-left-color: rgba(124, 92, 252, 0.3);
}

.type-sidebar__item--active {
  background: var(--primary-soft);
  border-left-color: var(--primary);
}

.type-sidebar__item--active:hover {
  background: var(--primary-soft);
}

.type-sidebar__item--link.type-sidebar__item--active {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-left-color: var(--accent);
}

.type-sidebar__item--link.type-sidebar__item--active:hover {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}

.type-sidebar__item--link:not(.type-sidebar__item--active):hover {
  border-left-color: color-mix(in srgb, var(--accent) 65%, transparent);
}

.type-sidebar__item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

@keyframes typeSidebarFadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.type-sidebar__item-icon {
  width: 20px;
  height: 20px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.type-sidebar__item-icon--svg {
  object-fit: contain;
}

.type-sidebar__item--active .type-sidebar__item-icon {
  color: var(--primary);
}

.type-sidebar__item--link .type-sidebar__item-icon {
  color: var(--accent);
}

.type-sidebar__item--link.type-sidebar__item--active .type-sidebar__item-icon {
  color: var(--accent);
}

.type-sidebar__item-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.type-sidebar__item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-sidebar__item-badge {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-sidebar__item-new {
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: uppercase;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

.type-sidebar__checkbox {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
  margin: 0;
}

.type-sidebar__checkbox:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.type-sidebar__item--checked {
  background: var(--primary-soft);
  border-left-color: var(--primary);
}

.type-sidebar__item--link.type-sidebar__item--checked {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-left-color: var(--accent);
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
