<script setup lang="ts">
import {ref, computed, watch, nextTick} from "vue";
import type {NotationEditorState} from "../types";
import type {NotationData} from "../../../types/entities";

const props = defineProps<{
  state: NotationEditorState;
  notation?: NotationData | null;
  selectedId?: string | null;
}>();

const emit = defineEmits<{
  select: [kind: "component" | "relation", id: string];
  "create-component": [];
  "create-relation": [];
  "remove-item": [kind: "component" | "relation", id: string];
}>();

const searchQuery = ref("");
const selectedTags = ref<Set<string>>(new Set());
const tagsExpanded = ref(true);

type ListItem = {
  id: string;
  kind: "component" | "relation";
  name: string;
  typeLabel: string;
  tags: string[];
};

const allTags = computed<string[]>(() => {
  const tagSet = new Set<string>();
  for (const c of props.state.components) {
    if (!c._isDeleted) {
      c.parsedAttrs.tags.forEach(t => tagSet.add(t));
    }
  }
  for (const r of props.state.relations) {
    if (!r._isDeleted) {
      r.parsedAttrs.tags.forEach(t => tagSet.add(t));
    }
  }
  return [...tagSet].sort();
});

const toggleTag = (tag: string) => {
  const next = new Set(selectedTags.value);
  if (next.has(tag)) {
    next.delete(tag);
  } else {
    next.add(tag);
  }
  selectedTags.value = next;
};

const items = computed<ListItem[]>(() => {
  const query = searchQuery.value.toLowerCase().trim();
  const activeTags = selectedTags.value;

  const components: ListItem[] = props.state.components
    .filter(c => !c._isDeleted)
    .map(c => ({
      id: c.id,
      kind: "component" as const,
      name: c.name,
      typeLabel: props.state.nodeTypes.find(t => t.id === c.nodeTypeId)?.name || "",
      tags: c.parsedAttrs.tags
    }));

  const relations: ListItem[] = props.state.relations
    .filter(r => !r._isDeleted)
    .map(r => ({
      id: r.id,
      kind: "relation" as const,
      name: r.name,
      typeLabel: props.state.linkTypes.find(t => t.id === r.linkTypeId)?.name || "",
      tags: r.parsedAttrs.tags
    }));

  let all = [...components, ...relations];

  if (query) {
    all = all.filter(item => item.name.toLowerCase().includes(query));
  }

  if (activeTags.size > 0) {
    all = all.filter(item => item.tags.some(t => activeTags.has(t)));
  }

  return all;
});

const itemsContainer = ref<HTMLElement | null>(null);

watch(() => props.selectedId, (id) => {
  if (!id || !itemsContainer.value) return;
  nextTick(() => {
    const el = itemsContainer.value?.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
    el?.scrollIntoView({block: "nearest", behavior: "smooth"});
  });
});
</script>

