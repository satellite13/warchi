<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

const invalidImageIds = ref<Set<string>>(new Set())
const checkedImageIds = ref<Set<string>>(new Set())
const validatingImageIds = new Set<string>()

function hasPreview(id: string): boolean {
  return Boolean(id) && !invalidImageIds.value.has(id)
}

function onPreviewError(id: string): void {
  if (!id || invalidImageIds.value.has(id)) return
  invalidImageIds.value = new Set([...invalidImageIds.value, id])
  checkedImageIds.value = new Set([...checkedImageIds.value, id])
}

function validateIcon(id: string): void {
  if (!id || checkedImageIds.value.has(id) || validatingImageIds.has(id)) return
  validatingImageIds.add(id)

  const image = new Image()
  image.onload = () => {
    checkedImageIds.value = new Set([...checkedImageIds.value, id])
    validatingImageIds.delete(id)
  }
  image.onerror = () => {
    invalidImageIds.value = new Set([...invalidImageIds.value, id])
    checkedImageIds.value = new Set([...checkedImageIds.value, id])
    validatingImageIds.delete(id)
  }
  image.src = `/icons/${id}.svg`
}

const sanitizedOptions = computed(() => {
  const seen = new Set<string>()
  return (props.options ?? []).filter((option) => {
    const id = option.id?.trim()
    if (!id || seen.has(id)) return false
    seen.add(id)
    return !invalidImageIds.value.has(id)
  })
})

watch(
  () => props.options,
  (options) => {
    for (const option of options ?? []) validateIcon(option.id?.trim() ?? '')
  },
  { immediate: true }
)
</script>

<template>
  <div class="icon-picker">
    <SearchableSelect
      :model-value="modelValue"
      :options="sanitizedOptions"
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
            v-if="hasPreview(option.id)"
            class="icon-picker__preview"
            :src="`/icons/${option.id}.svg`"
            :alt="option.label"
            @error="onPreviewError(option.id)"
          >
          {{ option.label }}
        </span>
      </template>
      <template #selected="{ option }">
        <span v-if="option" class="icon-picker__selected">
          <img
            v-if="hasPreview(option.id)"
            class="icon-picker__preview"
            :src="`/icons/${option.id}.svg`"
            :alt="option.label"
            @error="onPreviewError(option.id)"
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
