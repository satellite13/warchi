<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NodeShapeResponse } from '@/types/api'
import { canEditByAccessPermission } from '@/utils/accessPermission'
import EditorSidebarShell from '@/components/list/EditorSidebarShell.vue'
import SidebarListItem from '@/components/list/SidebarListItem.vue'

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
      <SidebarListItem
        v-for="(shape, idx) in sortedShapes"
        :key="shape.id"
        :title="shape.name || t('common.unnamed')"
        icon="hexagon"
        :active="selectedShapeId === shape.id"
        :locked="!canEditByAccessPermission(shape.accessPermission)"
        :lock-title="t('shapes.noEditRights')"
        :animation-index="idx"
        @click="emit('selectShape', shape.id)"
      />
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
</style>
