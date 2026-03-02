<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean;
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();
</script>

<template>
  <label class="toggle-switch" :class="{ 'toggle-switch--disabled': disabled }">
    <input
      type="checkbox"
      class="toggle-switch__input"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
    <span
      class="toggle-switch__track"
      :class="{ 'toggle-switch__track--on': modelValue }"
      aria-hidden="true"
    >
      <span class="toggle-switch__thumb" />
    </span>
    <span v-if="$slots.default" class="toggle-switch__label">
      <slot />
    </span>
  </label>
</template>

<style scoped>
.toggle-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  min-width: 0;
}

.toggle-switch--disabled {
  cursor: default;
  opacity: 0.6;
}

.toggle-switch__input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.toggle-switch__track {
  position: relative;
  width: 34px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 9px;
  border: none;
  background: var(--border-strong);
  transition: background 0.2s ease;
  box-sizing: border-box;
}

.toggle-switch:not(.toggle-switch--disabled) .toggle-switch__track {
  cursor: pointer;
}

.toggle-switch__track--on {
  background: var(--primary);
}

.toggle-switch:not(.toggle-switch--disabled):hover .toggle-switch__track--on {
  background: var(--primary-hover);
}

.toggle-switch__input:focus-visible + .toggle-switch__track {
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.toggle-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-switch__track--on .toggle-switch__thumb {
  transform: translateX(16px);
}

.toggle-switch__label {
  font-size: 12px;
  color: var(--text-muted);
  user-select: none;
}
</style>
