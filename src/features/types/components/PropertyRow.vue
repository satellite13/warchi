<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- editing mutable draft passed from type editor */
import { reactive } from "vue"
import { useI18n } from "vue-i18n"
import type { CustomProperty, CustomPropertyType } from "../../notations/notationAttrs"

const props = defineProps<{
  property: CustomProperty
  expanded: boolean
}>()

const emit = defineEmits<{
  toggle: []
  remove: []
}>()

const { t } = useI18n()
const typeOptions: { value: CustomPropertyType; label: string }[] = [
  { value: "string", label: t("types.propertyTypeString") },
  { value: "number", label: t("types.propertyTypeNumber") },
  { value: "boolean", label: t("types.propertyTypeBoolean") },
  { value: "enum", label: t("types.propertyTypeEnum") }
]

const typeLabel = (type: CustomPropertyType) =>
  typeOptions.find((o) => o.value === type)?.label ?? type

const parseNumberInput = (value: string): number | null => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const handleTypeChange = (value: string) => {
  props.property.type = value as CustomPropertyType
  props.property.defaultValue = undefined
  props.property.enumDefault = undefined
}

const handleDefaultStringChange = (value: string) => {
  props.property.defaultValue = value
}

const handleDefaultNumberChange = (value: string) => {
  props.property.defaultValue = parseNumberInput(value) ?? undefined
}

const handleDefaultBooleanChange = (value: string) => {
  if (value === "true") { props.property.defaultValue = true; return }
  if (value === "false") { props.property.defaultValue = false; return }
  props.property.defaultValue = undefined
}

const handleEnumDefaultChange = (value: string) => {
  const nextValue = value || undefined
  props.property.defaultValue = nextValue
  props.property.enumDefault = nextValue
}

const hasDefaultValue = (): boolean => {
  const p = props.property
  if (p.type === "number") return typeof p.defaultValue === "number" && Number.isFinite(p.defaultValue)
  if (p.type === "boolean") return typeof p.defaultValue === "boolean"
  return typeof p.defaultValue === "string" && p.defaultValue.trim().length > 0
}

const isRequiredDefaultMissing = (): boolean =>
  props.property.required && !hasDefaultValue()

const updateEnumValues = (value: string) => {
  props.property.enumValues = value.split(",").map((item) => item.trim()).filter(Boolean)
}

// Regex tester
const regexTestValues = reactive(new Map<string, string>())

const getRegexTestValue = () => regexTestValues.get(props.property.id) ?? ""

const setRegexTestValue = (value: string) => {
  regexTestValues.set(props.property.id, value)
}

const regexTestResult = (): null | boolean => {
  const testVal = regexTestValues.get(props.property.id)
  if (testVal === undefined || testVal === "") return null
  if (!props.property.regex) return null
  try { return new RegExp(props.property.regex).test(testVal) } catch { return null }
}
</script>

