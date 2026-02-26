<script setup lang="ts">
export type TabDef = { id: string; label: string; icon?: string };

defineProps<{
  tabs: TabDef[];
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();
</script>

<template>
  <div class="tab-panel">
    <div class="tab-panel__header">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="tab-panel__tab"
        :class="{ 'tab-panel__tab--active': modelValue === tab.id }"
        @click="emit('update:modelValue', tab.id)"
      >
        <span v-if="tab.icon" class="material-symbols-outlined tab-panel__tab-icon">{{ tab.icon }}</span>
        <span class="tab-panel__tab-label">{{ tab.label }}</span>
      </button>
    </div>
    <div class="tab-panel__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.tab-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.tab-panel__header {
  display: flex;
  align-items: stretch;
  height: 36px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface-panel);
  gap: 0;
}

.tab-panel__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1;
  padding: 0 12px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  white-space: nowrap;
}

.tab-panel__tab:hover {
  color: var(--base-text);
  background: var(--surface-strong);
}

.tab-panel__tab--active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.tab-panel__tab--active:hover {
  color: var(--primary);
  background: transparent;
}

.tab-panel__tab-icon {
  font-size: 16px;
}

.tab-panel__tab-label {
  line-height: 1;
}

.tab-panel__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
