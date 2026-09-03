<script setup lang="ts">
import type { ApiKey } from '@/types/apiKeys'

defineProps<{
  keys: ApiKey[]
  isLoading: boolean
  loadingText: string
  emptyText: string
  revokeLabel: string
  renameLabel?: string
  revokedLabel?: string
  formatSummary: (key: ApiKey) => string
  isRevokingId?: string | null
  showRename?: boolean
  showRevokedBadge?: boolean
}>()

const emit = defineEmits<{
  revoke: [id: string]
  rename: [key: ApiKey]
}>()
</script>

<template>
  <div class="api-key-list">
    <p v-if="isLoading" class="api-key-list__status">{{ loadingText }}</p>
    <p v-else-if="keys.length === 0" class="api-key-list__status">{{ emptyText }}</p>
    <ul v-else class="api-key-list__items">
      <li v-for="key in keys" :key="key.id" class="api-key-list__item">
        <div class="api-key-list__meta">
          <strong class="api-key-list__name">{{ key.name }}</strong>
          <span class="api-key-list__prefix">warchi_ak_{{ key.tokenPrefix }}…</span>
          <span class="api-key-list__summary">{{ formatSummary(key) }}</span>
          <span
            v-if="showRevokedBadge && key.revokedAt"
            class="api-key-list__badge"
          >
            {{ revokedLabel }}
          </span>
        </div>
        <div class="api-key-list__actions">
          <button
            v-if="showRename && !key.revokedAt"
            type="button"
            class="btn btn--secondary"
            @click="emit('rename', key)"
          >
            {{ renameLabel }}
          </button>
          <button
            v-if="!key.revokedAt"
            type="button"
            class="btn btn--danger"
            :class="{ 'btn--xs': showRevokedBadge }"
            :disabled="isRevokingId === key.id"
            @click="emit('revoke', key.id)"
          >
            {{ revokeLabel }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.api-key-list__status {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.api-key-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.api-key-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-muted);
}

.api-key-list__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  min-width: 0;
}

.api-key-list__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
}

.api-key-list__prefix {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-muted);
}

.api-key-list__summary {
  font-size: 12px;
  color: var(--text-subtle);
}

.api-key-list__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border-radius: 6px;
  background: var(--danger-soft);
  color: var(--danger);
}

.api-key-list__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>
