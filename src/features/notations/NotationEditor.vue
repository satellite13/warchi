<script setup lang="ts">
import {computed, onMounted} from "vue";
import {onBeforeRouteLeave} from "vue-router";
import SearchInput from "../../components/forms/SearchInput.vue";
import NotationEntityModal from "./components/NotationEntityModal.vue";
import NotationEntityCard from "./components/NotationEntityCard.vue";
import NotationDiagram from "./components/NotationDiagram.vue";
import {useNotationEditor} from "./composables/useNotationEditor";
import {useNotationEntity, appendTagValue} from "./composables/useNotationEntity";
import {useCustomProperties} from "./composables/useCustomProperties";
import type {EntityKind} from "./composables/useNotationDiagram";
import type {EditorComponent, EditorRelation} from "./types";

const NEW_TYPE_VALUE = "__new__";

const {
  notation,
  state,
  isLoading,
  errorMessage,
  isSaving,
  saveError,
  saveSuccess,
  saveProgress,
  hasUnsavedChanges,
  loadNotation,
  saveChanges,
  handleBack
} = useNotationEditor();

onBeforeRouteLeave(() => {
  if (hasUnsavedChanges.value) {
    return window.confirm("У вас есть несохранённые изменения. Покинуть страницу?");
  }
});

const {
  searchQuery,
  selectedTags,
  selectedEntity,
  showComponentModal,
  showRelationModal,
  componentName,
  componentTags,
  componentVersion,
  componentTypeSelection,
  componentNewTypeName,
  componentFormError,
  relationName,
  relationTags,
  relationVersion,
  relationTypeSelection,
  relationNewTypeName,
  relationFormError,
  availableTags,
  componentTagSuggestions,
  relationTagSuggestions,
  selectedItem,
  combinedItems,
  toggleTag,
  selectComponent,
  selectRelation,
  addComponent,
  addRelation,
  openComponentModal,
  closeComponentModal,
  openRelationModal,
  closeRelationModal,
  markComponentDirty,
  markRelationDirty
} = useNotationEntity(state);

const handleItemChanged = (id: string) => {
  if (selectedEntity.value?.kind === "component") {
    markComponentDirty(id);
  } else if (selectedEntity.value?.kind === "relation") {
    markRelationDirty(id);
  }
};

const {
  hasValidationErrors,
  addCustomProperty,
  removeCustomProperty,
  updateEnumValues,
  parseNumberInput,
  propertyErrors
} = useCustomProperties(selectedItem, handleItemChanged);

const handleSave = () => {
  saveChanges(hasValidationErrors.value);
};

const handleDiagramSelect = (id: string, kind: EntityKind) => {
  if (kind === "component") {
    selectComponent(id);
  } else {
    selectRelation(id);
  }
};

const selectedTypeName = computed(() => {
  if (!selectedItem.value || !selectedEntity.value) return '';
  if (selectedEntity.value.kind === 'component') {
    const comp = selectedItem.value as EditorComponent;
    return state.value.nodeTypes.find(t => t.id === comp.nodeTypeId)?.name || '';
  } else {
    const rel = selectedItem.value as EditorRelation;
    return state.value.linkTypes.find(t => t.id === rel.linkTypeId)?.name || '';
  }
});

const handleTagsInput = (value: string) => {
  if (!selectedItem.value) return;
  selectedItem.value.parsedAttrs.tags = value
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  handleItemChanged(selectedItem.value.id);
};

onMounted(() => {
  loadNotation();
});
</script>

