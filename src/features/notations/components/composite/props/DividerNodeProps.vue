<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LabeledFieldRow from '../../LabeledFieldRow.vue'
import LabeledNumberInput from '../../LabeledNumberInput.vue'
import SketchColorField from '../../SketchColorField.vue'
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
  <div class="div-props">
    <LabeledNumberInput
      :label="t('nodeStyle.compositeThickness')"
      :model-value="modelValue.thickness ?? 1"
      :min="1"
      :max="20"
      :step="1"
      @update:model-value="emit('update:field', 'thickness', Number($event))"
    />

    <LabeledFieldRow :label="t('nodeStyle.compositeDividerColor')">
      <SketchColorField
        :model-value="modelValue.color ?? '#cccccc'"
        @update:model-value="emit('update:field', 'color', $event)"
      />
    </LabeledFieldRow>
  </div>
</template>

<style scoped>
.div-props {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
