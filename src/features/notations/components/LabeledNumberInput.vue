<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: number | string;
    min?: number;
    max?: number;
    step?: number;
  }>(),
  {
    min: undefined,
    max: undefined,
    step: 1,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

function handleInput(raw: string): void {
  emit("update:modelValue", raw);
}
</script>

<template>
  <div class="lnf">
    <span class="lnf__label">{{ label }}</span>
    <input
      type="number"
      class="lnf__input"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      @input="handleInput(($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<style scoped>
.lnf {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.lnf__label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
  padding-left: 2px;
}

.lnf__input {
  width: 100%;
  height: var(--sp-h, 28px);
  padding: 0 7px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--sp-radius, 6px);
  background: var(--surface-muted);
  color: var(--base-text);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.lnf__input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
</style>
