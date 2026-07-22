<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NodeShapeResponse } from '@/types/api'
import { canEditByAccessPermission } from '@/utils/accessPermission'
import EditorSidebarShell from '@/components/list/EditorSidebarShell.vue'

const props = defineProps<{
  shapes: NodeShapeResponse[]
  selectedShapeId: string | null
  isLoading: boolean
}>()

const emit = defineEmits<{
  selectShape: [id: string]
  addShape: []
}>()

const shapeSearchQuery = ref('')
const { t, locale } = useI18n()

const filteredShapes = computed(() => {
  const query = shapeSearchQuery.value.trim().toLowerCase()
  if (!query) return props.shapes
  return props.shapes.filter(s => s.name.toLowerCase().includes(query))
})

const sortedShapes = computed(() => {
  const localeTag = locale.value === 'ru' ? 'ru' : 'en'
  return [...filteredShapes.value].sort((a, b) =>
    (a.name || '~~~').localeCompare(b.name || '~~~', localeTag, {
      sensitivity: 'base',
      numeric: true,
    }),
  )
})

const totalCount = computed(() => props.shapes.length)
</script>

<template>
  <EditorSidebarShell
    v-model:search-query="shapeSearchQuery"
    :title="t('shapes.title')"
    :count="totalCount"
    :is-loading="isLoading"
    :search-placeholder="t('shapes.searchPlaceholder')"
  >
    <template #actions>
      <button
        type="button"
        class="ess-action-btn"
        :title="t('shapes.addShape')"
        @click="emit('addShape')"
      >
        <UiIcon name="add" />
      </button>
    </template>

    <div v-if="props.shapes.length === 0" class="ess-empty">{{ t('shapes.noShapes') }}</div>
    <div v-else-if="sortedShapes.length === 0" class="ess-empty">{{ t('common.nothingFound') }}</div>
    <ul v-else class="shape-sidebar__items">
      <li
        v-for="(shape, idx) in sortedShapes"
        :key="shape.id"
        class="shape-sidebar__item"
        :class="{ 'shape-sidebar__item--active': selectedShapeId === shape.id }"
        :style="{ animationDelay: `${idx * 30}ms` }"
        role="button"
        tabindex="0"
        @click="emit('selectShape', shape.id)"
        @keydown.enter.prevent="emit('selectShape', shape.id)"
        @keydown.space.prevent="emit('selectShape', shape.id)"
      >
        <UiIcon name="hexagon" class="shape-sidebar__item-icon" />
        <div class="shape-sidebar__item-info">
          <span class="shape-sidebar__item-name">{{ shape.name || t('common.unnamed') }}</span>
        </div>
        <span
          v-if="!canEditByAccessPermission(shape.accessPermission)"
          class="shape-sidebar__item-lock"
          :title="t('shapes.noEditRights')"
        >
          <UiIcon name="lock" />
        </span>
      </li>
    </ul>
  </EditorSidebarShell>
</template>

<style scoped>
.shape-sidebar__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shape-sidebar__item {
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
  animation: shapeSidebarFadeIn 0.25s ease both;
}

.shape-sidebar__item:hover {
  background: var(--surface-strong);
}

.shape-sidebar__item:not(.shape-sidebar__item--active):hover {
  border-left-color: rgba(124, 92, 252, 0.3);
}

.shape-sidebar__item--active {
  background: var(--primary-soft);
  border-left-color: var(--primary);
}

.shape-sidebar__item--active:hover {
  background: var(--primary-soft);
}

.shape-sidebar__item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

@keyframes shapeSidebarFadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.shape-sidebar__item-icon {
  width: 20px;
  height: 20px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.shape-sidebar__item--active .shape-sidebar__item-icon {
  color: var(--primary);
}

.shape-sidebar__item-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.shape-sidebar__item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shape-sidebar__item-lock {
  color: var(--text-subtle);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.shape-sidebar__item-lock .ui-icon {
  width: 16px;
  height: 16px;
}
</style>
