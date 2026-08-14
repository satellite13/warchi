<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions";
import { loadString, saveString } from "@/utils/localStorage";
import type { NotationEditorState } from "../types";
import type { CompositeSerializedCComponent } from "@/domain/attrs/notationAttrs";
import { resolveCompositeBoundIconName } from "@/features/diagram-style/utils/compositeBindings";
import { findNameVersionConflict } from "../utils/nameVersionUniqueness";
import EmptyState from "@/components/list/EmptyState.vue";
import EditorSidebarShell from "@/components/list/EditorSidebarShell.vue";
import SidebarListItem from "@/components/list/SidebarListItem.vue";

const { t } = useI18n();

const props = defineProps<{
  state: NotationEditorState;
  selectedId?: string | null;
  syncSelectionEnabled?: boolean;
}>();

const emit = defineEmits<{
  select: [kind: "component" | "relation", id: string];
  "create-component": [];
  "create-relation": [];
  "remove-item": [kind: "component" | "relation", id: string];
  "rename-item": [kind: "component" | "relation", id: string, name: string];
  "toggle-sync-selection": [];
}>();

const searchQuery = ref("");
const selectedTags = ref<Set<string>>(new Set());
const RU_LOCALE = "ru";
type SortMode = "alpha-asc" | "alpha-desc" | "type";
const sortMode = ref<SortMode>("alpha-asc");
const TAGS_EXPANDED_STORAGE_KEY = "warchi:notation-editor:component-list:tags-expanded";

const tagsExpanded = ref(loadString(TAGS_EXPANDED_STORAGE_KEY, "1") !== "0");
const renamingId = ref<string | null>(null);
const renamingName = ref("");
const renameError = ref<string | null>(null);
const renameInputRef = ref<HTMLInputElement | null>(null);

type ListItem = {
  id: string;
  kind: "component" | "relation";
  name: string;
  version: string;
  typeLabel: string;
  tags: string[];
  /** Иконка для палитры: diagramStyle.iconName ?? paletteMaterialIcon ?? widgets */
  paletteIcon: string;
};

function getPaletteIcon(parsedAttrs: { diagramStyle?: { iconName?: string; compositeContent?: CompositeSerializedCComponent }; paletteMaterialIcon?: string }): string {
  const fromStyle = parsedAttrs.diagramStyle?.iconName?.trim();
  const fromComposite = resolveCompositeBoundIconName(parsedAttrs.diagramStyle?.compositeContent);
  const fromPalette = parsedAttrs.paletteMaterialIcon?.trim();
  return fromStyle ?? fromComposite ?? fromPalette ?? "widgets";
}

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
  return [...tagSet].sort((a, b) => a.localeCompare(b, RU_LOCALE, {sensitivity: "base"}));
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
      version: c.version,
      typeLabel: props.state.nodeTypes.find(t => t.id === c.nodeTypeId)?.name || "",
      tags: c.parsedAttrs.tags,
      paletteIcon: getPaletteIcon(c.parsedAttrs)
    }));

  const relations: ListItem[] = props.state.relations
    .filter(r => !r._isDeleted)
    .map(r => ({
      id: r.id,
      kind: "relation" as const,
      name: r.name,
      version: r.version,
      typeLabel: props.state.linkTypes.find(t => t.id === r.linkTypeId)?.name || "",
      tags: r.parsedAttrs.tags,
      paletteIcon: getPaletteIcon(r.parsedAttrs)
    }));

  let all = [...components, ...relations];

  if (query) {
    all = all.filter(item => item.name.toLowerCase().includes(query));
  }

  if (activeTags.size > 0) {
    all = all.filter(item => item.tags.some(t => activeTags.has(t)));
  }

  return all.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, RU_LOCALE, {sensitivity: "base"});

    if (sortMode.value === "alpha-asc") {
      if (byName !== 0) return byName;
    } else if (sortMode.value === "alpha-desc") {
      if (byName !== 0) return -byName;
    } else {
      const aRank = a.kind === "component" ? 0 : 1;
      const bRank = b.kind === "component" ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      if (byName !== 0) return byName;
    }

    const byKind = a.kind.localeCompare(b.kind, RU_LOCALE, {sensitivity: "base"});
    if (byKind !== 0) return byKind;
    return a.id.localeCompare(b.id, RU_LOCALE, {sensitivity: "base"});
  });
});

