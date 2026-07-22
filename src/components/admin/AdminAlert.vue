<script setup lang="ts">
defineProps<{
  type: 'error' | 'success'
  message: string
}>()
</script>

<template>
  <Transition name="admin-alert">
    <div v-if="message" class="admin-alert" :class="`admin-alert--${type}`">
      <svg class="admin-alert__icon" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" />
        <path
          v-if="type === 'error'"
          d="M10 6v5M10 13.5v.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path
          v-else
          d="M6.5 10.5l2.3 2.3 4.8-5.3"
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
.admin-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.45;
}

.admin-alert--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
}

.admin-alert--success {
  background: var(--success-soft, rgba(30, 163, 85, 0.12));
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
}

.admin-alert__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.admin-alert-enter-active,
.admin-alert-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.admin-alert-enter-from,
.admin-alert-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
