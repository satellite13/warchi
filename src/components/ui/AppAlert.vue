<script setup lang="ts">
defineProps<{
  type: 'error' | 'success' | 'info'
  message: string
}>()
</script>

<template>
  <Transition name="app-alert">
    <div v-if="message" class="app-alert" :class="`app-alert--${type}`">
      <svg class="app-alert__icon" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" />
        <path
          v-if="type === 'error'"
          d="M10 6v5M10 13.5v.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path
          v-else-if="type === 'success'"
          d="M6.5 10.5l2.3 2.3 4.8-5.3"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path
          v-else
          d="M10 9v5M10 6.5v.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
      {{ message }}
    </div>
  </Transition>
</template>

<style scoped>
.app-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1.45;
}

.app-alert--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
}

.app-alert--success {
  background: var(--success-soft);
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
}

.app-alert--info {
  background: var(--surface-muted);
  color: var(--base-text);
  border: 1px solid var(--border-strong);
}

.app-alert__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.app-alert-enter-active,
.app-alert-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.app-alert-enter-from,
.app-alert-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