const itemsContainer = ref<HTMLElement | null>(null);

watch(() => props.selectedId, (id) => {
  if (!props.syncSelectionEnabled || !id || !itemsContainer.value) return;
  nextTick(() => {
    const el = itemsContainer.value?.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
    el?.scrollIntoView({block: "nearest", behavior: "smooth"});
  });
});

watch(tagsExpanded, (value) => {
  saveString(TAGS_EXPANDED_STORAGE_KEY, value ? "1" : "0");
});

const startRename = (item: ListItem) => {
  renamingId.value = item.id;
  renamingName.value = item.name;
  renameError.value = null;
  nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  });
};

const cancelRename = () => {
  renamingId.value = null;
  renamingName.value = "";
  renameError.value = null;
};

const commitRename = (item: ListItem) => {
  if (renamingId.value !== item.id) return;
  const nextName = renamingName.value.trim();
  if (!nextName) {
    cancelRename();
    return;
  }
  if (nextName === item.name.trim()) {
    cancelRename();
    return;
  }
  const siblings =
    item.kind === "component" ? props.state.components : props.state.relations;
  if (findNameVersionConflict(siblings, nextName, item.version, item.id)) {
    renameError.value =
      item.kind === "component"
        ? t("notations.componentNameVersionConflict")
        : t("notations.relationNameVersionConflict");
    nextTick(() => renameInputRef.value?.focus());
    return;
  }
  emit("rename-item", item.kind, item.id, nextName);
  cancelRename();
};
</script>

<template>
  <div class="component-list">
    <EditorSidebarShell
      v-model:search-query="searchQuery"
      fill
      :title="t('notations.elementsTitle')"
      :count="items.length"
      :search-placeholder="t('common.search')"
    >
      <template #actions>
        <button
          type="button"
          class="btn--icon"
          :class="{ 'btn--icon--active': !!syncSelectionEnabled }"
          :title="syncSelectionEnabled ? t('notations.syncSelectionOff') : t('notations.syncSelectionOn')"
          @click="emit('toggle-sync-selection')"
        >
          <UiIcon name="sync_alt" />
        </button>
        <button
          type="button"
          class="btn--icon"
          :title="t('notations.addComponent')"
          @click="emit('create-component')"
        >
          <UiIcon :name="DEFAULT_ENTITY_ICONS.component" />
        </button>
        <button
          type="button"
          class="btn--icon"
          :title="t('notations.addRelation')"
          @click="emit('create-relation')"
        >
          <UiIcon :name="DEFAULT_ENTITY_ICONS.link" />
        </button>
      </template>

      <template #search-extra>
        <select
          class="sort-select"
          :value="sortMode"
          :title="t('notations.sortList')"
          @change="sortMode = ($event.target as HTMLSelectElement).value as SortMode"
        >
          <option value="alpha-asc">{{ t('notations.sortAlphaAsc') }}</option>
          <option value="alpha-desc">{{ t('notations.sortAlphaDesc') }}</option>
          <option value="type">{{ t('notations.sortByType') }}</option>
        </select>
      </template>

      <template #below-search>
        <div v-if="allTags.length > 0" class="component-list__tags-section">
          <button type="button" class="tags-toggle" @click="tagsExpanded = !tagsExpanded">
            <span class="tags-toggle__label">{{ t('notations.tagsLabel') }}</span>
            <span v-if="selectedTags.size > 0" class="tags-toggle__count">{{ selectedTags.size }}</span>
            <UiIcon name="expand_more" class="tags-toggle__icon" :class="{ 'tags-toggle__icon--collapsed': !tagsExpanded }" />
          </button>
          <div v-if="tagsExpanded" class="component-list__tags">
            <button
              v-for="tag in allTags"
              :key="tag"
              type="button"
              class="chip"
              :class="{ 'chip--active': selectedTags.has(tag) }"
              @click="toggleTag(tag)"
            >
              {{ tag }}
            </button>
          </div>
        </div>
      </template>

      <div ref="itemsContainer" class="component-list__items">
        <template v-for="item in items" :key="item.id">
          <div
            v-if="renamingId === item.id"
            :data-id="item.id"
            class="component-item component-item--renaming"
            :class="{
              'component-item--active': selectedId === item.id,
              'component-item--relation': item.kind === 'relation',
            }"
          >
            <div class="component-item__info">
              <input
                ref="renameInputRef"
                v-model="renamingName"
                type="text"
                class="component-item__rename-input"
                :class="{ 'component-item__rename-input--error': renameError }"
                :aria-label="t('common.rename')"
                @click.stop
                @keydown.enter.prevent="commitRename(item)"
                @keydown.esc.prevent="cancelRename"
                @blur="commitRename(item)"
              >
              <span v-if="renameError" class="component-item__rename-error">{{ renameError }}</span>
            </div>
            <div class="component-item__actions">
              <button
                type="button"
                class="component-item__action component-item__action--danger"
                :title="t('common.delete')"
                @click.stop="emit('remove-item', item.kind, item.id)"
              >
                <UiIcon name="delete" />
              </button>
            </div>
          </div>
          <SidebarListItem
            v-else
            as="div"
            :data-id="item.id"
            :title="item.name"
            :subtitle="item.typeLabel"
            :icon-id="item.kind === 'relation' ? '' : item.paletteIcon"
            :icon="item.kind === 'relation' ? DEFAULT_ENTITY_ICONS.link : ''"
            :tone="item.kind === 'relation' ? 'accent' : 'primary'"
            :active="selectedId === item.id"
            @click="emit('select', item.kind, item.id)"
          >
            <template #trailing>
              <div class="component-item__actions">
                <button
                  type="button"
                  class="component-item__action"
                  :title="t('common.rename')"
                  @click.stop="startRename(item)"
                >
                  <UiIcon name="edit" />
                </button>
                <button
                  type="button"
                  class="component-item__action component-item__action--danger"
                  :title="t('common.delete')"
                  @click.stop="emit('remove-item', item.kind, item.id)"
                >
                  <UiIcon name="delete" />
                </button>
              </div>
            </template>
          </SidebarListItem>
        </template>

        <EmptyState
          v-if="items.length === 0"
          variant="compact"
          :icon="searchQuery ? 'search_off' : 'inventory_2'"
          :title="searchQuery ? t('common.nothingFound') : t('common.noItems')"
        />
      </div>
    </EditorSidebarShell>
  </div>