<template>
  <main class="notation-editor">
    <header class="notation-header">
      <div class="notation-title">
        <button
            type="button"
            class="back-button"
            @click="handleBack"
        >
          ← Назад к нотациям
        </button>
        <h1>
          Редактируем нотацию: <b>{{ notation?.name || "Нотация" }}</b>
          <span
              v-if="notation?.version"
              class="notation-version"
          >
            {{ notation?.version }}
          </span>
        </h1>
        <p
            v-if="notation?.updatedAt"
            class="notation-updated"
        >
          Обновлено: {{ new Date(notation.updatedAt).toLocaleString("ru-RU") }}
        </p>
      </div>
      <div class="notation-actions">
        <span v-if="saveProgress" class="status-progress">{{ saveProgress }}</span>
        <button
            type="button"
            class="primary-button"
            :disabled="isSaving || !notation || hasValidationErrors"
            @click="handleSave"
        >
          {{ isSaving ? "Сохранение..." : "Сохранить" }}
        </button>
        <span v-if="saveSuccess"
              class="status-success">Сохранено</span>
        <span v-if="saveError"
              class="status-error">{{ saveError }}</span>
      </div>
    </header>

    <div v-if="isLoading"
         class="loading-state">
      Загрузка данных нотации...
    </div>

    <div v-else-if="errorMessage"
         class="error-state">
      {{ errorMessage }}
    </div>

    <div v-else class="notation-layout">
      <!-- Левая колонка: список элементов -->
      <aside class="notation-sidebar">
        <div class="sidebar-header">
          <h2>Элементы</h2>
          <div class="action-icons">
            <button
                type="button"
                class="action-button"
                title="Добавить компонент"
                aria-label="Добавить компонент"
                @click="openComponentModal"
            >
              <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
              >
                <rect
                    x="3"
                    y="3"
                    width="7"
                    height="7"
                    rx="2"
                />
                <rect
                    x="14"
                    y="3"
                    width="7"
                    height="7"
                    rx="2"
                />
                <rect
                    x="3"
                    y="14"
                    width="7"
                    height="7"
                    rx="2"
                />
                <path d="M17.5 15v6m-3-3h6"/>
              </svg>
            </button>
            <button
                type="button"
                class="action-button"
                title="Добавить отношение"
                aria-label="Добавить отношение"
                @click="openRelationModal"
            >
              <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
              >
                <circle
                    cx="5"
                    cy="12"
                    r="3"
                />
                <circle
                    cx="19"
                    cy="6"
                    r="3"
                />
                <circle
                    cx="19"
                    cy="18"
                    r="3"
                />
                <path d="M8 12h6m-3-6 4-3m-4 15 4-3"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="sidebar-filters">
          <SearchInput
              v-model="searchQuery"
              placeholder="Поиск по имени..."
          />
          <div
              v-if="availableTags.length"
              class="tag-filter"
          >
            <p class="tag-title">
              Теги:
            </p>
            <div class="tag-list">
              <button
                  v-for="tag in availableTags"
                  :key="tag"
                  type="button"
                  class="tag-pill"
                  :class="{ active: selectedTags.includes(tag) }"
                  @click="toggleTag(tag)"
              >
                {{ tag }}
              </button>
            </div>
          </div>
        </div>

        <div class="sidebar-content">
          <div class="entity-list">
            <NotationEntityCard
                v-for="item in combinedItems"
                :key="item.id"
                :item="item"
                :is-active="selectedEntity?.id === item.id"
                @select="
                (kind, id) => (kind === 'component' ? selectComponent(id) : selectRelation(id))
              "
            />
            <p v-if="combinedItems.length === 0" class="empty-hint">
              Элементы не найдены.
            </p>
          </div>
        </div>
      </aside>

      <!-- Центральная колонка: канвас + кастомные свойства -->
      <section class="notation-center">
        <div class="notation-canvas">
          <NotationDiagram
              :state="state"
              :selected-id="selectedEntity?.id ?? null"
              @select="handleDiagramSelect"/>
        </div>
      </section>

      <!-- Правая колонка: свойства выбранной фигуры -->
      <aside class="notation-properties">
        <div class="properties-header">
          <h2>Свойства фигуры</h2>
        </div>

        <div class="properties-content">
          <div
              v-if="!selectedItem"
              class="empty-hint"
          >
            Выберите компонент или отношение для редактирования.
          </div>

          <div
              v-else
              class="properties-form"
          >
            <div class="selected-entity-info">
              <span
                  class="entity-badge"
                  :class="selectedEntity?.kind"
              >
                {{ selectedEntity?.kind === 'component' ? 'Компонент' : 'Отношение' }}
              </span>
            </div>

            <div class="property-field">
              <label>Название</label>
              <input
                  v-model="selectedItem.name"
                  type="text"
                  placeholder="Название"
                  @input="handleItemChanged(selectedItem!.id)"
              >
            </div>

            <div class="property-field">
              <label>Версия</label>
              <input
                  v-model="selectedItem.version"
                  type="text"
                  placeholder="1.0.0"
                  @input="handleItemChanged(selectedItem!.id)"
              >
            </div>

            <div class="property-field">
              <label>Теги</label>
              <input
                  :value="selectedItem.parsedAttrs.tags?.join(', ') || ''"
                  type="text"
                  placeholder="tag1, tag2"
                  @input="handleTagsInput(($event.target as HTMLInputElement).value)"
              >
            </div>

            <div class="property-field">
              <label>Тип</label>
              <input
                  :value="selectedTypeName"
                  type="text"
                  disabled
                  class="disabled-input"
              >
            </div>
          </div>
        </div>
      </aside>
    </div>
    <div class="notation-custom-properties">
      <div class="custom-properties-header">
        <h2>Кастомные свойства</h2>
        <button
            type="button"
            class="action-button"
            title="Добавить свойство"
            aria-label="Добавить свойство"
            :disabled="!selectedItem"
            @click="addCustomProperty"
        >
          <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
          >
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      </div>

      <div class="custom-properties-content">
        <div
            v-if="!selectedItem"
            class="empty-hint"
        >
          Выберите компонент или отношение для добавления свойств.
        </div>

        <div
            v-else-if="selectedItem.parsedAttrs.customProperties.length === 0"
            class="empty-hint"
        >
          Нет кастомных свойств. Нажмите "+" чтобы добавить.
        </div>

        <table v-else class="properties-table">
          <thead>
          <tr>
            <th>Имя</th>
            <th>Тип</th>
            <th class="th-center">Обяз.</th>
            <th>Regex</th>
            <th>Min</th>
            <th>Max</th>
            <th>Enum значения</th>
            <th class="th-actions"></th>
          </tr>
          </thead>
          <tbody>
          <tr
              v-for="property in selectedItem.parsedAttrs.customProperties"
              :key="property.id"
              :class="{ 'has-errors': propertyErrors(property).length }"
          >
            <td>
              <input
                  v-model="property.name"
                  type="text"
                  placeholder="name"
                  class="table-input"
                  @input="handleItemChanged(selectedItem!.id)"
              >
            </td>
            <td>
              <select
                  v-model="property.type"
                  class="table-select"
                  @change="handleItemChanged(selectedItem!.id)"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="enum">enum</option>
              </select>
            </td>
            <td class="td-center">
              <input
                  v-model="property.required"
                  type="checkbox"
                  @change="handleItemChanged(selectedItem!.id)"
              >
            </td>
            <td>
              <input
                  v-model="property.regex"
                  type="text"
                  placeholder="^[A-Z]+$"
                  class="table-input"
                  @input="handleItemChanged(selectedItem!.id)"
              >
            </td>
            <td>
              <input
                  :value="property.min ?? ''"
                  type="number"
                  placeholder="—"
                  class="table-input table-input--number"
                  @input="property.min = parseNumberInput(($event.target as HTMLInputElement).value); handleItemChanged(selectedItem!.id)"
              >
            </td>
            <td>
              <input
                  :value="property.max ?? ''"
                  type="number"
                  placeholder="—"
                  class="table-input table-input--number"
                  @input="property.max = parseNumberInput(($event.target as HTMLInputElement).value); handleItemChanged(selectedItem!.id)"
              >
            </td>
            <td>
              <input
                  v-if="property.type === 'enum'"
                  :value="property.enumValues?.join(', ') || ''"
                  type="text"
                  placeholder="val1, val2"
                  class="table-input"
                  @input="updateEnumValues(property, ($event.target as HTMLInputElement).value)"
              >
              <span v-else class="table-placeholder">—</span>
            </td>
            <td class="td-actions">
              <button
                  type="button"
                  class="action-button action-button--danger action-button--sm"
                  title="Удалить свойство"
                  aria-label="Удалить свойство"
                  @click="removeCustomProperty(property.id)"
              >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                  <path d="M3 6h18"/>
                  <path d="M8 6V4h8v2"/>
                  <path d="M6 6l1 14h10l1-14"/>
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                </svg>
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <NotationEntityModal
        v-if="showComponentModal"
        v-model:name="componentName"
        v-model:version="componentVersion"
        v-model:tags="componentTags"
        v-model:type-selection="componentTypeSelection"
        v-model:new-type-name="componentNewTypeName"
        title="Новый компонент"
        form-id="component-form"
        name-label="Название компонента"
        name-placeholder="Component name"
        version-label="Версия"
        version-placeholder="1.0.0"
        tags-label="Теги"
        tags-placeholder="tag1, tag2"
        type-label="Тип узла"
        :type-options="state.nodeTypes"
        :new-type-value="NEW_TYPE_VALUE"
        new-type-label="Новый тип узла"
        new-type-placeholder="Название типа"
        :suggestions="componentTagSuggestions"
        :error="componentFormError"
        @close="closeComponentModal"
        @submit="addComponent"
        @select-tag="componentTags = appendTagValue(componentTags, $event)"
    />

    <NotationEntityModal
        v-if="showRelationModal"
        v-model:name="relationName"
        v-model:version="relationVersion"
        v-model:tags="relationTags"
        v-model:type-selection="relationTypeSelection"
        v-model:new-type-name="relationNewTypeName"
        title="Новое отношение"
        form-id="relation-form"
        name-label="Название отношения"
        name-placeholder="Relation name"
        version-label="Версия"
        version-placeholder="1.0.0"
        tags-label="Теги"
        tags-placeholder="tag1, tag2"
        type-label="Тип связи"
        :type-options="state.linkTypes"
        :new-type-value="NEW_TYPE_VALUE"
        new-type-label="Новый тип связи"
        new-type-placeholder="Название типа"
        :suggestions="relationTagSuggestions"
        :error="relationFormError"
        @close="closeRelationModal"
        @submit="addRelation"
        @select-tag="relationTags = appendTagValue(relationTags, $event)"
    />
  </main>
