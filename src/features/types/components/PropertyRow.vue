<script setup lang="ts">
import { computed, reactive } from "vue"
import { useI18n } from "vue-i18n"
import { parseNumberInput } from "@/utils/number"
import type { CustomProperty, CustomPropertyType } from "../../notations/notationAttrs"

const props = withDefaults(defineProps<{
  property: CustomProperty
  expanded: boolean
  onMutateProperty?: (apply: (p: CustomProperty) => void) => void
  size?: "default" | "sm"
  errors?: string[]
  fromType?: boolean
  isEquivalentToType?: boolean
}>(), {
  onMutateProperty: undefined,
  errors: () => [] as string[],
  size: "default"
})

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

const handleTypeChange = (value: string) => {
  props.onMutateProperty?.((p) => {
    p.type = value as CustomPropertyType
    p.defaultValue = undefined
    p.enumDefault = undefined
  })
}

const handleDefaultStringChange = (value: string) => {
  props.onMutateProperty?.((p) => { p.defaultValue = value })
}

const handleDefaultNumberChange = (value: string) => {
  props.onMutateProperty?.((p) => { p.defaultValue = parseNumberInput(value) ?? undefined })
}

const handleDefaultBooleanChange = (value: string) => {
  props.onMutateProperty?.((p) => {
    if (value === "true") { p.defaultValue = true; return }
    if (value === "false") { p.defaultValue = false; return }
    p.defaultValue = undefined
  })
}