</template>

<style scoped>
.component-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  margin-left: 50px;
  overflow-x: hidden;
}

.sort-select {
  height: 22px;
  max-width: 86px;
  padding: 0 6px;
  font-size: 12px;
  font-family: inherit;
  line-height: 20px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  outline: none;
  box-sizing: border-box;
}

.sort-select:focus {
  border-color: var(--primary);
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
  width: 18px;
  height: 18px;
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

.component-list__items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.component-list :deep(.sli .component-item__actions) {
  opacity: 0;
}

.component-list :deep(.sli:hover .component-item__actions),
.component-list :deep(.sli--active .component-item__actions) {
  opacity: 1;
}

.component-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border-radius: 8px;
  border-left: 3px solid transparent;
  box-sizing: border-box;
}

.component-item--active {
  background: var(--primary-soft);
  border-left-color: var(--primary);
}

.component-item--relation.component-item--active {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-left-color: var(--accent);
}

.component-item__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.component-item__rename-input {
  width: 100%;
  box-sizing: border-box;
  height: 26px;
  padding: 2px 8px;
  border: 1px solid var(--primary);
  border-radius: var(--radius-xs);
  background: var(--surface);
  color: var(--base-text);
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  outline: none;
  box-shadow: var(--focus-ring-sm);
}

.component-item__rename-input--error {
  border-color: var(--danger);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--danger) 18%, transparent);
}

.component-item__rename-error {
  font-size: 11px;
  color: var(--danger);
  line-height: 1.3;
}

.component-item__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.component-item--renaming .component-item__actions {
  opacity: 1;
}

.component-item__action {
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

.component-item__action .ui-icon {
  width: 16px;
  height: 16px;
}

.component-item__action:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
}

.component-item__action--danger:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--danger-soft);
}
</style>
