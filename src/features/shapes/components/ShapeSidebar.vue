<script setup lang="ts">
import { computed, ref } from "vue"
import { useI18n } from "vue-i18n"
import type { NodeShapeResponse } from "../../../types/api"

const props = defineProps<{
  shapes: NodeShapeResponse[]
  selectedShapeId: string | null
  isLoading: boolean
}>()

const emit = defineEmits<{
  selectShape: [id: string]
  addShape: []
}>()

const shapeSearchQuery = ref("")
const { t, locale } = useI18n()

const filteredShapes = computed(() => {
  const query = shapeSearchQuery.value.trim().toLowerCase()
  if (!query) return props.shapes
  return props.shapes.filter((s) => s.name.toLowerCase().includes(query))
})

const sortedShapes = computed(() =>
  [...filteredShapes.value].sort((a, b) =>
    (a.name || "~~~").localeCompare(b.name || "~~~", locale.value === "en" ? "en" : "ru", {
      sensitivity: "base",
      numeric: true
    })
  )
)

const totalCount = computed(() => props.shapes.length)
</script>

<template>
  <aside class="shape-sidebar">
    <div class="shape-sidebar__header">
      <div class="shape-sidebar__title-row">
        <h3 class="shape-sidebar__title">{{ t("shapes.title") }}</h3>
        <span v-if="totalCount > 0" class="shape-sidebar__count">{{ totalCount }}</span>
      </div>
      <div class="shape-sidebar__actions">
        <button
          type="button"
          class="shape-sidebar__add-btn"
          :title="t('shapes.addShape')"
          @click="emit('addShape')"
        >
          <UiIcon name="add" />
        </button>
      </div>
    </div>

    <div class="shape-sidebar__search">
      <div class="shape-sidebar__search-wrap">
        <UiIcon name="search" class="shape-sidebar__search-icon" />
        <input
          v-model="shapeSearchQuery"
          class="shape-sidebar__search-input"
          type="text"
          :placeholder="t('shapes.searchPlaceholder')"
        >
        <button
          v-if="shapeSearchQuery"
          type="button"
          class="shape-sidebar__clear-btn"
          :title="t('common.clearSearch')"
          @click="shapeSearchQuery = ''"
        >
          <UiIcon name="close" />
        </button>
      </div>
    </div>

    <div class="shape-sidebar__list">
      <div v-if="isLoading" class="shape-sidebar__loading">
        <span class="shape-sidebar__loading-dot" />
        {{ t("common.loading") }}
      </div>
      <template v-else>
        <div v-if="props.shapes.length === 0" class="shape-sidebar__empty">{{ t("shapes.noShapes") }}</div>
        <div v-else-if="sortedShapes.length === 0" class="shape-sidebar__empty">{{ t("common.nothingFound") }}</div>
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
              <span class="shape-sidebar__item-name">{{ shape.name || t("common.unnamed") }}</span>
            </div>
            <span
              v-if="!shape.canEdit"
              class="shape-sidebar__item-lock"
              :title="t('shapes.noEditRights')"
            >
              <UiIcon name="lock" />
            </span>
          </li>
        </ul>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.shape-sidebar {
  width: 272px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.shape-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.shape-sidebar__title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.shape-sidebar__title {
  margin: 0;
  font-size: var(--heading-font-size, 14px);
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: var(--heading-letter-spacing, -0.01em);
}

.shape-sidebar__count {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 2px 9px;
  border-radius: 12px;
  font-variant-numeric: tabular-nums;
}

.shape-sidebar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.shape-sidebar__add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.shape-sidebar__add-btn .ui-icon {
  width: 16px;
  height: 16px;
}

.shape-sidebar__add-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.shape-sidebar__search {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.shape-sidebar__search-wrap {
  position: relative;
  min-width: 0;
  flex: 1;
}

.shape-sidebar__search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: var(--text-subtle);
  pointer-events: none;
}

.shape-sidebar__search-input {
  width: 100%;
  padding: 7px 10px 7px 34px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  background: var(--surface-muted);
  color: var(--base-text);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.shape-sidebar__search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(124, 92, 252, 0.12);
}

.shape-sidebar__search-input::placeholder {
  color: var(--text-subtle);
}

.shape-sidebar__clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: var(--surface-strong);
  color: var(--text-subtle);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.shape-sidebar__clear-btn .ui-icon {
  width: 14px;
  height: 14px;
}

.shape-sidebar__clear-btn:hover {
  background: var(--border-strong);
  color: var(--base-text);
}

.shape-sidebar__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px;
}

.shape-sidebar__loading,
.shape-sidebar__empty {
  padding: 12px 10px;
  font-size: 13px;
  color: var(--text-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}

.shape-sidebar__loading-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  animation: shapeSidebarPulse 1s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes shapeSidebarPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

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
  transition: background 0.15s ease, border-left-color 0.15s ease;
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
