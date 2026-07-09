<script setup lang="ts">
import { computed } from "vue"
import { useRouter } from "vue-router"
import { getGradient } from "@/utils/gradientColors"
interface EntityItem {
  id: string
  name: string
  version: string
  updatedAt?: string | null | undefined
}

const props = defineProps<{
  icon: string
  title: string
  linkLabel?: string
  linkRoute?: string
  items: EntityItem[]
  isLoading: boolean
  emptyIcon: string
  emptyText: string
  routeName: string
  skeletonCount?: number
  formatRelativeDate?: (date: string | null | undefined) => string
}>()

const emit = defineEmits<{
  linkClick: []
}>()

const router = useRouter()

const displayItems = computed(() => props.items)
</script>

<template>
  <section class="section">
    <div class="section__header">
      <UiIcon :name="icon" class="section__icon" />
      <h2 class="section__title">{{ title }}</h2>
      <button
        v-if="linkLabel"
        type="button"
        class="section__link"
        @click="emit('linkClick')"
      >
        {{ linkLabel }}
        <UiIcon name="arrow_forward" />
      </button>
    </div>
    <div v-if="isLoading" class="skeleton-list">
      <div
        v-for="i in (skeletonCount || 3)"
        :key="i"
        class="skeleton-item"
        :class="{ 'skeleton-item--sm': skeletonCount && skeletonCount > 3 }"
      />
    </div>
    <div v-else-if="items.length === 0" class="section__empty">
      <UiIcon :name="emptyIcon" />
      <span>{{ emptyText }}</span>
    </div>
    <div v-else class="entity-list">
      <button
        v-for="item in displayItems"
        :key="item.id"
        type="button"
        class="entity-row"
        @click="router.push({ name: routeName, params: { id: item.id } })"
      >
        <div class="entity-row__gradient" :style="{ background: getGradient(item.id) }" />
        <div class="entity-row__body">
          <span class="entity-row__name">{{ item.name }}</span>
          <span class="entity-row__version">v{{ item.version }}</span>
        </div>
        <span class="entity-row__date">{{ formatRelativeDate?.(item.updatedAt) }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.section__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.section__icon {
  width: 18px;
  height: 18px;
  color: var(--text-subtle);
}

.section__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.01em;
}

.section__link {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.section__link:hover {
  background: var(--primary-soft);
}

.section__link .ui-icon {
  width: 14px;
  height: 14px;
}

.section__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 28px 0;
  color: var(--text-subtle);
  font-size: 13px;
}

.section__empty .ui-icon {
  width: 32px;
  height: 32px;
  opacity: 0.5;
}

.entity-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.entity-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: var(--surface-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.entity-row:hover {
  background: var(--surface-strong);
  border-color: var(--border);
  transform: translateX(2px);
}

.entity-row__gradient {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}

.entity-row__gradient::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 40%, rgba(0, 0, 0, 0.12) 100%);
}

.entity-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.entity-row__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-row__version {
  font-size: 11px;
  color: var(--text-subtle);
  font-variant-numeric: tabular-nums;
}

.entity-row__date {
  font-size: 11px;
  color: var(--text-subtle);
  white-space: nowrap;
  flex-shrink: 0;
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-item {
  height: 56px;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--surface-strong) 25%, var(--surface-muted) 50%, var(--surface-strong) 75%);
  background-size: 400% 100%;
  animation: shimmer 1.8s ease infinite;
}

.skeleton-item--sm {
  height: 40px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
