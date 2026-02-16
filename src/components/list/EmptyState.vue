<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  icon?: "models" | "search" | "error";
}>();
</script>

<template>
  <div class="empty-state">
    <svg v-if="icon === 'models' || !icon" class="empty-state__icon" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="50" fill="rgba(124, 92, 252, 0.08)"/>
      <path d="M40 75 L60 45 L80 75" stroke="#7c5cfc" stroke-width="4" stroke-linecap="round" fill="none"/>
      <circle cx="60" cy="45" r="4" fill="#7c5cfc"/>
      <circle cx="40" cy="75" r="4" fill="#7c5cfc"/>
      <circle cx="80" cy="75" r="4" fill="#7c5cfc"/>
      <path d="M35 85 h50" stroke="var(--border-strong)" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <svg v-else-if="icon === 'search'" class="empty-state__icon" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="50" fill="rgba(124, 92, 252, 0.08)"/>
      <circle cx="52" cy="52" r="20" stroke="#7c5cfc" stroke-width="4" fill="none"/>
      <path d="M66 66 L80 80" stroke="#7c5cfc" stroke-width="4" stroke-linecap="round"/>
    </svg>
    <svg v-else-if="icon === 'error'" class="empty-state__icon" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="50" fill="rgba(239, 68, 68, 0.08)"/>
      <circle cx="60" cy="60" r="30" stroke="#ef4444" stroke-width="4" fill="none"/>
      <path d="M50 50 L70 70 M70 50 L50 70" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>
    </svg>
    <p class="empty-state__title">
      {{ title }}
    </p>
    <p v-if="description" class="empty-state__description">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="empty-state__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-state__icon {
  width: 120px;
  height: 120px;
  margin-bottom: 24px;
  opacity: 0.9;
}

.empty-state__title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 500;
  color: var(--base-text);
  letter-spacing: -0.01em;
}

.empty-state__description {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

.empty-state__actions {
  margin-top: 24px;
}
</style>
