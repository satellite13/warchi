<script setup lang="ts">
defineProps<{
  suggestions: string[];
}>();

const emit = defineEmits<{
  select: [string];
}>();
</script>

<template>
  <div class="tag-suggestions">
    <button
      v-for="tag in suggestions"
      :key="tag"
      type="button"
      class="tag-suggestion"
      @click="emit('select', tag)"
    >
      {{ tag }}
    </button>
  </div>
</template>

<style scoped>
.tag-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: -6px;
}

.tag-suggestion {
  border: 1px solid var(--border);
  background: var(--surface-strong);
  color: var(--text-muted);
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.tag-suggestion:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}
</style>
