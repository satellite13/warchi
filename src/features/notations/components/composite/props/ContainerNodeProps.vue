<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LabeledFieldRow from '../../LabeledFieldRow.vue'
import LabeledNumberInput from '../../LabeledNumberInput.vue'
import InsetSidesInput from '@/components/forms/InsetSidesInput.vue'
import type { CompositeSerializedCComponent } from '../../../notationAttrs'

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
  <div class="cnt-props">
    <LabeledFieldRow :label="t('nodeStyle.compositeDirection')">
      <div class="cnt-props__segmented">
        <button
          type="button"
          class="cnt-props__seg-btn"
          :class="{ 'cnt-props__seg-btn--active': modelValue.direction !== 'row' }"
          @click="emit('update:field', 'direction', 'column')"
        >
          {{ t('nodeStyle.compositeDirectionColumn') }}
        </button>
        <button
          type="button"
          class="cnt-props__seg-btn"
          :class="{ 'cnt-props__seg-btn--active': modelValue.direction === 'row' }"
          @click="emit('update:field', 'direction', 'row')"
        >
          {{ t('nodeStyle.compositeDirectionRow') }}
        </button>
      </div>
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeJustifyContent')">
      <select
        class="cnt-props__select"
        :value="modelValue.justifyContent ?? 'start'"
        @change="emit('update:field', 'justifyContent', ($event.target as HTMLSelectElement).value)"
      >
        <option value="start">start</option>
        <option value="center">center</option>
        <option value="end">end</option>
        <option value="space-between">space-between</option>
        <option value="space-around">space-around</option>
      </select>
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeAlignItems')">
      <select
        class="cnt-props__select"
        :value="modelValue.alignItems ?? 'stretch'"
        @change="emit('update:field', 'alignItems', ($event.target as HTMLSelectElement).value)"
      >
        <option value="start">start</option>
        <option value="center">center</option>
        <option value="end">end</option>
        <option value="stretch">stretch</option>
      </select>
    </LabeledFieldRow>

    <LabeledNumberInput
      :label="t('nodeStyle.compositeGap')"
      :model-value="modelValue.gap ?? 0"
      :min="0"
      :max="100"
      :step="1"
      @update:model-value="emit('update:field', 'gap', Number($event))"
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
  </div>
</template>

<style scoped>
.cnt-props {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cnt-props__segmented {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  flex: 1;
}

.cnt-props__seg-btn {
  flex: 1;
  height: 28px;
  border: none;
  background: var(--surface-muted);
  font-size: 11px;
  color: var(--text-subtle);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.cnt-props__seg-btn:not(:last-child) {
  border-right: 1px solid var(--border);
}

.cnt-props__seg-btn--active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}

.cnt-props__select {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
}
</style>
