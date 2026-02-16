<script setup lang="ts">
import {onMounted, reactive, ref, computed} from "vue"

import {useTypeEditor} from "./composables/useTypeEditor"
import {serializeTypeAttrs} from "../notations/notationAttrs"
import type {CustomProperty, CustomPropertyType} from "../notations/notationAttrs"
import BaseModal from "../../components/modals/BaseModal.vue"

const {
  nodeTypes,
  linkTypes,
  selectedType,
  isLoading,
  isSaving,
  saveError,
  loadAll,
  selectType,
  addType,
  saveType,
  deleteType,
  addCustomProperty,
  removeCustomProperty,
  typeUsages,
  isLoadingUsages,
  isDirty
} = useTypeEditor()

onMounted(() => {
  loadAll()
})

async function handleSave() {
  if (!selectedType.value) return
  await saveType(selectedType.value)
}

async function handleDelete() {
  if (!selectedType.value) return
  await deleteType(selectedType.value)
}

// --- Unsaved changes dialog ---
const pendingSelectId = ref<string | null>(null)
const showUnsavedDialog = ref(false)

function handleSelectType(id: string) {
  if (selectedType.value?.id === id) return
  if (isDirty.value) {
    pendingSelectId.value = id
    showUnsavedDialog.value = true
  } else {
    selectType(id)
  }
}

function handleAddType(kind: 'node' | 'link') {
  if (isDirty.value) {
    pendingSelectId.value = `__add_${kind}`
    showUnsavedDialog.value = true
  } else {
    addType(kind)
  }
}

function discardAndSwitch() {
  showUnsavedDialog.value = false
  const pending = pendingSelectId.value
  pendingSelectId.value = null
  if (pending?.startsWith('__add_')) {
    addType(pending.replace('__add_', '') as 'node' | 'link')
  } else if (pending) {
    selectType(pending)
  }
}

function cancelSwitch() {
  showUnsavedDialog.value = false
  pendingSelectId.value = null
}

const isTypeInUse = computed(() => typeUsages.value.length > 0)

// --- JSON preview ---
const attrsJson = computed(() => {
  if (!selectedType.value) return ""
  const raw = serializeTypeAttrs(selectedType.value.parsedAttrs)
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
})

// --- Collapsible panels ---
const showAttrs = ref(false)
const showAttrsModal = ref(false)
const showUsages = ref(true)

// --- Custom properties helpers ---
const typeOptions: { value: CustomPropertyType; label: string }[] = [
  {value: "string", label: "Строка"},
  {value: "number", label: "Число"},
  {value: "boolean", label: "Булев"},
  {value: "enum", label: "Перечисление"}
]

const expandedIds = reactive(new Set<string>())

const toggleCollapse = (id: string) => {
  if (expandedIds.has(id)) {
    expandedIds.delete(id)
  } else {
    expandedIds.add(id)
  }
}

const typeLabel = (type: CustomPropertyType) =>
  typeOptions.find(o => o.value === type)?.label ?? type

