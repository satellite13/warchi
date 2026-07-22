<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiDelete, apiGet } from '@/composables/useApi'
import AdminAlert from '@/components/admin/AdminAlert.vue'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTableShell from '@/components/admin/AdminTableShell.vue'
import type { ModelData, NotationData, PaginatedResponse } from '@/types/entities'
import { formatDate } from '@/utils/formatDate'
import { paginatedContent } from '@/utils/paginatedResponse'

const { t, locale } = useI18n()

const deletedModels = ref<ModelData[]>([])
const deletedNotations = ref<NotationData[]>([])
const loadingModels = ref(false)
const loadingNotations = ref(false)
const deletingId = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const PAGE_SIZE = 50

const totalDeleted = computed(() => deletedModels.value.length + deletedNotations.value.length)

const loadDeletedModels = async (): Promise<void> => {
  loadingModels.value = true
  const result = await apiGet<PaginatedResponse<ModelData>>(
    `/models/deleted?page=0&size=${PAGE_SIZE}&sort=updatedAt,desc`,
  )
  loadingModels.value = false
  deletedModels.value = result.success ? paginatedContent(result.data) : []
}

const loadDeletedNotations = async (): Promise<void> => {
  loadingNotations.value = true
  const result = await apiGet<PaginatedResponse<NotationData>>(
    `/notations/deleted?page=0&size=${PAGE_SIZE}&sort=updatedAt,desc`,
  )
  loadingNotations.value = false
  deletedNotations.value = result.success ? paginatedContent(result.data) : []
}

const loadAll = (): void => {
  errorMessage.value = null
  successMessage.value = null
  loadDeletedModels()
  loadDeletedNotations()
}

const deleteModelPermanently = async (id: string): Promise<void> => {
  if (!confirm(t('adminDeleted.confirmPermanently'))) return
  deletingId.value = id
  errorMessage.value = null
  const result = await apiDelete<void>(`/models/${id}/permanent`)
  deletingId.value = null
  if (result.success) {
    deletedModels.value = deletedModels.value.filter(m => m.id !== id)
    successMessage.value = t('adminDeleted.deletedSuccess')
  } else {
    errorMessage.value = result.error.message
  }
}

const deleteNotationPermanently = async (id: string): Promise<void> => {
  if (!confirm(t('adminDeleted.confirmPermanently'))) return
  deletingId.value = id
  errorMessage.value = null
  const result = await apiDelete<void>(`/notations/${id}/permanent`)
  deletingId.value = null
  if (result.success) {
    deletedNotations.value = deletedNotations.value.filter(n => n.id !== id)
    successMessage.value = t('adminDeleted.deletedSuccess')
  } else if (result.error.status === 409) {
    errorMessage.value = t('adminDeleted.deleteConflictActiveModels')
  } else {
    errorMessage.value = result.error.message
  }
}

onMounted(() => {
  loadAll()
})
</script>