</template>

<style scoped>
.notation-editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
  box-sizing: border-box;
  background: var(--base-bg);
  color: var(--base-text);
  font-family: "Roboto", "Inter", system-ui, -apple-system, sans-serif;
}

.notation-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 0 8px;
  flex-shrink: 0;
}

.notation-title h1 {
  margin: 8px 0 4px;
  font-size: 20px;
  font-weight: 600;
}

.notation-version {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  margin-left: 8px;
  vertical-align: super;
}

.notation-updated {
  font-size: 12px;
  color: var(--text-subtle);
}

.notation-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-button {
  border: none;
  background: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

.status-success {
  color: var(--success);
  font-size: 13px;
}

.status-error {
  color: var(--danger);
  font-size: 13px;
}

.status-progress {
  color: var(--text-muted);
  font-size: 12px;
}

.notation-layout {
  display: grid;
  grid-template-columns: 350px 1fr 360px;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}

/* Левая колонка: список элементов */
.notation-sidebar {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  min-height: 0;
  max-height: 50%;
  overflow: hidden;
  overflow-y: scroll;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.action-icons {
  display: flex;
  gap: 6px;
}

.sidebar-filters {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  min-height: 0;
}

.tag-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-title {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-pill {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  padding: 3px 8px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 11px;
}

.tag-pill.active {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}

.entity-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Центральная колонка: канвас + кастомные свойства */
.notation-center {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  max-height: 50%;
  overflow: hidden;
}

.notation-canvas {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.notation-custom-properties {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  min-height: 180px;
  overflow: hidden;
}

.custom-properties-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.custom-properties-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.custom-properties-content {
  flex: 1;
  overflow: auto;
  padding: 0;
  min-height: 0;
}

/* Таблица кастомных свойств */
.properties-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.properties-table th,
.properties-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.properties-table th {
  font-weight: 500;
  color: var(--text-muted);
  background: var(--surface-strong);
  position: sticky;
  top: 0;
  z-index: 1;
  white-space: nowrap;
}

.properties-table th.th-center,
.properties-table td.td-center {
  text-align: center;
}

.properties-table th.th-actions {
  width: 40px;
}

.properties-table td.td-actions {
  text-align: center;
}

.properties-table tr:hover {
  background: var(--base-bg);
}

.properties-table tr.has-errors {
  background: var(--danger-soft);
}

.table-input,
.table-select {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: var(--surface);
  color: var(--base-text);
  box-sizing: border-box;
}

.table-input:focus,
.table-select:focus {
  outline: none;
  border-color: var(--primary);
}

.table-input--number {
  width: 60px;
}

.table-placeholder {
  color: var(--text-subtle);
}

/* Правая колонка: свойства фигуры */
.notation-properties {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  min-height: 0;
  max-height: 50%;
  overflow: hidden;
}

.properties-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.properties-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.properties-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  min-height: 0;
}

.properties-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.selected-entity-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.entity-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
}

.entity-badge.component {
  background: #e0f2fe;
  color: #0284c7;
}

.entity-badge.relation {
  background: #ede9fe;
  color: #7c3aed;
}

.entity-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--base-text);
}

