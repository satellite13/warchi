<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <button class="create-card" type="button" @click="emit('click')">
    <div class="create-card__icon">
      <UiIcon name="add" />
    </div>
    <span class="create-card__title">{{ title }}</span>
    <span v-if="description" class="create-card__description">{{ description }}</span>
  </button>
</template>

<style scoped>
.create-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 260px;
  min-height: 200px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-muted);
  cursor: pointer;
  transition: border-color 0.25s ease, background 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
}

.create-card:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
  transform: translateY(-4px);
  box-shadow: var(--shadow-md), var(--shadow-glow);
}

.create-card__icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  background: var(--surface-strong);
  border-radius: 12px;
  transition: background 0.25s ease, transform 0.25s ease;
  color: var(--primary);
}

.create-card__icon .ui-icon {
  width: 28px;
  height: 28px;
}

.create-card:hover .create-card__icon {
  background: var(--primary);
  transform: scale(1.1);
  color: #fff;
}

.create-card__title {
  font-weight: 600;
  font-size: 15px;
  color: var(--base-text);
  text-align: center;
  letter-spacing: -0.01em;
}

.create-card__description {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}
</style>
