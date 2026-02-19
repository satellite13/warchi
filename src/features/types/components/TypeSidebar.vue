<script setup lang="ts">
import { computed, ref } from "vue"
import type { TypeItem } from "../composables/useTypeEditor"

const props = defineProps<{
  nodeTypes: TypeItem[]
  linkTypes: TypeItem[]
  selectedTypeId: string | null
  isLoading: boolean
}>()

const emit = defineEmits<{
  selectType: [id: string]
  addType: [kind: "node" | "link"]
}>()

const typeSearchQuery = ref("")

function sortTypes(types: TypeItem[]): TypeItem[] {
  return [...types].sort((a, b) =>
    (a.name || "~~~").localeCompare((b.name || "~~~"), "ru", {
      sensitivity: "base",
      numeric: true
    })
  )
}

const filteredNodeTypes = computed(() => {
  const query = typeSearchQuery.value.trim().toLowerCase()
  const filtered = !query
    ? props.nodeTypes
    : props.nodeTypes.filter((t) => t.name.toLowerCase().includes(query))
  return sortTypes(filtered)
})

const filteredLinkTypes = computed(() => {
  const query = typeSearchQuery.value.trim().toLowerCase()
  const filtered = !query
    ? props.linkTypes
    : props.linkTypes.filter((t) => t.name.toLowerCase().includes(query))
  return sortTypes(filtered)
})
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__header">
      <span class="material-symbols-outlined sidebar__header-icon">category</span>
      <span class="sidebar__header-text">Типы</span>
    </div>
    <div class="sidebar__search">
      <span class="material-symbols-outlined sidebar__search-icon">search</span>
      <input
        v-model="typeSearchQuery"
        class="sidebar__search-input"
        type="text"
        placeholder="Поиск типа..."
      >
      <button
        v-if="typeSearchQuery"
        type="button"
        class="sidebar__clear-btn"
        title="Очистить поиск"
        @click="typeSearchQuery = ''"
      >
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div class="type-section">
      <div class="type-section__header">
        <h3 class="type-section__title">Типы узлов</h3>
        <button
          type="button"
          class="type-section__add-btn"
          title="Добавить тип узла"
          @click="emit('addType', 'node')"
        >
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
      <div v-if="isLoading" class="type-section__loading">
        <span class="loading-pulse"></span>
        Загрузка...
      </div>
      <template v-else>
        <div v-if="nodeTypes.length === 0" class="type-section__empty">Нет типов</div>
        <div v-else-if="filteredNodeTypes.length === 0" class="type-section__empty">Ничего не найдено</div>
        <ul v-else class="type-list">
          <li
            v-for="(t, idx) in filteredNodeTypes"
            :key="t.id"
            class="type-list__item"
            :class="{ 'type-list__item--selected': selectedTypeId === t.id }"
            :style="{ animationDelay: `${idx * 30}ms` }"
            @click="emit('selectType', t.id)"
          >
            <span class="material-symbols-outlined type-list__icon">category</span>
            <span class="type-list__name">{{ t.name || 'Без имени' }}</span>
            <span v-if="t._isNew" class="type-list__badge">новый</span>
          </li>
        </ul>
      </template>
    </div>

    <div class="type-section">
      <div class="type-section__header">
        <h3 class="type-section__title">Типы связей</h3>
        <button
          type="button"
          class="type-section__add-btn"
          title="Добавить тип связи"
          @click="emit('addType', 'link')"
        >
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
      <div v-if="isLoading" class="type-section__loading">
        <span class="loading-pulse"></span>
        Загрузка...
      </div>
      <template v-else>
        <div v-if="linkTypes.length === 0" class="type-section__empty">Нет типов</div>
        <div v-else-if="filteredLinkTypes.length === 0" class="type-section__empty">Ничего не найдено</div>
        <ul v-else class="type-list">
          <li
            v-for="(t, idx) in filteredLinkTypes"
            :key="t.id"
            class="type-list__item"
            :class="{ 'type-list__item--selected': selectedTypeId === t.id }"
            :style="{ animationDelay: `${idx * 30}ms` }"
            @click="emit('selectType', t.id)"
          >
            <span class="material-symbols-outlined type-list__icon">link</span>
            <span class="type-list__name">{{ t.name || 'Без имени' }}</span>
            <span v-if="t._isNew" class="type-list__badge">новый</span>
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
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
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

/* Sections */
.type-section {
  padding: 14px 0 8px;
}

.type-section + .type-section {
  border-top: 1px solid var(--border);
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

/* List */
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
  content: '';
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

.type-list__badge {
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
</style>
