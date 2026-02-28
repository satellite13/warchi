<script setup lang="ts">
import SketchColorField from "./SketchColorField.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    alphaValue: number;
    alphaMin?: number;
    alphaMax?: number;
    alphaStep?: number;
    title?: string;
  }>(),
  {
    alphaMin: 0,
    alphaMax: 1,
    alphaStep: 0.1,
    title: undefined,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:alpha", value: number): void;
}>();

function handleAlphaInput(raw: string): void {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return;
  emit("update:alpha", parsed);
}
</script>

<template>
  <SketchColorField
    :model-value="modelValue"
    :alpha-value="alphaValue"
    :title="title"
    @update:model-value="(value) => emit('update:modelValue', value)"
    @update:alpha="(value) => emit('update:alpha', value)"
  />
  <div class="cwa-num-field">
    <span class="cwa-num-field__label">A</span>
    <input
      type="number"
      class="cwa-input cwa-input--tiny"
      :value="alphaValue"
      :min="alphaMin"
      :max="alphaMax"
      :step="alphaStep"
      @input="handleAlphaInput(($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<style scoped>
.cwa-num-field {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.cwa-num-field__label {
  font-size: 10px;
  color: var(--text-subtle);
  white-space: nowrap;
  line-height: 1;
}

.cwa-input {
  height: var(--sp-h, 28px);
  padding: 0 7px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--sp-radius, 6px);
  background: var(--surface-muted);
  color: var(--base-text);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

.cwa-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.cwa-input--tiny {
  width: 48px;
  text-align: center;
  padding: 0 3px;
}
</style>
