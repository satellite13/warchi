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
  gap: 8px;
  margin-top: -4px;
}

.tag-suggestion {
  border: 1px solid #dfe1e5;
  background: #f8f9fb;
  color: #4a4d52;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
}

.tag-suggestion:hover {
  border-color: #1a73e8;
  color: #1a73e8;
  background: rgba(26, 115, 232, 0.08);
}
</style>