<template>
  <div class="property-row">
    <div
      class="property-row__header"
      role="button"
      tabindex="0"
      @click="emit('toggle')"
      @keydown.enter="emit('toggle')"
    >
      <span
        class="material-symbols-outlined property-row__chevron"
        :class="{ 'property-row__chevron--collapsed': !expanded }"
      >expand_more</span>
      <span class="property-row__name">{{ property.name || t("common.unnamed") }}</span>
      <span class="property-row__type-badge">{{ typeLabel(property.type) }}</span>
      <span v-if="property.required" class="property-row__required-badge">{{ t("types.requiredShort") }}</span>
      <button
        type="button"
        class="property-remove-btn"
        :title="t('types.removeProperty')"
        @click.stop="emit('remove')"
      >
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <template v-if="expanded">
      <div class="property-row__body">
        <div class="property-row__main">
          <input
            class="form-input"
            v-model="property.name"
            :placeholder="t('types.propertyNamePlaceholder')"
          >
          <select
            class="form-select"
            :value="property.type"
            @change="handleTypeChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <label class="property-checkbox">
            <input type="checkbox" v-model="property.required">
            <span class="property-checkbox__label">{{ t("types.requiredShort") }}</span>
          </label>
        </div>

        <div v-if="property.type === 'string'" class="property-row__extra">
          <input class="form-input" v-model="property.regex" :placeholder="t('types.regexOptional')">
          <input
            class="form-input form-input--num"
            type="number"
            :value="property.maxLength ?? ''"
            :placeholder="t('types.maxLength')"
            min="0"
            @input="property.maxLength = parseNumberInput(($event.target as HTMLInputElement).value)"
          >
        </div>
        <div v-if="property.type === 'string' && property.regex" class="property-row__extra regex-test">
          <input
            class="form-input"
            :value="getRegexTestValue()"
            :placeholder="t('types.testValue')"
            @input="setRegexTestValue(($event.target as HTMLInputElement).value)"
          >
          <span
            v-if="regexTestResult() !== null"
            class="regex-result"
            :class="regexTestResult() ? 'regex-result--pass' : 'regex-result--fail'"
          >
            <span class="material-symbols-outlined">
              {{ regexTestResult() ? 'check_circle' : 'cancel' }}
            </span>
            {{ regexTestResult() ? t("types.regexMatch") : t("types.regexNoMatch") }}
          </span>
        </div>

        <div v-if="property.type === 'number'" class="property-row__extra">
          <input
            class="form-input form-input--num"
            type="number"
            :value="property.min ?? ''"
            :placeholder="t('types.minValuePlaceholder')"
            @input="property.min = parseNumberInput(($event.target as HTMLInputElement).value)"
          >
          <input
            class="form-input form-input--num"
            type="number"
            :value="property.max ?? ''"
            :placeholder="t('types.maxValuePlaceholder')"
            @input="property.max = parseNumberInput(($event.target as HTMLInputElement).value)"
          >
        </div>

        <div v-if="property.type === 'enum'" class="property-row__extra">
          <input
            class="form-input"
            :value="(property.enumValues || []).join(', ')"
            :placeholder="t('types.enumValuesPlaceholder')"
            @change="updateEnumValues(($event.target as HTMLInputElement).value)"
          >
        </div>

        <div v-if="property.type === 'string' && property.required" class="property-row__extra">
          <span class="property-row__label">{{ t("types.defaultValue") }}</span>
          <input
            class="form-input"
            :value="typeof property.defaultValue === 'string' ? property.defaultValue : ''"
            :placeholder="t('types.defaultStringValue')"
            @input="handleDefaultStringChange(($event.target as HTMLInputElement).value)"
          >
        </div>
        <div v-if="property.type === 'number' && property.required" class="property-row__extra">
          <span class="property-row__label">{{ t("types.defaultValue") }}</span>
          <input
            class="form-input form-input--num"
            type="number"
            :value="typeof property.defaultValue === 'number' ? property.defaultValue : ''"
            :placeholder="t('types.defaultNumberValue')"
            @input="handleDefaultNumberChange(($event.target as HTMLInputElement).value)"
          >
        </div>
        <div v-if="property.type === 'boolean' && property.required" class="property-row__extra">
          <span class="property-row__label">{{ t("types.defaultValue") }}</span>
          <select
            class="form-select"
            :value="typeof property.defaultValue === 'boolean' ? String(property.defaultValue) : ''"
            @change="handleDefaultBooleanChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t("common.none") }}</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
        <div v-if="property.type === 'enum' && property.required && (property.enumValues || []).length > 0" class="property-row__extra">
          <span class="property-row__label">{{ t("types.defaultValue") }}</span>
          <select
            class="form-select"
            :value="typeof property.defaultValue === 'string' ? property.defaultValue : ''"
            @change="handleEnumDefaultChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t("common.none") }}</option>
            <option v-for="val in property.enumValues" :key="val" :value="val">{{ val }}</option>
          </select>
        </div>
        <div v-if="isRequiredDefaultMissing()" class="property-row__warning">
          {{ t("types.requiredNeedsDefault") }}
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
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

.property-row__warning {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--warning-soft);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 12px;
}

/* Form elements */
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
</style>
