<script setup lang="ts">
defineProps<{
  label: string
  expanded: boolean
}>();

const emit = defineEmits<{
  toggle: []
}>();
</script>

<template>
  <div class="collapse-section">
    <div
      class="collapse-section__header"
      role="button"
      tabindex="0"
      @click="emit('toggle')"
      @keydown.enter.prevent="emit('toggle')"
      @keydown.space.prevent="emit('toggle')"
    >
      <span
        class="material-symbols-outlined collapse-section__chevron"
        :class="{ 'collapse-section__chevron--collapsed': !expanded }"
      >expand_more</span>
      <span class="collapse-section__label">{{ label }}</span>
      <slot name="header-extra" />
    </div>
    <template v-if="expanded">
      <slot />
    </template>
  </div>
</template>

<style scoped>
.collapse-section {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.collapse-section__header {
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
  cursor: pointer;
}

.collapse-section__chevron {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.collapse-section__chevron--collapsed {
  transform: rotate(-90deg);
}

.collapse-section__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
</style>