.action-button {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: var(--surface-strong);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.action-button:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-button:disabled:hover {
  background: var(--surface-strong);
  color: var(--text-muted);
}

.action-button svg {
  width: 14px;
  height: 14px;
}

.action-button--danger:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.action-button--sm {
  width: 24px;
  height: 24px;
}

.action-button--sm svg {
  width: 12px;
  height: 12px;
}

.property-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.property-field label {
  font-size: 11px;
  color: var(--text-muted);
}

.property-field input,
.property-field select {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: 12px;
  box-sizing: border-box;
  height: 32px;
  background: var(--surface);
  color: var(--base-text);
}

.property-field input.disabled-input {
  background: var(--base-bg);
  color: var(--text-muted);
  cursor: not-allowed;
}

.loading-state,
.error-state,
.warning-state,
.empty-hint {
  font-size: 13px;
  color: var(--text-muted);
}

.error-state {
  color: var(--danger);
  background: var(--danger-soft);
  padding: 12px;
  border-radius: var(--radius-sm);
}

.warning-state {
  color: var(--warning);
  background: var(--warning-soft);
  padding: 10px;
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
}

.primary-button,
.secondary-button {
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.primary-button {
  background: var(--primary);
  color: #fff;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondary-button {
  background: var(--surface-strong);
  color: var(--base-text);
}
</style>
