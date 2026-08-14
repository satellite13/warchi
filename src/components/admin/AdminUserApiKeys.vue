<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiDelete, apiGet } from '@/composables/useApi'
import type { ApiKey } from '@/types/apiKeys'
import { formatApiKeySummary } from '@/utils/apiKeySummary'
import type { PaginatedResponse } from '@/types/entities'
import { paginatedContent } from '@/utils/paginatedResponse'

const props = defineProps<{
  userId: string
}>()

const { t } = useI18n()

const keys = ref<ApiKey[]>([])
const isLoading = ref(false)
const isRevokingId = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

const formatKeySummary = (key: ApiKey): string => formatApiKeySummary(key, t)

const loadKeys = async (): Promise<void> => {
  isLoading.value = true
  errorMessage.value = null
  const result = await apiGet<PaginatedResponse<ApiKey>>(
    `/admin/users/${props.userId}/api-keys`,
  )
  isLoading.value = false
  if (!result.success) {
    errorMessage.value = result.error.message
    keys.value = []
    return
  }
  keys.value = paginatedContent(result.data)
}

const revokeKey = async (keyId: string): Promise<void> => {
  if (!window.confirm(t('adminUsers.apiKeysRevokeConfirm'))) return
  isRevokingId.value = keyId
  errorMessage.value = null
  const result = await apiDelete<void>(`/admin/users/${props.userId}/api-keys/${keyId}`)
  isRevokingId.value = null
  if (!result.success) {
    errorMessage.value = result.error.message
    return
  }
  await loadKeys()
}

watch(
  () => props.userId,
  () => {
    void loadKeys()
  },
)

onMounted(() => {
  void loadKeys()
})
</script>

<template>
  <section class="au-keys">
    <header class="au-keys__header">
      <h3 class="au-keys__title">{{ t('adminUsers.apiKeysSection') }}</h3>
      <button
        type="button"
        class="au-btn-inline"
        :disabled="isLoading || isRevokingId !== null"
        @click="loadKeys"
      >
        {{ t('adminUsers.apiKeysRefresh') }}
      </button>
    </header>

    <p v-if="errorMessage" class="au-keys__error">{{ errorMessage }}</p>

    <p v-if="isLoading" class="au-keys__status">{{ t('adminUsers.apiKeysLoading') }}</p>
    <p v-else-if="keys.length === 0" class="au-keys__status">{{ t('adminUsers.apiKeysEmpty') }}</p>

    <ul v-else class="au-keys__list">
      <li v-for="key in keys" :key="key.id" class="au-keys__item">
        <div class="au-keys__meta">
          <strong class="au-keys__name">{{ key.name }}</strong>
          <span class="au-keys__prefix">warchi_ak_{{ key.tokenPrefix }}…</span>
          <span class="au-keys__summary">{{ formatKeySummary(key) }}</span>
          <span v-if="key.revokedAt" class="au-keys__badge">{{ t('adminUsers.apiKeysRevoked') }}</span>
        </div>
        <button
          v-if="!key.revokedAt"
          type="button"
          class="btn btn--danger btn--xs"
          :disabled="isRevokingId === key.id || isLoading"
          @click="revokeKey(key.id)"
        >
          {{ t('adminUsers.apiKeysRevoke') }}
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.au-keys {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}

.au-keys__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.au-keys__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--base-text);
  letter-spacing: -0.01em;
}

.au-btn-inline {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--primary);
  background: var(--primary-soft);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.au-btn-inline:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary) 18%, transparent);
}

.au-btn-inline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.au-keys__error {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--danger);
}

.au-keys__status {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.au-keys__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.au-keys__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-muted);
}

.au-keys__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  min-width: 0;
}

.au-keys__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
}

.au-keys__prefix {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-muted);
}

.au-keys__summary {
  font-size: 12px;
  color: var(--text-subtle);
}

.au-keys__badge {
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
</style>