const parseNumberInput = (value: string): number | null => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function updateEnumValues(property: CustomProperty, value: string) {
  property.enumValues = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

// Regex tester
const regexTestValues = reactive(new Map<string, string>())

const getRegexTestValue = (id: string) => regexTestValues.get(id) ?? ""

const setRegexTestValue = (id: string, value: string) => {
  regexTestValues.set(id, value)
}

const regexTestResult = (property: CustomProperty): null | boolean => {
  const testVal = regexTestValues.get(property.id)
  if (testVal === undefined || testVal === "") return null
  if (!property.regex) return null
  try {
    return new RegExp(property.regex).test(testVal)
  } catch {
    return null
  }
}
</script>

<template>
  <div class="type-editor">
    <!-- Left panel: type lists -->
    <aside class="type-editor__sidebar">
      <div class="sidebar-header">
        <span class="material-symbols-outlined sidebar-header__icon">category</span>
        <span class="sidebar-header__text">Типы</span>
      </div>

      <div class="type-section">
        <div class="type-section__header">
          <h3 class="type-section__title">Типы узлов</h3>
          <button
            type="button"
            class="type-section__add-btn"
            title="Добавить тип узла"
            @click="handleAddType('node')"
          >
            <span class="material-symbols-outlined">add</span>
          </button>
        </div>
        <div v-if="isLoading" class="type-section__loading">
          <span class="loading-pulse"></span>
          Загрузка...
        </div>
        <div v-else-if="nodeTypes.length === 0" class="type-section__empty">Нет типов</div>
        <ul v-else class="type-list">
          <li
            v-for="(t, idx) in nodeTypes"
            :key="t.id"
            class="type-list__item"
            :class="{ 'type-list__item--selected': selectedType?.id === t.id }"
            :style="{ animationDelay: `${idx * 30}ms` }"
            @click="handleSelectType(t.id)"
          >
            <span class="material-symbols-outlined type-list__icon">category</span>
            <span class="type-list__name">{{ t.name || 'Без имени' }}</span>
            <span v-if="t._isNew" class="type-list__badge">новый</span>
          </li>
        </ul>
      </div>

      <div class="type-section">
        <div class="type-section__header">
          <h3 class="type-section__title">Типы связей</h3>
          <button
            type="button"
            class="type-section__add-btn"
            title="Добавить тип связи"
            @click="handleAddType('link')"
          >
            <span class="material-symbols-outlined">add</span>
          </button>
        </div>
        <div v-if="isLoading" class="type-section__loading">
          <span class="loading-pulse"></span>
          Загрузка...
        </div>
        <div v-else-if="linkTypes.length === 0" class="type-section__empty">Нет типов</div>
        <ul v-else class="type-list">
          <li
            v-for="(t, idx) in linkTypes"
            :key="t.id"
            class="type-list__item"
            :class="{ 'type-list__item--selected': selectedType?.id === t.id }"
            :style="{ animationDelay: `${idx * 30}ms` }"
            @click="handleSelectType(t.id)"
          >
            <span class="material-symbols-outlined type-list__icon">link</span>
            <span class="type-list__name">{{ t.name || 'Без имени' }}</span>
            <span v-if="t._isNew" class="type-list__badge">новый</span>
          </li>
        </ul>
      </div>
    </aside>

    <!-- Center + Right panels -->
    <main class="type-editor__main">
      <div v-if="!selectedType" class="type-editor__empty">
        <div class="empty-state">
          <span class="material-symbols-outlined empty-state__icon">edit_note</span>
          <p class="empty-state__text">Выберите тип для редактирования</p>
          <p class="empty-state__hint">или создайте новый, нажав + в боковой панели</p>
        </div>
      </div>

      <template v-else>
        <div class="type-editor__content">
        <div class="type-form">
          <div class="type-form__header">
            <div class="type-form__title-row">
              <div class="type-form__kind-icon">
                <span class="material-symbols-outlined">
                  {{ selectedType.kind === 'node' ? 'category' : 'link' }}
                </span>
              </div>
              <h2 class="type-form__title">
                {{ selectedType.kind === 'node' ? 'Тип узла' : 'Тип связи' }}
              </h2>
              <span v-if="isDirty" class="dirty-badge" title="Есть несохранённые изменения">
                <span class="dirty-dot"></span>
                Не сохранено
              </span>
            </div>
            <div class="type-form__actions">
              <button
                v-if="!isTypeInUse"
                type="button"
                class="btn btn--danger"
                :disabled="isSaving"
                @click="handleDelete"
              >
                <span class="material-symbols-outlined">delete</span>
                Удалить
              </button>
              <button
                type="button"
                class="btn btn--primary"
                :disabled="isSaving || !selectedType.name.trim() || !isDirty"
                @click="handleSave"
              >
                <span class="material-symbols-outlined">save</span>
                {{ isSaving ? 'Сохранение...' : 'Сохранить' }}
              </button>
            </div>
          </div>

          <div v-if="saveError" class="type-form__error">
            <span class="material-symbols-outlined">error</span>
            {{ saveError }}
          </div>

          <div class="type-form__body">
            <!-- Name -->
            <div class="form-section">
              <h3 class="form-section__title">Основные</h3>
              <div class="form-row">
                <label class="form-label">Имя</label>
                <input
                  class="form-input"
                  v-model="selectedType.name"
                  placeholder="Название типа"
                >
              </div>
            </div>

            <!-- Custom Properties -->
            <div class="form-section">
              <div class="form-section__header">
                <h3 class="form-section__title">Свойства</h3>
                <button
                  type="button"
                  class="type-section__add-btn"
                  title="Добавить свойство"
                  @click="addCustomProperty(selectedType)"
                >
                  <span class="material-symbols-outlined">add</span>
                </button>
              </div>

              <div
                v-if="!selectedType.parsedAttrs.customProperties?.length"
                class="form-section__empty"
              >
                Нет свойств.
                <button type="button" class="link-btn" @click="addCustomProperty(selectedType)">Добавить</button>
              </div>

              <div v-else class="properties-list">
                <div
                  v-for="(property, idx) in selectedType.parsedAttrs.customProperties"
                  :key="property.id"
                  class="property-row"
                  :style="{ animationDelay: `${idx * 40}ms` }"
                >
                  <div class="property-row__header" role="button" tabindex="0" @click="toggleCollapse(property.id)" @keydown.enter="toggleCollapse(property.id)">
                    <span
                      class="material-symbols-outlined property-row__chevron"
                      :class="{ 'property-row__chevron--collapsed': !expandedIds.has(property.id) }"
                    >expand_more</span>
                    <span class="property-row__name">{{ property.name || 'Без имени' }}</span>
                    <span class="property-row__type-badge">{{ typeLabel(property.type) }}</span>
                    <span v-if="property.required" class="property-row__required-badge">Обяз.</span>
                    <button
                      type="button"
                      class="property-remove-btn"
                      title="Удалить свойство"
                      @click.stop="removeCustomProperty(selectedType, property.id)"
                    >
                      <span class="material-symbols-outlined">close</span>
                    </button>
                  </div>

                  <template v-if="expandedIds.has(property.id)">
                    <div class="property-row__body">
                      <div class="property-row__main">
                        <input
                          class="form-input"
                          v-model="property.name"
                          placeholder="Имя свойства"
                        >
                        <select class="form-select" v-model="property.type">
                          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                            {{ opt.label }}
                          </option>
                        </select>
                        <label class="property-checkbox">
                          <input type="checkbox" v-model="property.required">
                          <span class="property-checkbox__label">Обяз.</span>
                        </label>
                      </div>

                      <div v-if="property.type === 'string'" class="property-row__extra">
                        <input
                          class="form-input"
                          v-model="property.regex"
                          placeholder="Regex (необязательно)"
                        >
                        <input
                          class="form-input form-input--num"
                          type="number"
                          :value="property.maxLength ?? ''"
                          placeholder="Макс. длина"
                          min="0"
                          @input="property.maxLength = parseNumberInput(($event.target as HTMLInputElement).value)"
                        >
                      </div>
                      <div v-if="property.type === 'string' && property.regex" class="property-row__extra regex-test">
                        <input
                          class="form-input"
                          :value="getRegexTestValue(property.id)"
                          placeholder="Тестовое значение..."
                          @input="setRegexTestValue(property.id, ($event.target as HTMLInputElement).value)"
                        >
                        <span
                          v-if="regexTestResult(property) !== null"
                          class="regex-result"
                          :class="regexTestResult(property) ? 'regex-result--pass' : 'regex-result--fail'"
                        >
                          <span class="material-symbols-outlined">
                            {{ regexTestResult(property) ? 'check_circle' : 'cancel' }}
                          </span>
                          {{ regexTestResult(property) ? 'Совпадает' : 'Не совпадает' }}
                        </span>
                      </div>

                      <div v-if="property.type === 'number'" class="property-row__extra">
                        <input
                          class="form-input form-input--num"
                          type="number"
                          :value="property.min ?? ''"
                          placeholder="min"
                          @input="property.min = parseNumberInput(($event.target as HTMLInputElement).value)"
                        >
                        <input
                          class="form-input form-input--num"
                          type="number"
                          :value="property.max ?? ''"
                          placeholder="max"
                          @input="property.max = parseNumberInput(($event.target as HTMLInputElement).value)"
                        >
                      </div>

                      <div v-if="property.type === 'enum'" class="property-row__extra">
                        <input
                          class="form-input"
                          :value="(property.enumValues || []).join(', ')"
                          placeholder="val1, val2, val3"
                          @change="updateEnumValues(property, ($event.target as HTMLInputElement).value)"
                        >
                      </div>
                      <div v-if="property.type === 'enum' && property.required && (property.enumValues || []).length > 0" class="property-row__extra">
                        <span class="property-row__label">По умолчанию</span>
                        <select
                          class="form-select"
                          :value="property.enumDefault || ''"
                          @change="property.enumDefault = ($event.target as HTMLSelectElement).value || undefined"
                        >
                          <option value="">— нет —</option>
                          <option v-for="val in property.enumValues" :key="val" :value="val">{{ val }}</option>
                        </select>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right aside: JSON + Usages -->
        <aside class="type-aside">
          <!-- JSON attrs (collapsible) -->
          <div class="aside-panel">
            <div
              class="aside-panel__title aside-panel__title--toggle"
              role="button"
              tabindex="0"
              @click="showAttrs = !showAttrs"
              @keydown.enter="showAttrs = !showAttrs"
            >
              <span
                class="material-symbols-outlined aside-panel__chevron"
                :class="{ 'aside-panel__chevron--collapsed': !showAttrs }"
              >expand_more</span>
              <span class="material-symbols-outlined aside-panel__icon">data_object</span>
              attrs
              <button
                type="button"
                class="aside-panel__expand-btn"
                title="Открыть на весь экран"
                @click.stop="showAttrsModal = true"
              >
                <span class="material-symbols-outlined">open_in_full</span>
              </button>
            </div>
            <pre v-if="showAttrs" class="json-preview">{{ attrsJson }}</pre>
          </div>

          <!-- Usages (collapsible) -->
          <div class="aside-panel">
            <div
              class="aside-panel__title aside-panel__title--toggle"
              role="button"
              tabindex="0"
              @click="showUsages = !showUsages"
              @keydown.enter="showUsages = !showUsages"
            >
              <span
                class="material-symbols-outlined aside-panel__chevron"
                :class="{ 'aside-panel__chevron--collapsed': !showUsages }"
              >expand_more</span>
              Использование
              <span v-if="typeUsages.length > 0" class="aside-panel__count">
                {{ typeUsages.reduce((sum, g) => sum + g.elements.length, 0) }}
              </span>
            </div>

            <template v-if="showUsages">
              <div v-if="isLoadingUsages" class="aside-panel__empty">
                <span class="loading-pulse"></span>
                Загрузка...
              </div>
              <div v-else-if="selectedType._isNew" class="aside-panel__empty">
                Сохраните тип, чтобы увидеть использование
              </div>
              <div v-else-if="typeUsages.length === 0" class="aside-panel__empty">
                Не используется
              </div>
              <div v-else class="usages-groups">
                <div v-for="group in typeUsages" :key="group.notationId" class="usage-group">
                  <div class="usage-group__header">
                    <span class="material-symbols-outlined usage-group__icon">graph_3</span>
                    <span class="usage-group__name">{{ group.notationName }}</span>
                    <span class="usage-group__count">{{ group.elements.length }}</span>
                  </div>
                  <ul class="usage-group__list">
                    <li v-for="el in group.elements" :key="el.id" class="usage-item">
                      <span class="material-symbols-outlined usage-item__icon">
                        {{ selectedType.kind === 'node' ? 'widgets' : 'conversion_path' }}
                      </span>
                      <span class="usage-item__name">{{ el.name }}</span>
                      <span class="usage-item__version">{{ el.version }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </template>
          </div>
        </aside>
        </div>
      </template>
    </main>

    <!-- Unsaved changes dialog -->
    <BaseModal
      v-if="showUnsavedDialog"
      title="Несохранённые изменения"
      max-width="400px"
      @close="cancelSwitch"
    >
      <p class="unsaved-dialog__text">У текущего типа есть несохранённые изменения. Отменить изменения и перейти?</p>
      <template #footer>
        <button type="button" class="btn btn--secondary" @click="cancelSwitch">Остаться</button>
        <button type="button" class="btn btn--danger" @click="discardAndSwitch">Отменить и перейти</button>
      </template>
    </BaseModal>

    <!-- Attrs fullscreen modal -->
    <BaseModal
      v-if="showAttrsModal"
      title="attrs"
      max-width="90vw"
      @close="showAttrsModal = false"
    >
      <pre class="json-preview json-preview--fullscreen">{{ attrsJson }}</pre>
    </BaseModal>
  </div>
</template>

<style scoped>
/* ===== Animations ===== */
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

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes pulseGlow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ===== Layout ===== */
.type-editor {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--base-bg);
}

/* ===== Sidebar ===== */
.type-editor__sidebar {
  width: 272px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border);
}

