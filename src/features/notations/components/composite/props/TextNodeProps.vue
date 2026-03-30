<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LabeledFieldRow from '../../LabeledFieldRow.vue'
import LabeledNumberInput from '../../LabeledNumberInput.vue'
import SketchColorField from '../../SketchColorField.vue'
import type { CompositeSerializedCComponent, CustomProperty } from '../../../notationAttrs'

const props = defineProps<{
  modelValue: CompositeSerializedCComponent
  stringProperties?: CustomProperty[]
}>()

const emit = defineEmits<{
  (e: 'update:field', field: string, value: unknown): void
}>()
const { t } = useI18n()

const FONT_WEIGHT_OPTIONS = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']
const BIND_TO_NAME = '__name__'

const currentBinding = computed(() => {
  if (props.modelValue.bindToProperty) return props.modelValue.bindToProperty
  // Backward compat: role === 'name' means bound to name
  if (props.modelValue.role === 'name') return BIND_TO_NAME
  return ''
})

function handleBindingChange(value: string) {
  emit('update:field', 'bindToProperty', value || undefined)
  // Clear legacy role when using new binding
  if (props.modelValue.role === 'name' && value !== BIND_TO_NAME) {
    emit('update:field', 'role', undefined)
  }
}
</script>

<template>
  <div class="txt-props">
    <LabeledFieldRow :label="t('nodeStyle.compositeText')">
      <input
        class="txt-props__input"
        :value="modelValue.text ?? ''"
        @input="emit('update:field', 'text', ($event.target as HTMLInputElement).value)"
      />
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeBindToProperty')">
      <select
        class="txt-props__select"
        :value="currentBinding"
        @change="handleBindingChange(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t('common.none') }}</option>
        <option :value="BIND_TO_NAME">{{ t('nodeStyle.compositeBindToName') }}</option>
        <option
          v-for="prop in stringProperties"
          :key="prop.id"
          :value="prop.name"
        >{{ prop.name }}</option>
      </select>
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeFontFamily')">
      <input
        class="txt-props__input"
        :value="modelValue.fontFamily ?? ''"
        placeholder="sans-serif"
        @input="emit('update:field', 'fontFamily', ($event.target as HTMLInputElement).value)"
      />
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeFontWeight')">
      <select
        class="txt-props__select"
        :value="modelValue.fontWeight ?? 'normal'"
        @change="emit('update:field', 'fontWeight', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="w in FONT_WEIGHT_OPTIONS" :key="w" :value="w">{{ w }}</option>
      </select>
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeFontStyle')">
      <div class="txt-props__segmented">
        <button
          type="button"
          class="txt-props__seg-btn"
          :class="{ 'txt-props__seg-btn--active': (modelValue.fontStyle ?? 'normal') === 'normal' }"
          @click="emit('update:field', 'fontStyle', 'normal')"
        >
          normal
        </button>
        <button
          type="button"
          class="txt-props__seg-btn"
          :class="{ 'txt-props__seg-btn--active': modelValue.fontStyle === 'italic' }"
          style="font-style: italic"
          @click="emit('update:field', 'fontStyle', 'italic')"
        >
          italic
        </button>
      </div>
    </LabeledFieldRow>

    <LabeledNumberInput
      :label="t('nodeStyle.compositeFontSize')"
      :model-value="modelValue.fontSize ?? 14"
      :min="6"
      :max="72"
      :step="1"
      @update:model-value="emit('update:field', 'fontSize', Number($event))"
    />

    <LabeledFieldRow :label="t('nodeStyle.compositeColor')">
      <SketchColorField
        :model-value="modelValue.color ?? '#000000'"
        @update:model-value="emit('update:field', 'color', $event)"
      />
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeAlign')">
      <div class="txt-props__icon-seg">
        <button
          v-for="a in (['left', 'center', 'right'] as const)"
          :key="a"
          type="button"
          class="txt-props__icon-btn"
          :class="{ 'txt-props__icon-btn--active': (modelValue.align ?? 'left') === a }"
          @click="emit('update:field', 'align', a)"
        >
          <UiIcon :name="a === 'left' ? 'format_align_left' : a === 'center' ? 'format_align_center' : 'format_align_right'" />
        </button>
      </div>
    </LabeledFieldRow>

    <LabeledFieldRow :label="t('nodeStyle.compositeVerticalAlign')">
      <div class="txt-props__icon-seg">
        <button
          v-for="a in (['top', 'middle', 'bottom'] as const)"
          :key="a"
          type="button"
          class="txt-props__icon-btn"
          :class="{ 'txt-props__icon-btn--active': (modelValue.verticalAlign ?? 'top') === a }"
          @click="emit('update:field', 'verticalAlign', a)"
        >
          <UiIcon :name="a === 'top' ? 'vertical_align_top' : a === 'middle' ? 'vertical_align_center' : 'vertical_align_bottom'" />
        </button>
      </div>
    </LabeledFieldRow>

    <LabeledNumberInput
      :label="t('nodeStyle.compositeMaxLines')"
      :model-value="modelValue.maxLines ?? 0"
      :min="0"
      :max="100"
      :step="1"
      :tooltip="t('nodeStyle.compositeMaxLines')"
      @update:model-value="emit('update:field', 'maxLines', Number($event))"
    />

    <LabeledNumberInput
      :label="t('nodeStyle.compositeLineHeight')"
      :model-value="modelValue.lineHeight ?? 1.2"
      :min="0.5"
      :max="5"
      :step="0.1"
      @update:model-value="emit('update:field', 'lineHeight', Number($event))"
    />

    <LabeledFieldRow :label="t('nodeStyle.compositeRotation')">
      <div class="txt-props__segmented">
        <button
          type="button"
          class="txt-props__seg-btn"
          :class="{ 'txt-props__seg-btn--active': (modelValue.rotation ?? 0) === 0 }"
          @click="emit('update:field', 'rotation', 0)"
        >0°</button>
        <button
          type="button"
          class="txt-props__seg-btn"
          :class="{ 'txt-props__seg-btn--active': modelValue.rotation === 90 }"
          @click="emit('update:field', 'rotation', 90)"
        >90°</button>
        <button
          type="button"
          class="txt-props__seg-btn"
          :class="{ 'txt-props__seg-btn--active': modelValue.rotation === -90 }"
          @click="emit('update:field', 'rotation', -90)"
        >−90°</button>
      </div>
    </LabeledFieldRow>
  </div>
</template>

<style scoped>
.txt-props {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.txt-props__input {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
  min-width: 0;
}

.txt-props__input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
  outline: none;
}

.txt-props__select {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
}

.txt-props__segmented {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  flex: 1;
}

.txt-props__seg-btn {
  flex: 1;
  height: 28px;
  border: none;
  background: var(--surface-muted);
  font-size: 11px;
  color: var(--text-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.txt-props__seg-btn:not(:last-child) {
  border-right: 1px solid var(--border);
}

.txt-props__seg-btn--active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}

.txt-props__icon-seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.txt-props__icon-btn {
  width: 28px;
  height: 24px;
  border: none;
  background: var(--surface-muted);
  color: var(--text-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.txt-props__icon-btn:not(:last-child) {
  border-right: 1px solid var(--border);
}

.txt-props__icon-btn :deep(.ui-icon) {
  width: 14px;
  height: 14px;
}

.txt-props__icon-btn--active {
  background: var(--primary-soft);
  color: var(--primary);
}
</style>
