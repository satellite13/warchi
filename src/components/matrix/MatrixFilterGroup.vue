<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="matrix-filter-group">
    <div class="matrix-filter-group__label-row">
      <label class="matrix-filter-group__label">{{ label }}</label>
      <div v-if="$slots.actions" class="matrix-filter-group__actions">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.matrix-filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.matrix-filter-group__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.matrix-filter-group__label {
  font-size: 11px;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.matrix-filter-group__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>
