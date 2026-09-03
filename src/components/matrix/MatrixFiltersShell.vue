<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Draw a right border (notation rules matrix sidebar). */
    bordered?: boolean
    /** Vertical padding density. */
    padding?: 'sm' | 'md'
  }>(),
  {
    bordered: false,
    padding: 'md',
  }
)
</script>

<template>
  <section
    class="matrix-filters-shell"
    :class="[
      bordered ? 'matrix-filters-shell--bordered' : null,
      `matrix-filters-shell--pad-${padding}`,
    ]"
  >
    <slot />
    <div v-if="$slots.toggles" class="matrix-filters-shell__toggles">
      <slot name="toggles" />
    </div>
  </section>
</template>

<style scoped>
.matrix-filters-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
  background: var(--surface);
}

.matrix-filters-shell--pad-sm {
  padding: 10px;
}

.matrix-filters-shell--pad-md {
  padding: 12px;
}

.matrix-filters-shell--bordered {
  border-right: 1px solid var(--border);
}

.matrix-filters-shell__toggles {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
</style>
