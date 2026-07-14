<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LabeledFieldRow from '../../LabeledFieldRow.vue'
import LabeledNumberInput from '../../LabeledNumberInput.vue'
import SketchColorField from '../../SketchColorField.vue'
import InsetSidesInput from '@/components/forms/InsetSidesInput.vue'
import type { CompositeSerializedCComponent } from '@/domain/attrs/notationAttrs'

const props = defineProps<{
  modelValue: CompositeSerializedCComponent
}>()

const emit = defineEmits<{
  (e: 'update:field', field: string, value: unknown): void
}>()
const { t } = useI18n()

function getPaddingSides() {
  const p = props.modelValue.padding
  if (p === undefined || p === null) return { top: 0, right: 0, bottom: 0, left: 0 }
  if (typeof p === 'number') return { top: p, right: p, bottom: p, left: p }
  return { top: p.top ?? 0, right: p.right ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0 }
}
</script>

<template>
  <div class="shp-props">
    <LabeledFieldRow :label="t('nodeStyle.compositeBorderColor')">
      <SketchColorField
        :model-value="modelValue.borderColor ?? '#000000'"
        @update:model-value="emit('update:field', 'borderColor', $event)"
      />
    </LabeledFieldRow>

    <LabeledNumberInput
      :label="t('nodeStyle.compositeBorderWidth')"
      :model-value="modelValue.borderWidth ?? 1"
      :min="0"
      :max="20"
      :step="1"
      @update:model-value="emit('update:field', 'borderWidth', Number($event))"
    />

    <LabeledFieldRow :label="t('nodeStyle.compositeBgColor')">
      <SketchColorField
        :model-value="modelValue.backgroundColor ?? 'rgba(0,0,0,0)'"
        @update:model-value="emit('update:field', 'backgroundColor', $event)"
      />
    </LabeledFieldRow>

    <LabeledNumberInput
      :label="t('nodeStyle.compositeCornerRadius')"
      :model-value="modelValue.cornerRadius ?? 0"
      :min="0"
      :max="50"
      :step="1"
      @update:model-value="emit('update:field', 'cornerRadius', Number($event))"
    />

    <LabeledFieldRow :label="t('nodeStyle.compositePadding')">
      <InsetSidesInput
        :model-value="getPaddingSides()"
        :min="0"
        :max="100"
        :step="1"
        @update:model-value="emit('update:field', 'padding', $event)"
      />
    </LabeledFieldRow>

    <div class="shp-props__hint">
      {{ t('nodeStyle.compositeShapeContent') }}
    </div>
  </div>
</template>

<style scoped>
.shp-props {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shp-props__hint {
  font-size: 10px;
  color: var(--text-subtle);
  font-style: italic;
}
</style>
