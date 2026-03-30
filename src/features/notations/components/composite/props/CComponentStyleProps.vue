<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LabeledFieldRow from '../../LabeledFieldRow.vue'
import LabeledNumberInput from '../../LabeledNumberInput.vue'
import ToggleSwitch from '@/components/forms/ToggleSwitch.vue'
import InsetSidesInput from '@/components/forms/InsetSidesInput.vue'
import type { CompositeSerializedCComponent } from '../../../notationAttrs'

const props = defineProps<{
  modelValue: CompositeSerializedCComponent
}>()

const emit = defineEmits<{
  (e: 'update:field', field: string, value: unknown): void
}>()
const { t } = useI18n()

const style = computed(() => props.modelValue.style ?? {})

function getMarginSides() {
  const m = style.value.margin
  if (m === undefined || m === null) return { top: 0, right: 0, bottom: 0, left: 0 }
  if (typeof m === 'number') return { top: m, right: m, bottom: m, left: m }
  return { top: m.top ?? 0, right: m.right ?? 0, bottom: m.bottom ?? 0, left: m.left ?? 0 }
}
</script>

<template>
  <div class="cstyle-props">
    <LabeledFieldRow :label="t('nodeStyle.compositeVisible')">
      <ToggleSwitch
        :model-value="style.visible !== false"
        @update:model-value="emit('update:field', 'style.visible', $event)"
      />
    </LabeledFieldRow>

    <LabeledNumberInput
      :label="t('nodeStyle.compositeOpacity')"
      :model-value="style.opacity ?? 1"
      :min="0"
      :max="1"
      :step="0.05"
      @update:model-value="emit('update:field', 'style.opacity', Number($event))"
    />

    <div class="cstyle-props__flex-row">
      <LabeledNumberInput
        :label="t('nodeStyle.compositeFlexGrow')"
        :model-value="style.flexGrow ?? 0"
        :min="0"
        :max="10"
        :step="1"
        @update:model-value="emit('update:field', 'style.flexGrow', Number($event))"
      />
      <LabeledNumberInput
        :label="t('nodeStyle.compositeFlexShrink')"
        :model-value="style.flexShrink ?? 1"
        :min="0"
        :max="10"
        :step="1"
        @update:model-value="emit('update:field', 'style.flexShrink', Number($event))"
      />
      <LabeledNumberInput
        :label="t('nodeStyle.compositeFlexBasis')"
        :model-value="typeof style.flexBasis === 'number' ? style.flexBasis : 0"
        :min="0"
        :max="500"
        :step="1"
        :tooltip="t('nodeStyle.compositeFlexBasis')"
        @update:model-value="emit('update:field', 'style.flexBasis', Number($event) || 'auto')"
      />
    </div>

    <LabeledFieldRow :label="t('nodeStyle.compositeAlignSelf')">
      <select
        class="cstyle-props__select"
        :value="style.alignSelf ?? 'auto'"
        @change="emit('update:field', 'style.alignSelf', ($event.target as HTMLSelectElement).value)"
      >
        <option value="auto">auto</option>
        <option value="start">start</option>
        <option value="center">center</option>
        <option value="end">end</option>
        <option value="stretch">stretch</option>
      </select>
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeMargin')">
      <InsetSidesInput
        :model-value="getMarginSides()"
        :min="0"
        :max="100"
        :step="1"
        @update:model-value="emit('update:field', 'style.margin', $event)"
      />
    </LabeledFieldRow>
  </div>
</template>

<style scoped>
.cstyle-props {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cstyle-props__flex-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

.cstyle-props__select {
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
