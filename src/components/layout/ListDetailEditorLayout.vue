<script setup lang="ts">
import EmptyState from '@/components/list/EmptyState.vue'

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
          <EmptyState
            variant="panel"
            :icon="emptyIcon"
            :title="emptyTitle"
            :description="emptyHint"
          />
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
  height: 100%;
  min-height: 320px;
}
</style>
