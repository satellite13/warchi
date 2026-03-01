<script setup lang="ts">
import SketchColorField from "./SketchColorField.vue";

withDefaults(
  defineProps<{
    modelValue: string;
    alphaValue: number;
    title?: string;
  }>(),
  {
    title: undefined,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:alpha", value: number): void;
}>();
</script>

<template>
  <div class="cwa">
    <SketchColorField
      class="cwa__color"
      :model-value="modelValue"
      :alpha-value="alphaValue"
      :title="title"
      @update:model-value="(value) => emit('update:modelValue', value)"
      @update:alpha="(value) => emit('update:alpha', value)"
    />
  </div>
</template>

<style scoped>
.cwa {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  flex-wrap: nowrap;
}

.cwa__color {
  flex: 1;
  min-width: 0;
}
</style>
