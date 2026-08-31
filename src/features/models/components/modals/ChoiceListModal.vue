<script setup lang="ts">
import BaseModal from '@/components/modals/BaseModal.vue'

defineProps<{
  title: string
  options: Array<{ id: string; name: string }>
  maxWidth?: string
}>()

const emit = defineEmits<{
  close: []
  select: [id: string]
}>()
</script>

<template>
  <BaseModal :title="title" :max-width="maxWidth || '420px'" @close="emit('close')">
    <div class="choice-list">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="choice-item"
        @click="emit('select', option.id)"
      >
        {{ option.name }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.choice-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.choice-item {
  width: 100%;
  text-align: left;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--base-text);
  cursor: pointer;
  font: inherit;
}

.choice-item:hover {
  background: var(--surface-strong);
  border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
}
</style>