<template>
  <div class="component-list">
    <div v-if="notation" class="notation-info">
      <div class="notation-info__name">{{ notation.name }}</div>
      <div class="notation-info__meta">
        <span class="notation-info__version">v{{ notation.version }}</span>
        <span v-if="notation.updatedAt" class="notation-info__date">
          {{ new Date(notation.updatedAt).toLocaleDateString("ru-RU") }}
        </span>
      </div>
    </div>
    <div class="component-list__header">
      <h3 class="component-list__title">Элементы</h3>
      <div class="component-list__actions">
        <span class="component-list__count">{{ items.length }}</span>
        <button type="button" class="add-btn" title="Добавить компонент" @click="emit('create-component')">
          <span class="material-symbols-outlined">category</span>
        </button>
        <button type="button" class="add-btn" title="Добавить отношение" @click="emit('create-relation')">
          <span class="material-symbols-outlined">conversion_path</span>
        </button>
      </div>
    </div>

    <div class="component-list__search">
      <span class="material-symbols-outlined search-icon">search</span>
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Поиск..."
      >
      <button
        v-if="searchQuery"
        type="button"
        class="clear-btn"
        @click="searchQuery = ''"
      >
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div v-if="allTags.length > 0" class="component-list__tags-section">
      <button type="button" class="tags-toggle" @click="tagsExpanded = !tagsExpanded">
        <span class="tags-toggle__label">Теги</span>
        <span v-if="selectedTags.size > 0" class="tags-toggle__count">{{ selectedTags.size }}</span>
        <span class="material-symbols-outlined tags-toggle__icon" :class="{ 'tags-toggle__icon--collapsed': !tagsExpanded }">
          expand_more
        </span>
      </button>
      <div v-if="tagsExpanded" class="component-list__tags">
        <button
          v-for="tag in allTags"
          :key="tag"
          type="button"
          class="tag-chip"
          :class="{ 'tag-chip--active': selectedTags.has(tag) }"
          @click="toggleTag(tag)"
        >
          {{ tag }}
        </button>
      </div>
    </div>

    <div ref="itemsContainer" class="component-list__items">
      <div
        v-for="item in items"
        :key="item.id"
        :data-id="item.id"
        class="component-item"
        role="button"
        tabindex="0"
        :class="{
          'component-item--active': selectedId === item.id,
          'component-item--relation': item.kind === 'relation'
        }"
        @click="emit('select', item.kind, item.id)"
        @keydown.enter.prevent="emit('select', item.kind, item.id)"
        @keydown.space.prevent="emit('select', item.kind, item.id)"
      >
        <span class="material-symbols-outlined component-item__icon">
          {{ item.kind === 'component' ? 'category' : 'conversion_path' }}
        </span>
        <div class="component-item__info">
          <span class="component-item__name">{{ item.name }}</span>
          <span v-if="item.typeLabel" class="component-item__type">{{ item.typeLabel }}</span>
        </div>
        <button
          type="button"
          class="component-item__remove"
          title="Удалить"
          @click.stop="emit('remove-item', item.kind, item.id)"
        >
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>

      <div v-if="items.length === 0" class="component-list__empty">
        <span class="material-symbols-outlined component-list__empty-icon">
          {{ searchQuery ? 'search_off' : 'inventory_2' }}
        </span>
        <span>{{ searchQuery ? 'Ничего не найдено' : 'Нет элементов' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.component-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.notation-info {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.notation-info__name {
  font-size: 16px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notation-info__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.notation-info__version {
  font-size: 12px;
  font-weight: 500;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 1px 7px;
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}

.notation-info__date {
  font-size: 12px;
  color: var(--text-subtle);
}

.component-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.component-list__title {
  margin: 0;
  font-size: var(--heading-font-size);
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: var(--heading-letter-spacing);
}

.component-list__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.component-list__count {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 2px 9px;
  border-radius: 12px;
  font-variant-numeric: tabular-nums;
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.add-btn .material-symbols-outlined {
  font-size: 18px;
}

.add-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.component-list__search {
  position: relative;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.search-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--text-subtle);
  pointer-events: none;
}

.search-input {
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

.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(124, 92, 252, 0.12);
}

.search-input::placeholder {
  color: var(--text-subtle);
}

.clear-btn {
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

.clear-btn .material-symbols-outlined {
  font-size: 14px;
}

.clear-btn:hover {
  background: var(--border-strong);
  color: var(--base-text);
}

.component-list__tags-section {
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tags-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}

.tags-toggle__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.tags-toggle__count {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 0 6px;
  border-radius: 8px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}

.tags-toggle__icon {
  font-size: 18px;
  color: var(--text-subtle);
  margin-left: auto;
  transition: transform 0.2s ease;
}

.tags-toggle__icon--collapsed {
  transform: rotate(-90deg);
}

.component-list__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 12px 8px;
}

.tag-chip {
  padding: 2px 10px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  white-space: nowrap;
}

.tag-chip:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.tag-chip--active {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.component-list__items {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.component-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s ease;
  border-left: 3px solid transparent;
}

.component-item:hover {
  background: var(--surface-strong);
}

.component-item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.component-item--active {
  background: var(--primary-soft);
  border-left-color: var(--primary);
}

.component-item--active:hover {
  background: var(--primary-soft);
}

.component-item--relation:not(.component-item--active) {
  border-left-color: var(--accent);
}

.component-item:not(.component-item--relation):not(.component-item--active):hover {
  border-left-color: rgba(124, 92, 252, 0.3);
}

.component-item--relation:not(.component-item--active):hover {
  border-left-color: var(--accent);
}

.component-item__icon {
  font-size: 20px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.component-item--active .component-item__icon {
  color: var(--primary);
}

.component-item--relation .component-item__icon {
  color: var(--accent);
}

.component-item--relation.component-item--active .component-item__icon {
  color: var(--primary);
}

.component-item__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.component-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.component-item__type {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.component-item__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.component-item__remove .material-symbols-outlined {
  font-size: 16px;
}

.component-item:hover .component-item__remove {
  opacity: 1;
}

.component-item__remove:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.component-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-subtle);
  margin: 0;
}

.component-list__empty-icon {
  font-size: 28px;
  color: var(--border-strong);
}
</style>
