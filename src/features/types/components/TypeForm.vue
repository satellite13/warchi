<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import type { TypeItem } from "../composables/useTypeEditor"
import PropertyRow from "./PropertyRow.vue"

const props = defineProps<{
  selectedType: TypeItem
  isDirty: boolean
  isSaving: boolean
  saveError: string | null
  isTypeInUse: boolean
}>()

const emit = defineEmits<{
  save: []
  delete: []
  addProperty: []
  removeProperty: [propertyId: string]
  updateName: [value: string]
}>()

const expandedIds = reactive(new Set<string>())
const propertySearchQuery = ref("")

const toggleCollapse = (id: string) => {
  if (expandedIds.has(id)) expandedIds.delete(id)
  else expandedIds.add(id)
}

const filteredCustomProperties = computed(() => {
  const allProps = props.selectedType.parsedAttrs.customProperties ?? []
  const query = propertySearchQuery.value.trim().toLowerCase()
  if (!query) return allProps
  return allProps.filter((p) => p.name.toLowerCase().includes(query))
})
</script>

<template>
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
          @click="emit('delete')"
        >
          <span class="material-symbols-outlined">delete</span>
          Удалить
        </button>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="isSaving || !selectedType.name.trim() || !isDirty"
          @click="emit('save')"
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
            :value="selectedType.name"
            placeholder="Название типа"
            @input="emit('updateName', ($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <!-- Custom Properties -->
      <div class="form-section">
        <div class="form-section__header">
          <h3 class="form-section__title">Свойства</h3>
          <button
            type="button"
            class="add-btn"
            title="Добавить свойство"
            @click="emit('addProperty')"
          >
            <span class="material-symbols-outlined">add</span>
          </button>
        </div>

        <div v-if="selectedType.parsedAttrs.customProperties?.length" class="properties-search">
          <span class="material-symbols-outlined properties-search__icon">search</span>
          <input
            v-model="propertySearchQuery"
            class="properties-search__input"
            type="text"
            placeholder="Фильтр по имени свойства..."
          >
          <button
            v-if="propertySearchQuery"
            type="button"
            class="properties-search__clear"
            title="Очистить фильтр"
            @click="propertySearchQuery = ''"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div
          v-if="!selectedType.parsedAttrs.customProperties?.length"
          class="form-section__empty"
        >
          Нет свойств.
          <button
            type="button"
            class="link-btn--icon"
            title="Добавить свойство"
            @click="emit('addProperty')"
          >
            <span class="material-symbols-outlined">add</span>
          </button>
        </div>

        <div v-else-if="filteredCustomProperties.length === 0" class="form-section__empty">
          По фильтру ничего не найдено.
        </div>

        <div v-else class="properties-list">
          <PropertyRow
            v-for="(property, idx) in filteredCustomProperties"
            :key="property.id"
            :property="property"
            :expanded="expandedIds.has(property.id)"
            :style="{ animationDelay: `${idx * 40}ms` }"
            @toggle="toggleCollapse(property.id)"
            @remove="emit('removeProperty', property.id)"
          />
        </div>
      </div>
    </div>
  </div>
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

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes pulseGlow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

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
  border: 1px solid var(--danger-soft);
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

/* Dirty indicator */
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

/* Form sections */
.form-section {
  background: var(--surface);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
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

/* Buttons */
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
  box-shadow: 0 2px 8px var(--primary-soft);
}

.btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
  box-shadow: 0 4px 14px var(--primary-soft);
  transform: translateY(-1px);
}

.btn--primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn--danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.btn--danger:hover:not(:disabled) {
  background: var(--danger-soft);
  filter: brightness(0.95);
}

.add-btn {
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

.add-btn .material-symbols-outlined {
  font-size: 16px;
}

.add-btn:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
  transform: scale(1.08);
}

.link-btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.link-btn--icon .material-symbols-outlined {
  font-size: 16px;
}

.link-btn--icon:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}

/* Properties */
.properties-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.properties-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
}

.properties-search__icon {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.properties-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--base-text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.properties-search__input::placeholder {
  color: var(--text-subtle);
}

.properties-search__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  flex-shrink: 0;
}

.properties-search__clear:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.properties-search__clear .material-symbols-outlined {
  font-size: 16px;
}
</style>
