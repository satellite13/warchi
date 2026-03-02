<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchableSelect from './SearchableSelect.vue'
import { COMBINED_ICON_OPTIONS } from '@/config/iconOptions'
import type { IconOption } from '@/config/iconOptions'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** Options (id = filename in public/icons/ without .svg). Default: COMBINED_ICON_OPTIONS */
    options?: IconOption[]
    placeholder?: string
    emptyLabel?: string
  }>(),
  {
    options: () => COMBINED_ICON_OPTIONS,
    placeholder: '',
    emptyLabel: undefined,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()

const effectiveEmptyLabel = computed(() => props.emptyLabel ?? t('types.iconClear'))
</script>

<template>
  <div class="icon-picker">
    <SearchableSelect
      :model-value="modelValue"
      :options="options"
      allow-empty
      :empty-label="effectiveEmptyLabel"
      :placeholder="placeholder || effectiveEmptyLabel"
      :search-placeholder="t('common.search')"
      :empty-text="t('common.nothingFound')"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #option="{ option }">
        <span class="icon-picker__option">
          <img
            v-if="option.id"
            class="icon-picker__preview"
            :src="`/icons/${option.id}.svg`"
            :alt="option.label"
          >
          {{ option.label }}
        </span>
      </template>
      <template #selected="{ option }">
        <span v-if="option" class="icon-picker__selected">
          <img
            v-if="option.id"
            class="icon-picker__preview"
            :src="`/icons/${option.id}.svg`"
            :alt="option.label"
          >
          {{ option.label }}
        </span>
      </template>
    </SearchableSelect>
  </div>
</template>

<style scoped>
.icon-picker {
  min-width: 140px;
}

.icon-picker__option,
.icon-picker__selected {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-picker__preview {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  object-fit: contain;
}
</style>
