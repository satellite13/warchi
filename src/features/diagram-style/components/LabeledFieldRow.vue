<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    indent?: boolean;
  }>(),
  {
    indent: false,
  }
);
</script>

<template>
  <div class="lfr" :class="{ 'lfr--indent': indent }">
    <span class="lfr__label">{{ label }}</span>
    <slot />
  </div>
</template>

<style scoped>
.lfr {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.lfr--indent {
  padding-left: 12px;
}

.lfr__label {
  font-size: 10px;
  color: var(--text-subtle);
  line-height: 1;
  white-space: nowrap;
  min-width: 48px;
  flex-shrink: 0;
}
</style>
