<script setup lang="ts">
import {computed, reactive} from "vue";
import type {EditorComponent, EditorRelation} from "../types";
import type {CustomProperty, CustomPropertyType} from "../notationAttrs";
import {useCustomProperties} from "../composables/useCustomProperties";

const props = defineProps<{
  selectedItem: EditorComponent | EditorRelation | null;
  onItemChanged?: (id: string) => void;
}>();

const selectedItemComputed = computed(() => props.selectedItem);

const {
  addCustomProperty,
  removeCustomProperty,
  updateEnumValues,
  parseNumberInput,
  propertyErrors
} = useCustomProperties(selectedItemComputed, props.onItemChanged);

const typeOptions: { value: CustomPropertyType; label: string }[] = [
  {value: "string", label: "Строка"},
  {value: "number", label: "Число"},
  {value: "boolean", label: "Булев"},
  {value: "enum", label: "Перечисление"}
];

const handleTypeChange = (property: CustomProperty, value: string) => {
  property.type = value as CustomPropertyType;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleNameChange = (property: CustomProperty, value: string) => {
  property.name = value;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleRequiredChange = (property: CustomProperty, checked: boolean) => {
  property.required = checked;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleRegexChange = (property: CustomProperty, value: string) => {
  property.regex = value;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleMinChange = (property: CustomProperty, value: string) => {
  property.min = parseNumberInput(value);
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleMaxChange = (property: CustomProperty, value: string) => {
  property.max = parseNumberInput(value);
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const expandedIds = reactive(new Set<string>());

const toggleCollapse = (id: string) => {
  if (expandedIds.has(id)) {
    expandedIds.delete(id);
  } else {
    expandedIds.add(id);
  }
};

const typeLabel = (type: CustomPropertyType) =>
  typeOptions.find(o => o.value === type)?.label ?? type;

const handleMaxLengthChange = (property: CustomProperty, value: string) => {
  property.maxLength = parseNumberInput(value);
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

const handleEnumDefaultChange = (property: CustomProperty, value: string) => {
  property.enumDefault = value || undefined;
  if (props.selectedItem && props.onItemChanged) {
    props.onItemChanged(props.selectedItem.id);
  }
};

// Regex tester
const regexTestValues = reactive(new Map<string, string>());

const getRegexTestValue = (id: string) => regexTestValues.get(id) ?? "";

const setRegexTestValue = (id: string, value: string) => {
  regexTestValues.set(id, value);
};

const regexTestResult = (property: CustomProperty): null | boolean => {
  const testVal = regexTestValues.get(property.id);
  if (testVal === undefined || testVal === "") return null;
  if (!property.regex) return null;
  try {
    return new RegExp(property.regex).test(testVal);
  } catch {
    return null;
  }
};
</script>

<template>
  <div class="properties-panel">
    <div class="properties-panel__header">
      <h3 class="properties-panel__title">Свойства</h3>
      <span v-if="selectedItem" class="properties-panel__entity-name">{{ selectedItem.name }}</span>
      <button
        v-if="selectedItem"
        type="button"
        class="properties-panel__add-btn"
        title="Добавить свойство"
        @click="addCustomProperty"
      >
        <span class="material-symbols-outlined">add</span>
      </button>
    </div>

    <div v-if="!selectedItem" class="properties-panel__empty">
      Выберите элемент для редактирования свойств
    </div>

    <div
      v-else-if="selectedItem.parsedAttrs.customProperties.length === 0"
      class="properties-panel__empty"
    >
      Нет свойств.
      <button type="button" class="link-btn" @click="addCustomProperty">Добавить</button>
    </div>

    <div v-else class="properties-panel__list">
      <div
        v-for="property in selectedItem.parsedAttrs.customProperties"
        :key="property.id"
        class="property-row"
        :class="{ 'property-row--error': propertyErrors(property).length > 0 }"
      >
        <div class="property-row__header" role="button" tabindex="0" @click="toggleCollapse(property.id)" @keydown.enter="toggleCollapse(property.id)">
          <span
            class="material-symbols-outlined property-row__chevron"
            :class="{ 'property-row__chevron--collapsed': !expandedIds.has(property.id) }"
          >expand_more</span>
          <span class="property-row__name">{{ property.name || 'Без имени' }}</span>
          <span class="property-row__type-badge">{{ typeLabel(property.type) }}</span>
          <span v-if="property._fromType" class="property-row__from-type-badge" title="Унаследовано от типа">
            <span class="material-symbols-outlined property-row__from-type-icon">linked_services</span>
            Тип
          </span>
          <span v-if="property.required" class="property-row__required-badge">Обяз.</span>
          <button
            type="button"
            class="property-remove-btn"
            title="Удалить свойство"
            @click.stop="removeCustomProperty(property.id)"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <template v-if="expandedIds.has(property.id)">
          <div class="property-row__body">
            <div class="property-row__main">
              <input
                class="property-input property-input--name"
                :value="property.name"
                placeholder="Имя свойства"
                @input="handleNameChange(property, ($event.target as HTMLInputElement).value)"
              >
              <select
                class="property-select"
                :value="property.type"
                @change="handleTypeChange(property, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <label class="property-checkbox">
                <input
                  type="checkbox"
                  :checked="property.required"
                  @change="handleRequiredChange(property, ($event.target as HTMLInputElement).checked)"
                >
                <span class="property-checkbox__label">Обяз.</span>
              </label>
            </div>

            <div v-if="property.type === 'string'" class="property-row__extra">
              <input
                class="property-input property-input--sm"
                :value="property.regex || ''"
                placeholder="Regex (необязательно)"
                @input="handleRegexChange(property, ($event.target as HTMLInputElement).value)"
              >
              <input
                class="property-input property-input--num"
                type="number"
                :value="property.maxLength ?? ''"
                placeholder="Макс. длина"
                min="0"
                @input="handleMaxLengthChange(property, ($event.target as HTMLInputElement).value)"
              >
            </div>
            <div v-if="property.type === 'string' && property.regex" class="property-row__extra regex-test">
              <input
                class="property-input property-input--sm"
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
                class="property-input property-input--sm"
                type="number"
                :value="property.min ?? ''"
                placeholder="min"
                @input="handleMinChange(property, ($event.target as HTMLInputElement).value)"
              >
              <input
                class="property-input property-input--sm"
                type="number"
                :value="property.max ?? ''"
                placeholder="max"
                @input="handleMaxChange(property, ($event.target as HTMLInputElement).value)"
              >
            </div>

            <div v-if="property.type === 'enum'" class="property-row__extra">
              <input
                class="property-input property-input--sm"
                :value="(property.enumValues || []).join(', ')"
                placeholder="val1, val2, val3"
                @change="updateEnumValues(property, ($event.target as HTMLInputElement).value)"
              >
            </div>
            <div v-if="property.type === 'enum' && property.required && (property.enumValues || []).length > 0" class="property-row__extra">
              <span class="property-row__label">По умолчанию</span>
              <select
                class="property-select"
                :value="property.enumDefault || ''"
                @change="handleEnumDefaultChange(property, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">— нет —</option>
                <option v-for="val in property.enumValues" :key="val" :value="val">{{ val }}</option>
              </select>
            </div>

            <div v-if="propertyErrors(property).length > 0" class="property-row__errors">
              <span v-for="(err, i) in propertyErrors(property)" :key="i" class="property-error">
                {{ err }}
              </span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.properties-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--surface);
}

.properties-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.properties-panel__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.properties-panel__entity-name {
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.properties-panel__add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: var(--surface-strong);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}

.properties-panel__add-btn .material-symbols-outlined {
  font-size: 18px;
}

.properties-panel__add-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

.properties-panel__empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-subtle);
}

.link-btn {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  padding: 0;
  text-decoration: underline;
}

.link-btn:hover {
  color: var(--primary-hover);
}

.properties-panel__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.property-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-muted);
  border: 1px solid transparent;
  transition: border-color 0.15s ease;
}

.property-row--error {
  border-color: rgba(220, 53, 69, 0.3);
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
  padding: 1px 7px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.property-row__from-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 1px 7px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.property-row__from-type-icon {
  font-size: 13px;
}

.property-row__required-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--warning);
  background: var(--warning-soft);
  padding: 1px 7px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.property-row__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 6px;
}

.property-row__main {
  display: flex;
  align-items: center;
  gap: 6px;
}

.property-input {
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
  outline: none;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.property-input:focus {
  border-color: var(--primary);
}

.property-input--name {
  flex: 1;
  min-width: 0;
}

.property-input--sm {
  flex: 1;
  min-width: 0;
}

.property-select {
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
  cursor: pointer;
  outline: none;
}

.property-select:focus {
  border-color: var(--primary);
}

.property-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
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

.property-remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
}

.property-remove-btn .material-symbols-outlined {
  font-size: 16px;
}

.property-remove-btn:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.property-row__extra {
  display: flex;
  gap: 6px;
  align-items: center;
}

.property-row__label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.property-input--num {
  width: 100px;
  flex: 0 0 100px;
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

.property-row__errors {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.property-error {
  font-size: 11px;
  color: var(--danger);
}
</style>
