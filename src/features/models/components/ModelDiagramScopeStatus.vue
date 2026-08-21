<script setup lang="ts">
defineProps<{
  loading: boolean
  loadingText: string
  error?: string | null
  retryText: string
}>()

defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="diagram-scope-status" role="status" aria-live="polite">
    <UiIcon :name="error ? 'error' : 'sync'" :class="{ spin: loading && !error }" />
    <span>{{ error || loadingText }}</span>
    <button v-if="error" type="button" class="btn btn--sm" @click="$emit('retry')">
      {{ retryText }}
    </button>
  </div>
</template>

<style scoped>
.diagram-scope-status {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  color: var(--text-muted);
  background: var(--surface);
}
</style>
