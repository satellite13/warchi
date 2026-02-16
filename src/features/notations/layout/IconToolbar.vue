<script setup lang="ts">
export interface ToolbarButton {
  icon: string;
  event: string;
  title?: string;
  disabled?: boolean;
  badge?: boolean;
  active?: boolean;
  separator?: boolean;
}

defineProps<{
  buttons: ToolbarButton[];
}>();

const emit = defineEmits<{
  action: [event: string];
}>();
</script>

<template>
  <div class="icon-toolbar">
    <template v-for="btn in buttons" :key="btn.event">
      <div v-if="btn.separator" class="icon-toolbar__sep" />
      <button
        v-else
        type="button"
        class="icon-toolbar__btn"
        :class="{ 'icon-toolbar__btn--active': btn.active }"
        :title="btn.title"
        :disabled="btn.disabled"
        @click="emit('action', btn.event)"
      >
        <span class="material-symbols-outlined">{{ btn.icon }}</span>
        <span v-if="btn.badge" class="icon-toolbar__badge" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.icon-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--surface-strong);
  border-radius: var(--radius-sm);
}

.icon-toolbar__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.icon-toolbar__badge {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  pointer-events: none;
}

.icon-toolbar__btn .material-symbols-outlined {
  font-size: 20px;
  line-height: 1;
}

.icon-toolbar__btn:hover:not(:disabled) {
  background: var(--surface);
  color: var(--base-text);
  box-shadow: var(--shadow-sm);
}

.icon-toolbar__btn:active:not(:disabled) {
  background: var(--primary-soft);
  color: var(--primary);
}

.icon-toolbar__btn--active {
  background: var(--primary-soft);
  color: var(--primary);
}

.icon-toolbar__btn:disabled {
  color: var(--text-subtle);
  cursor: not-allowed;
  opacity: 0.5;
}

.icon-toolbar__sep {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 2px;
  flex-shrink: 0;
}
</style>
