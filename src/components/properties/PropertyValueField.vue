<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToggleSwitch from '@/components/forms/ToggleSwitch.vue'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import { coercePropertyValue } from '@/utils/propertyUtils'

const props = withDefaults(
  defineProps<{
    property: CustomProperty
    modelValue: unknown
    disabled?: boolean
    invalid?: boolean
    errorText?: string
  }>(),
  {
    disabled: false,
    invalid: false,
    errorText: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const { t } = useI18n()

function enumValue(): string {
  return String(props.modelValue ?? props.property.enumDefault ?? props.property.defaultValue ?? '')
}
</script>

<template>
  <ToggleSwitch
    v-if="property.type === 'boolean'"
    :model-value="Boolean(modelValue)"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', coercePropertyValue(property, '', $event))"
  >
    {{ Boolean(modelValue) ? t('common.yes') : t('common.no') }}
  </ToggleSwitch>
  <select
    v-else-if="property.type === 'enum'"
    class="pvf-select"
    :disabled="disabled"
    :value="enumValue()"
    @change="
      !disabled &&
        emit(
          'update:modelValue',
          coercePropertyValue(property, ($event.target as HTMLSelectElement).value),
        )
    "
  >
    <option value="">{{ t('diagram.selectValue') }}</option>
    <option
      v-for="enumOption in property.enumValues ?? []"
      :key="`${property.id}-${enumOption}`"
      :value="enumOption"
    >
      {{ enumOption }}
    </option>
  </select>
  <div v-else class="pvf-input-wrap">
    <input
      class="pvf-input"
      :class="{ 'pvf-input--error': invalid }"
      :type="property.type === 'number' ? 'number' : 'text'"
      :placeholder="property.name"
      :readonly="disabled"
      :value="String(modelValue ?? '')"
      @input="
        !disabled &&
          emit(
            'update:modelValue',
            coercePropertyValue(property, ($event.target as HTMLInputElement).value),
          )
      "
    >
    <span v-if="invalid && errorText" class="pvf-error">{{ errorText }}</span>
  </div>
</template>

<style scoped>
.pvf-select,
.pvf-input {
  width: 100%;
  box-sizing: border-box;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--base-text);
  font-size: 13px;
  font-family: inherit;
}

.pvf-input--error {
  border-color: var(--danger);
}

.pvf-input-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.pvf-error {
  font-size: 11px;
  color: var(--danger);
}
</style>
