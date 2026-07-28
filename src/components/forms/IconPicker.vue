<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LazyIconImg from './LazyIconImg.vue'
import SearchableSelect from './SearchableSelect.vue'
import {
  COMBINED_ICON_OPTIONS,
  ICON_SELECT_MIN_SEARCH_LENGTH,
  iconSelectRequiresMinSearch,
} from '@/config/iconOptions'
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

function hasPreview(id: string): boolean {
  return Boolean(id) && !invalidImageIds.value.has(id)
}

function onPreviewError(id: string): void {
  if (!id || invalidImageIds.value.has(id)) return
  invalidImageIds.value = new Set([...invalidImageIds.value, id])
}

const sanitizedOptions = computed(() => {
  const seen = new Set<string>()
  return (props.options ?? []).filter((option) => {
    const id = option.id?.trim()
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
})

const requiresSearch = computed(() => iconSelectRequiresMinSearch(sanitizedOptions.value.length))
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
      :min-search-length="requiresSearch ? ICON_SELECT_MIN_SEARCH_LENGTH : 0"
      :min-search-hint="requiresSearch ? t('common.typeToSearch') : ''"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #option="{ option }">
        <span class="icon-picker__option">
          <LazyIconImg
            v-if="hasPreview(option.id)"
            :icon-id="option.id"
            :alt="option.label"
            img-class="icon-picker__preview"
            @error="onPreviewError"
          />
          <span v-else class="icon-picker__preview icon-picker__preview--missing" aria-hidden="true" />
          {{ option.label }}
        </span>
      </template>
      <template #selected="{ option }">
        <span v-if="option" class="icon-picker__selected">
          <LazyIconImg
            v-if="hasPreview(option.id)"
            :icon-id="option.id"
            :alt="option.label"
            img-class="icon-picker__preview"
            eager
            @error="onPreviewError"
          />
          <span v-else class="icon-picker__preview icon-picker__preview--missing" aria-hidden="true" />
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

.icon-picker__preview--missing {
  display: inline-block;
  border-radius: 3px;
  background: var(--surface-strong, #e8e6e3);
}
</style>