.sidebar-header__icon {
  font-size: 20px;
  color: var(--primary);
}

.sidebar-header__text {
  font-size: 14px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.01em;
}

/* ===== Main area ===== */
.type-editor__main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 28px 36px;
}

.type-editor__content {
  display: flex;
  gap: 28px;
  align-items: flex-start;
  animation: fadeIn 0.25s ease;
}

/* ===== Empty state ===== */
.type-editor__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: fadeIn 0.4s ease;
}

.empty-state__icon {
  font-size: 56px;
  color: var(--border-strong);
  margin-bottom: 4px;
}

.empty-state__text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-muted);
}

.empty-state__hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-subtle);
}

/* ===== Sidebar sections ===== */
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

/* Loading pulse indicator */
.loading-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  animation: pulseGlow 1s ease-in-out infinite;
  flex-shrink: 0;
}

/* ===== Type list ===== */
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

/* ===== Form area ===== */
.type-form {
  flex: 1;
  min-width: 0;
}

.type-form__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 12px;
}

.type-form__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.type-form__kind-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary);
  flex-shrink: 0;
}

.type-form__kind-icon .material-symbols-outlined {
  font-size: 20px;
}

.type-form__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--base-text);
  white-space: nowrap;
  letter-spacing: -0.01em;
}

