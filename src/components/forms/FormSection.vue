<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    /** Staggered entrance delay, e.g. `60ms`. */
    animationDelay?: string
  }>(),
  {
    animationDelay: '0ms',
  },
)
</script>

<template>
  <section class="form-section" :style="{ animationDelay }">
    <div v-if="$slots['header-actions']" class="form-section__header">
      <h3 class="form-section__title">{{ title }}</h3>
      <div class="form-section__header-actions">
        <slot name="header-actions" />
      </div>
    </div>
    <h3 v-else class="form-section__title">{{ title }}</h3>
    <slot />
  </section>
</template>

<style scoped>
@keyframes formSectionFadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.form-section {
  background: var(--surface);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
  animation: formSectionFadeSlideIn 0.3s ease both;
}

.form-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.form-section__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.form-section__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
