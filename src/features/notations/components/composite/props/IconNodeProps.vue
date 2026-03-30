<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LabeledFieldRow from '../../LabeledFieldRow.vue'
import LabeledNumberInput from '../../LabeledNumberInput.vue'
import SketchColorField from '../../SketchColorField.vue'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'
import ToggleSwitch from '@/components/forms/ToggleSwitch.vue'
import { COMBINED_ICON_OPTIONS } from '@/config/iconOptions'
import type { CompositeSerializedCComponent } from '../../../notationAttrs'

defineProps<{
  modelValue: CompositeSerializedCComponent
}>()

const emit = defineEmits<{
  (e: 'update:field', field: string, value: unknown): void
}>()
const { t } = useI18n()
</script>

<template>
  <div class="ico-props">
    <LabeledFieldRow :label="t('nodeStyle.compositeIconSource')">
      <div class="ico-props__icon-select">
        <SearchableSelect
          :model-value="modelValue.source ?? ''"
          :options="COMBINED_ICON_OPTIONS"
          allow-empty
          :empty-label="t('nodeStyle.none')"
          :placeholder="t('nodeStyle.none')"
          :search-placeholder="t('common.search')"
          :empty-text="t('common.nothingFound')"
          @update:model-value="emit('update:field', 'source', $event)"
        >
          <template #option="{ option }">
            <span class="ico-props__option">
              <img class="ico-props__option-preview" :src="`/icons/${option.id}.svg`" :alt="option.label">
              {{ option.label }}
            </span>
          </template>
        </SearchableSelect>
        <img
          v-if="modelValue.source"
          class="ico-props__preview"
          :src="`/icons/${modelValue.source}.svg`"
          :alt="modelValue.source"
        >
      </div>
    </LabeledFieldRow>

    <div class="ico-props__size-row">
      <LabeledNumberInput
        :label="t('nodeStyle.compositeIconWidth')"
        :model-value="modelValue.width ?? 24"
        :min="4"
        :max="200"
        :step="1"
        @update:model-value="emit('update:field', 'width', Number($event))"
      />
      <LabeledNumberInput
        :label="t('nodeStyle.compositeIconHeight')"
        :model-value="modelValue.height ?? 24"
        :min="4"
        :max="200"
        :step="1"
        @update:model-value="emit('update:field', 'height', Number($event))"
      />
    </div>

    <LabeledFieldRow :label="t('nodeStyle.compositeIconBgColor')">
      <SketchColorField
        :model-value="modelValue.backgroundColor ?? 'rgba(0,0,0,0)'"
        @update:model-value="emit('update:field', 'backgroundColor', $event)"
      />
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeIconFillColor')">
      <SketchColorField
        :model-value="modelValue.fillColor ?? '#000000'"
        @update:model-value="emit('update:field', 'fillColor', $event)"
      />
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeBindsNotationIcon')">
      <ToggleSwitch
        :model-value="modelValue.bindsNotationIcon ?? false"
        @update:model-value="emit('update:field', 'bindsNotationIcon', $event)"
      />
    </LabeledFieldRow>
  </div>
</template>

<style scoped>
.ico-props {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ico-props__icon-select {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.ico-props__preview {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  opacity: 0.7;
}

.ico-props__option {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ico-props__option-preview {
  width: 18px;
  height: 18px;
  opacity: 0.7;
}

.ico-props__size-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
</style>