.type-form__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.type-form__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 10px;
  border: 1px solid rgba(220, 53, 69, 0.12);
  animation: fadeSlideIn 0.25s ease;
}

.type-form__error .material-symbols-outlined {
  font-size: 18px;
  flex-shrink: 0;
}

.type-form__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== Dirty indicator ===== */
.dirty-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--warning);
  background: var(--warning-soft);
  padding: 4px 12px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
  animation: fadeIn 0.2s ease;
}

.dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning);
  flex-shrink: 0;
  animation: pulseGlow 1.5s ease-in-out infinite;
}

/* ===== Form sections ===== */
.form-section {
  background: var(--surface);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid rgba(0, 0, 0, 0.03);
  animation: fadeSlideIn 0.3s ease both;
}

.form-section:nth-child(2) {
  animation-delay: 60ms;
}

.form-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-section__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.form-section__empty {
  font-size: 13px;
  color: var(--text-subtle);
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-label {
  flex: 0 0 80px;
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
}

.form-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--base-text);
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.form-input::placeholder {
  color: var(--text-subtle);
}

.form-input--num {
  width: 80px;
  flex: 0 0 80px;
}

.form-select {
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--base-text);
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

/* ===== Buttons ===== */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn .material-symbols-outlined {
  font-size: 18px;
}