<template>
  <div class="ad">
    <AdminPageHeader :title="t('adminDeleted.title')" :subtitle="t('adminDeleted.subtitle')">
      <template v-if="totalDeleted > 0" #badge>
        <div class="ad__counter">{{ totalDeleted }}</div>
      </template>
    </AdminPageHeader>

    <AdminAlert v-if="errorMessage" type="error" :message="errorMessage" />
    <AdminAlert v-if="successMessage" type="success" :message="successMessage" />

    <section class="ad-section">
      <div class="ad-section__head">
        <svg class="ad-section__icon" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.4" />
          <path d="M2 7h16" stroke="currentColor" stroke-width="1.4" />
          <path d="M7 7v10" stroke="currentColor" stroke-width="1.4" />
        </svg>
        <h2 class="ad-section__title">{{ t('adminDeleted.deletedModels') }}</h2>
        <span v-if="deletedModels.length > 0" class="ad-section__count">
          {{ deletedModels.length }}
        </span>
      </div>

      <AdminTableShell
        :loading="loadingModels"
        :empty="deletedModels.length === 0"
        :loading-text="t('adminDeleted.loading')"
        :empty-text="t('adminDeleted.emptyModels')"
      >
        <template #head>
          <tr>
            <th>{{ t('adminDeleted.name') }}</th>
            <th>{{ t('adminDeleted.version') }}</th>
            <th>{{ t('adminDeleted.updated') }}</th>
            <th></th>
          </tr>
        </template>
        <TransitionGroup tag="tbody" name="ad-row">
          <tr
            v-for="m in deletedModels"
            :key="m.id"
            class="ad-table__row"
            :class="{ 'ad-table__row--busy': deletingId === m.id }"
          >
            <td class="ad-table__name">{{ m.name }}</td>
            <td>
              <span class="ad-version">{{ m.version }}</span>
            </td>
            <td class="ad-table__date">{{ formatDate(m.updatedAt, locale, false) }}</td>
            <td class="ad-table__action">
              <button
                type="button"
                class="ad-btn-delete"
                :disabled="deletingId === m.id"
                @click="deleteModelPermanently(m.id)"
              >
                <svg viewBox="0 0 16 16" fill="none" class="ad-btn-delete__icon">
                  <path
                    d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4"
                    stroke="currentColor"
                    stroke-width="1.3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                {{ t('adminDeleted.deletePermanently') }}
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </AdminTableShell>
    </section>

    <section class="ad-section">
      <div class="ad-section__head">
        <svg class="ad-section__icon" viewBox="0 0 20 20" fill="none">
          <path
            d="M4 4a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
            stroke="currentColor"
            stroke-width="1.4"
          />
          <path d="M11 2v5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
        <h2 class="ad-section__title">{{ t('adminDeleted.deletedNotations') }}</h2>
        <span v-if="deletedNotations.length > 0" class="ad-section__count">
          {{ deletedNotations.length }}
        </span>
      </div>

      <AdminTableShell
        :loading="loadingNotations"
        :empty="deletedNotations.length === 0"
        :loading-text="t('adminDeleted.loading')"
        :empty-text="t('adminDeleted.emptyNotations')"
      >
        <template #head>
          <tr>
            <th>{{ t('adminDeleted.name') }}</th>
            <th>{{ t('adminDeleted.version') }}</th>
            <th>{{ t('adminDeleted.updated') }}</th>
            <th></th>
          </tr>
        </template>
        <TransitionGroup tag="tbody" name="ad-row">
          <tr
            v-for="n in deletedNotations"
            :key="n.id"
            class="ad-table__row"
            :class="{ 'ad-table__row--busy': deletingId === n.id }"
          >
            <td class="ad-table__name">{{ n.name }}</td>
            <td>
              <span class="ad-version">{{ n.version }}</span>
            </td>
            <td class="ad-table__date">{{ formatDate(n.updatedAt, locale, false) }}</td>
            <td class="ad-table__action">
              <button
                type="button"
                class="ad-btn-delete"
                :disabled="deletingId === n.id"
                @click="deleteNotationPermanently(n.id)"
              >
                <svg viewBox="0 0 16 16" fill="none" class="ad-btn-delete__icon">
                  <path
                    d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4"
                    stroke="currentColor"
                    stroke-width="1.3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                {{ t('adminDeleted.deletePermanently') }}
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </AdminTableShell>
    </section>
  </div>
</template>

<style scoped>
.ad {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.ad__counter {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.ad-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.ad-section__icon {
  width: 18px;
  height: 18px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.ad-section__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.01em;
}

.ad-section__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 11px;
  background: var(--surface-strong);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.ad-table__row--busy {
  opacity: 0.45;
  pointer-events: none;
}

.ad-table__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
}

.ad-table__date {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ad-table__action {
  text-align: right;
  white-space: nowrap;
}

.ad-version {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  background: var(--surface-strong);
  border-radius: 5px;
  letter-spacing: 0.02em;
}

.ad-btn-delete {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--danger);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
  border-radius: 7px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.ad-btn-delete__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.ad-btn-delete:hover:not(:disabled) {
  background: var(--danger-soft);
  border-color: color-mix(in srgb, var(--danger) 45%, transparent);
}

.ad-btn-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ad-row-enter-active {
  transition: all 0.25s ease;
}

.ad-row-leave-active {
  transition: all 0.2s ease;
}

.ad-row-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.ad-row-leave-to {
  opacity: 0;
}
</style>
