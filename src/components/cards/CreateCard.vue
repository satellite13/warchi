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
      <span class="material-symbols-outlined">add_2</span>
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
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius);
  background: linear-gradient(135deg, var(--surface-muted) 0%, var(--primary-soft) 100%);
  cursor: pointer;
  transition: border-color 0.25s ease, background 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
}

.create-card:hover {
  border-color: var(--primary);
  background: linear-gradient(135deg, var(--primary-soft) 0%, #dbe6ff 100%);
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}

.create-card__icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  background: var(--primary-soft);
  border-radius: 50%;
  transition: background 0.25s ease, transform 0.25s ease;
}

.create-card:hover .create-card__icon {
  background: var(--primary);
  transform: scale(1.1);
}

.create-card__icon svg {
  width: 28px;
  height: 28px;
  color: var(--primary);
  transition: color 0.25s ease;
}

.create-card:hover .create-card__icon svg {
  color: #fff;
}

.create-card__title {
  font-weight: 600;
  font-size: 16px;
  color: var(--base-text);
  text-align: center;
}

.create-card__description {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}
</style>
