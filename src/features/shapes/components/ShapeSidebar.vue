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
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__header">
      <span class="material-symbols-outlined sidebar__header-icon">hexagon</span>
      <span class="sidebar__header-text">{{ t("shapes.title") }}</span>
    </div>
    <div class="sidebar__search">
      <span class="material-symbols-outlined sidebar__search-icon">search</span>
      <input
        v-model="shapeSearchQuery"
        class="sidebar__search-input"
        type="text"
        :placeholder="t('shapes.searchPlaceholder')"
      />
      <button
        v-if="shapeSearchQuery"
        type="button"
        class="sidebar__clear-btn"
        :title="t('common.clearSearch')"
        @click="shapeSearchQuery = ''"
      >
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div class="type-section">
      <div class="type-section__header">
        <h3 class="type-section__title">{{ t("shapes.listTitle") }}</h3>
        <button
          type="button"
          class="type-section__add-btn"
          :title="t('shapes.addShape')"
          @click="emit('addShape')"
        >
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
      <div v-if="isLoading" class="type-section__loading">
        <span class="loading-pulse"></span>
        {{ t("common.loading") }}
      </div>
      <template v-else>
        <div v-if="shapes.length === 0" class="type-section__empty">{{ t("shapes.noShapes") }}</div>
        <div v-else-if="sortedShapes.length === 0" class="type-section__empty">
          {{ t("common.nothingFound") }}
        </div>
        <ul v-else class="type-list">
          <li
            v-for="(shape, idx) in sortedShapes"
            :key="shape.id"
            class="type-list__item"
            :class="{ 'type-list__item--selected': selectedShapeId === shape.id }"
            :style="{ animationDelay: `${idx * 30}ms` }"
            @click="emit('selectShape', shape.id)"
          >
            <span class="material-symbols-outlined type-list__icon">hexagon</span>
            <span class="type-list__name">{{ shape.name || t("common.unnamed") }}</span>
            <span
              v-if="!shape.canEdit"
              class="type-list__lock"
              :title="t('shapes.noEditRights')"
            >
              <span class="material-symbols-outlined">lock</span>
            </span>
          </li>
        </ul>
      </template>
    </div>
  </aside>
</template>

<style scoped>
@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulseGlow {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.sidebar {
  width: 272px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.sidebar__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border);
}

.sidebar__header-icon {
  font-size: 20px;
  color: var(--primary);
}

.sidebar__header-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.01em;
}

.sidebar__search {
  position: relative;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.sidebar__search-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--text-subtle);
  pointer-events: none;
}

.sidebar__search-input {
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

.sidebar__search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(124, 92, 252, 0.12);
}

.sidebar__search-input::placeholder {
  color: var(--text-subtle);
}

.sidebar__clear-btn {
  position: absolute;
  right: 18px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--surface-strong);
  color: var(--text-subtle);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.sidebar__clear-btn .material-symbols-outlined {
  font-size: 14px;
}

.sidebar__clear-btn:hover {
  background: var(--border-strong);
  color: var(--base-text);
}

.type-section {
  padding: 14px 0 8px;
}

.type-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 8px;
}

.type-section__title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.type-section__add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.type-section__add-btn .material-symbols-outlined {
  font-size: 16px;
}

.type-section__add-btn:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
  transform: scale(1.08);
}

.type-section__loading,
.type-section__empty {
  padding: 12px 18px;
  font-size: 13px;
  color: var(--text-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  animation: pulseGlow 1s ease-in-out infinite;
  flex-shrink: 0;
}

.type-list {
  list-style: none;
  margin: 0;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.type-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--base-text);
  transition: all 0.15s ease;
  animation: fadeSlideIn 0.3s ease both;
  position: relative;
}

.type-list__item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 3px;
  height: 60%;
  border-radius: 0 2px 2px 0;
  background: var(--primary);
  transition: transform 0.2s ease;
}

.type-list__item:hover {
  background: var(--surface-strong);
}

.type-list__item--selected {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 500;
}

.type-list__item--selected::before {
  transform: translateY(-50%) scaleY(1);
}

.type-list__item--selected:hover {
  background: var(--primary-soft);
}

.type-list__icon {
  font-size: 18px;
  flex-shrink: 0;
  opacity: 0.7;
}

.type-list__item--selected .type-list__icon {
  opacity: 1;
}

.type-list__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-list__lock {
  color: var(--text-subtle);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.type-list__lock .material-symbols-outlined {
  font-size: 16px;
}
</style>
