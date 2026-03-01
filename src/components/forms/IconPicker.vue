<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SearchableSelect from './SearchableSelect.vue'
import { AVAILABLE_ICON_OPTIONS } from '@/config/availableIcons'

withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
  }>(),
  { placeholder: '' }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="icon-picker">
    <SearchableSelect
      :model-value="modelValue"
      :options="AVAILABLE_ICON_OPTIONS"
      allow-empty
      :empty-label="t('types.iconClear')"
      :placeholder="t('types.iconClear')"
      :search-placeholder="t('common.search')"
      :empty-text="t('common.nothingFound')"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #option="{ option }">
        <span class="icon-picker__option">
          <img
            v-if="option.id"
            class="icon-picker__option-preview"
            :src="`/icons/${option.id}.svg`"
            :alt="option.label"
          >
          {{ option.label }}
        </span>
      </template>
      <template #selected="{ option }">
        <span v-if="option" class="icon-picker__selected">
          <img
            class="icon-picker__selected-preview"
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

.icon-picker__option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-picker__option-preview {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  object-fit: contain;
}

.icon-picker__selected {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-picker__selected-preview {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  object-fit: contain;
}
</style>