.btn--primary {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(124, 92, 252, 0.2);
}

.btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.3);
  transform: translateY(-1px);
}

.btn--primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn--secondary {
  background: var(--surface-strong);
  color: var(--text-muted);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--border);
  color: var(--base-text);
}

.btn--danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.btn--danger:hover:not(:disabled) {
  background: rgba(220, 53, 69, 0.14);
}

/* ===== Properties list ===== */
.properties-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.property-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-muted);
  border: 1px solid transparent;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  animation: fadeSlideIn 0.25s ease both;
}

.property-row:hover {
  border-color: var(--border);
}

.property-row__header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.property-row__chevron {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.property-row__chevron--collapsed {
  transform: rotate(-90deg);
}

.property-row__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.property-row__type-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.property-row__required-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--warning);
  background: var(--warning-soft);
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.property-row__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  margin-top: 4px;
  animation: fadeIn 0.2s ease;
}

.property-row__main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.property-row__extra {
  display: flex;
  gap: 8px;
  align-items: center;
}

.property-row__label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.regex-test {
  align-items: center;
}

.regex-result {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.regex-result .material-symbols-outlined {
  font-size: 16px;
}

.regex-result--pass {
  color: var(--success);
}

.regex-result--fail {
  color: var(--danger);
}

.property-remove-btn {
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
  transition: all 0.15s ease;
  opacity: 0;
}

.property-row:hover .property-remove-btn,
.property-row__header:focus-visible .property-remove-btn {
  opacity: 1;
}

.property-remove-btn .material-symbols-outlined {
  font-size: 16px;
}

.property-remove-btn:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.property-checkbox {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  flex-shrink: 0;
}

.property-checkbox input {
  accent-color: var(--primary);
}

.property-checkbox__label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.link-btn {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  padding: 0;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.15s ease;
}

.link-btn:hover {
  color: var(--primary-hover);
}

/* ===== Right aside ===== */
.type-aside {
  width: 280px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: fadeSlideIn 0.35s ease both;
  animation-delay: 80ms;
}

.aside-panel {
  background: var(--surface);
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: var(--shadow-sm);
  border: 1px solid rgba(0, 0, 0, 0.03);
}

.aside-panel__title {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
}

.aside-panel__title--toggle {
  cursor: pointer;
  user-select: none;
  margin-bottom: 0;
  padding: 2px 0;
  border-radius: 6px;
  transition: color 0.15s ease;
}

.aside-panel__title--toggle:hover {
  color: var(--base-text);
}

.aside-panel__icon {
  font-size: 16px;
}

.aside-panel__chevron {
  font-size: 18px;
  transition: transform 0.2s ease;
}

.aside-panel__chevron--collapsed {
  transform: rotate(-90deg);
}

.aside-panel__count {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: var(--primary);
  padding: 1px 7px;
  border-radius: 10px;
  margin-left: auto;
  min-width: 16px;
  text-align: center;
}

.aside-panel__expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  margin-left: auto;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.aside-panel__expand-btn .material-symbols-outlined {
  font-size: 15px;
}

.aside-panel__expand-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

.aside-panel__empty {
  font-size: 13px;
  color: var(--text-subtle);
  padding-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.json-preview {
  margin: 12px 0 0;
  padding: 12px 14px;
  font-size: 11px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  line-height: 1.55;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
  animation: fadeIn 0.2s ease;
}

.json-preview--fullscreen {
  margin: 0;
  max-height: 70vh;
  font-size: 13px;
  line-height: 1.6;
}

/* ===== Usages ===== */
.usages-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 10px;
  animation: fadeIn 0.2s ease;
}

.usage-group__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.usage-group__icon {
  font-size: 16px;
  color: var(--primary);
}

.usage-group__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usage-group__count {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-strong);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.usage-group__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.usage-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--base-text);
  transition: background 0.15s ease;
}

.usage-item:hover {
  background: var(--surface-strong);
}

.usage-item__icon {
  font-size: 14px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.usage-item__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usage-item__version {
  font-size: 11px;
  color: var(--text-subtle);
  font-family: 'SF Mono', 'Fira Code', monospace;
  flex-shrink: 0;
}

/* ===== Unsaved dialog ===== */
.unsaved-dialog__text {
  margin: 0;
  font-size: 14px;
  color: var(--base-text);
  line-height: 1.55;
}
</style>
