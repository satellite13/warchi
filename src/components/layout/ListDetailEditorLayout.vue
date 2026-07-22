<script setup lang="ts">
withDefaults(
  defineProps<{
    hasSelection?: boolean
    emptyIcon?: string
    emptyTitle?: string
    emptyHint?: string
  }>(),
  {
    hasSelection: false,
    emptyIcon: 'category',
    emptyTitle: '',
    emptyHint: '',
  },
)
</script>

<template>
  <div class="ldel">
    <slot name="sidebar" />

    <main class="ldel__main">
      <div v-if="!hasSelection" class="ldel__empty">
        <slot name="empty">
          <UiIcon :name="emptyIcon" class="ldel__empty-icon" />
          <p v-if="emptyTitle" class="ldel__empty-text">{{ emptyTitle }}</p>
          <p v-if="emptyHint" class="ldel__empty-hint">{{ emptyHint }}</p>
        </slot>
      </div>
      <div v-else class="ldel__content">
        <div class="ldel__center">
          <slot />
        </div>
        <slot name="aside" />
      </div>
    </main>

    <slot name="modals" />
    <slot name="toast" />
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.ldel {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--base-bg);
}

.ldel__main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 28px 36px;
}

.ldel__content {
  display: flex;
  gap: 28px;
  align-items: flex-start;
  animation: fadeIn 0.3s ease;
}

.ldel__center {
  flex: 1;
  min-width: 0;
}

.ldel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 320px;
  gap: 8px;
  color: var(--text-subtle);
  animation: fadeIn 0.4s ease;
}

.ldel__empty-icon {
  width: 56px;
  height: 56px;
  opacity: 0.35;
  margin-bottom: 4px;
}

.ldel__empty-text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-muted);
}

.ldel__empty-hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-subtle);
}
</style>