const handleEnumDefaultChange = (value: string) => {
  const nextValue = value || undefined
  props.onMutateProperty?.((p) => {
    p.defaultValue = nextValue
    p.enumDefault = nextValue
  })
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
  props.onMutateProperty?.((p) => {
    p.enumValues = value.split(",").map((item) => item.trim()).filter(Boolean)
  })
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

const isSm = computed(() => props.size === "sm")
const inputClass = computed(() => isSm.value ? "form-input form-input--sm" : "form-input")
const inputNumClass = computed(() => isSm.value ? "form-input form-input--sm form-input--num" : "form-input form-input--num")
const selectClass = computed(() => isSm.value ? "form-select form-select--sm" : "form-select")
const showFromTypeBadge = computed(() => props.fromType || props.isEquivalentToType)
</script>

<template>
  <div class="property-row" :class="{ 'property-row--sm': isSm, 'property-row--error': errors && errors.length > 0 }">
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
      <span
        v-if="showFromTypeBadge"
        class="property-row__from-type-badge"
        :title="t('types.inheritedFromType')"
      >
        <span class="material-symbols-outlined property-row__from-type-icon">linked_services</span>
        {{ t("types.typeShort") }}
      </span>
      <span v-if="property.system" class="property-row__system-badge">{{ t("types.systemShort") }}</span>
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
            :class="inputClass"
            :value="property.name"
            :placeholder="t('types.propertyNamePlaceholder')"
            @input="onMutateProperty?.((p) => { p.name = ($event.target as HTMLInputElement).value })"
          >
          <select
            :class="selectClass"
            :value="property.type"
            @change="handleTypeChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <label class="property-checkbox">
            <input
              type="checkbox"
              :checked="property.required"
              @change="onMutateProperty?.((p) => { p.required = ($event.target as HTMLInputElement).checked })"
            >
            <span class="property-checkbox__label">{{ t("types.requiredShort") }}</span>
          </label>
          <label class="property-checkbox">
            <input
              type="checkbox"
              :checked="property.system"
              @change="onMutateProperty?.((p) => { p.system = ($event.target as HTMLInputElement).checked })"
            >
            <span class="property-checkbox__label">{{ t("types.systemShort") }}</span>
          </label>
        </div>

        <div v-if="property.type === 'string'" class="property-row__extra">
          <input
            :class="inputClass"
            :value="property.regex"
            :placeholder="t('types.regexOptional')"
            @input="onMutateProperty?.((p) => { p.regex = ($event.target as HTMLInputElement).value || undefined })"
          >
          <input
            :class="inputNumClass"
            type="number"
            :value="property.maxLength ?? ''"
            :placeholder="t('types.maxLength')"
            min="0"
            @input="onMutateProperty?.((p) => { p.maxLength = parseNumberInput(($event.target as HTMLInputElement).value) })"
          >
        </div>
        <div v-if="property.type === 'string' && property.regex" class="property-row__extra regex-test">
          <input
            :class="inputClass"
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
            :class="inputNumClass"
            type="number"
            :value="property.min ?? ''"
            :placeholder="t('types.minValuePlaceholder')"
            @input="onMutateProperty?.((p) => { p.min = parseNumberInput(($event.target as HTMLInputElement).value) })"
          >
          <input
            :class="inputNumClass"
            type="number"
            :value="property.max ?? ''"
            :placeholder="t('types.maxValuePlaceholder')"
            @input="onMutateProperty?.((p) => { p.max = parseNumberInput(($event.target as HTMLInputElement).value) })"
          >
        </div>

        <div v-if="property.type === 'enum'" class="property-row__extra">
          <input
            :class="inputClass"
            :value="(property.enumValues || []).join(', ')"
            :placeholder="t('types.enumValuesPlaceholder')"
            @change="updateEnumValues(($event.target as HTMLInputElement).value)"
          >
        </div>

        <div v-if="property.type === 'string' && property.required" class="property-row__extra">
          <span class="property-row__label">{{ t("types.defaultValue") }}</span>
          <input
            :class="inputClass"
            :value="typeof property.defaultValue === 'string' ? property.defaultValue : ''"
            :placeholder="t('types.defaultStringValue')"
            @input="handleDefaultStringChange(($event.target as HTMLInputElement).value)"
          >
        </div>
        <div v-if="property.type === 'number' && property.required" class="property-row__extra">
          <span class="property-row__label">{{ t("types.defaultValue") }}</span>
          <input
            :class="inputNumClass"
            type="number"
            :value="typeof property.defaultValue === 'number' ? property.defaultValue : ''"
            :placeholder="t('types.defaultNumberValue')"
            @input="handleDefaultNumberChange(($event.target as HTMLInputElement).value)"
          >
        </div>
        <div v-if="property.type === 'boolean' && property.required" class="property-row__extra">
          <span class="property-row__label">{{ t("types.defaultValue") }}</span>
          <select
            :class="selectClass"
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
            :class="selectClass"
            :value="typeof property.defaultValue === 'string' ? property.defaultValue : ''"
            @change="handleEnumDefaultChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t("common.none") }}</option>
            <option v-for="val in property.enumValues" :key="val" :value="val">{{ val }}</option>
          </select>
        </div>
        <div v-if="errors === undefined && isRequiredDefaultMissing()" class="property-row__warning">
          {{ t("types.requiredNeedsDefault") }}
        </div>
        <div v-if="errors && errors.length > 0" class="property-row__errors">
          <span v-for="(err, i) in errors" :key="i" class="property-error">{{ err }}</span>
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

.property-row--sm {
  padding: 8px 10px;
  border-radius: 8px;
}

.property-row--sm .property-row__body {
  gap: 4px;
  padding-top: 6px;
}

.property-row--sm .property-row__main {
  gap: 6px;
}

.property-row--sm .property-row__extra {
  gap: 6px;
}

.property-row--error {
  border-color: rgba(220, 53, 69, 0.3);
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

.property-row__system-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--info, #0ea5e9);
  background: var(--info-soft, rgba(14, 165, 233, 0.12));
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

.property-row__from-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.property-row--sm .property-row__from-type-badge {
  padding: 1px 7px;
}

.property-row__from-type-icon {
  font-size: 13px;
}

.property-row__warning {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--warning-soft);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 12px;
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
