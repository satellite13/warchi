<script setup lang="ts">
withDefaults(
  defineProps<{
    loading?: boolean
    empty?: boolean
    loadingText?: string
    emptyText?: string
    stickyHeader?: boolean
  }>(),
  {
    loading: false,
    empty: false,
    loadingText: '',
    emptyText: '',
    stickyHeader: true,
  },
)
</script>

<template>
  <div class="admin-table-shell">
    <div v-if="$slots.toolbar" class="admin-table-shell__toolbar">
      <slot name="toolbar" />
    </div>

    <div v-if="loading" class="admin-table-shell__placeholder">
      <div class="admin-table-shell__spinner" />
      <span v-if="loadingText">{{ loadingText }}</span>
    </div>

    <div v-else-if="empty" class="admin-table-shell__placeholder">
      <slot name="emptyIcon">
        <svg class="admin-table-shell__empty-icon" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="16" stroke="currentColor" stroke-width="1.2" opacity="0.25" />
          <path
            d="M14 20h12M20 14v12"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            opacity="0.3"
          />
        </svg>
      </slot>
      <span v-if="emptyText">{{ emptyText }}</span>
    </div>

    <div v-else class="admin-table-shell__card">
      <table class="admin-table-shell__table" :class="{ 'admin-table-shell__table--sticky': stickyHeader }">
        <thead>
          <slot name="head" />
        </thead>
        <slot />
      </table>
    </div>
  </div>
</template>

<style scoped>
.admin-table-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

.admin-table-shell__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-table-shell__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 160px;
  padding: 28px 16px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  color: var(--text-muted);
  font-size: 13px;
  background: var(--surface);
}

.admin-table-shell__spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  border-top-color: var(--primary);
  animation: admin-table-spin 0.7s linear infinite;
}

.admin-table-shell__empty-icon {
  width: 40px;
  height: 40px;
  color: var(--text-subtle);
}

.admin-table-shell__card {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.admin-table-shell__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.admin-table-shell__table :deep(th) {
  text-align: left;
  padding: 12px 14px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
}

.admin-table-shell__table--sticky :deep(th) {
  position: sticky;
  top: 0;
  z-index: 1;
}

.admin-table-shell__table :deep(td) {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--base-text);
  vertical-align: middle;
}

.admin-table-shell__table :deep(tr:last-child td) {
  border-bottom: none;
}

.admin-table-shell__table :deep(tr:hover td) {
  background: var(--surface-muted);
}

@keyframes admin-table-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
