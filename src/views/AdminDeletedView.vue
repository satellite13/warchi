<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiDelete, apiGet } from '@/composables/useApi'
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
    deletedModels.value = deletedModels.value.filter((m) => m.id !== id)
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
    deletedNotations.value = deletedNotations.value.filter((n) => n.id !== id)
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
    <!-- Header -->
    <div class="ad__header">
      <div class="ad__titles">
        <h1 class="ad__heading">{{ t('adminDeleted.title') }}</h1>
        <p class="ad__sub">{{ t('adminDeleted.subtitle') }}</p>
      </div>
      <div v-if="totalDeleted > 0" class="ad__counter">
        {{ totalDeleted }}
      </div>
    </div>

    <!-- Alerts -->
    <Transition name="ad-msg">
      <div v-if="errorMessage" class="ad-msg ad-msg--error">
        <svg class="ad-msg__icon" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M10 6v5M10 13.5v.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
        {{ errorMessage }}
      </div>
    </Transition>
    <Transition name="ad-msg">
      <div v-if="successMessage" class="ad-msg ad-msg--success">
        <svg class="ad-msg__icon" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M6.5 10.5l2.3 2.3 4.8-5.3"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
        {{ successMessage }}
      </div>
    </Transition>

    <!-- Models section -->
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

      <!-- Loading -->
      <div v-if="loadingModels" class="ad-placeholder">
        <div class="ad-spinner"></div>
        <span>{{ t('adminDeleted.loading') }}</span>
      </div>

      <!-- Empty -->
      <div v-else-if="deletedModels.length === 0" class="ad-placeholder">
        <svg class="ad-placeholder__icon" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="16" stroke="currentColor" stroke-width="1.2" opacity="0.25" />
          <path d="M14 20h12M20 14v12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.3" />
        </svg>
        <span>{{ t('adminDeleted.emptyModels') }}</span>
      </div>

      <!-- Table -->
      <div v-else class="ad-card">
        <table class="ad-table">
          <thead>
            <tr>
              <th>{{ t('adminDeleted.name') }}</th>
              <th>{{ t('adminDeleted.version') }}</th>
              <th>{{ t('adminDeleted.updated') }}</th>
              <th></th>
            </tr>
          </thead>
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
        </table>
      </div>
    </section>

    <!-- Notations section -->
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

      <!-- Loading -->
      <div v-if="loadingNotations" class="ad-placeholder">
        <div class="ad-spinner"></div>
        <span>{{ t('adminDeleted.loading') }}</span>
      </div>

      <!-- Empty -->
      <div v-else-if="deletedNotations.length === 0" class="ad-placeholder">
        <svg class="ad-placeholder__icon" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="16" stroke="currentColor" stroke-width="1.2" opacity="0.25" />
          <path d="M14 20h12M20 14v12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.3" />
        </svg>
        <span>{{ t('adminDeleted.emptyNotations') }}</span>
      </div>

      <!-- Table -->
      <div v-else class="ad-card">
        <table class="ad-table">
          <thead>
            <tr>
              <th>{{ t('adminDeleted.name') }}</th>
              <th>{{ t('adminDeleted.version') }}</th>
              <th>{{ t('adminDeleted.updated') }}</th>
              <th></th>
            </tr>
          </thead>
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
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ─── Root ─────────────────────────────────────── */
.ad {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ─── Header ───────────────────────────────────── */
.ad__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.ad__heading {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--base-text);
  letter-spacing: -0.03em;
}

.ad__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-muted);
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

/* ─── Alerts ───────────────────────────────────── */
.ad-msg {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
}

.ad-msg--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 16%, transparent);
}

.ad-msg--success {
  background: var(--success-soft);
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
}

.ad-msg__icon {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}

.ad-msg-enter-active,
.ad-msg-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.ad-msg-enter-from,
.ad-msg-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ─── Section ──────────────────────────────────── */
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

/* ─── Card ─────────────────────────────────────── */
.ad-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: auto;
}

/* ─── Table ────────────────────────────────────── */
.ad-table {
  width: 100%;
  border-collapse: collapse;
}

.ad-table thead th {
  padding: 12px 18px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
}

.ad-table tbody td {
  padding: 11px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  vertical-align: middle;
}

.ad-table tbody tr:last-child td {
  border-bottom: none;
}

.ad-table__row {
  transition: background 0.15s;
}

.ad-table__row:hover {
  background: var(--surface-muted);
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

/* ─── Version badge ────────────────────────────── */
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

/* ─── Delete button ────────────────────────────── */
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
  transition: background 0.15s, border-color 0.15s;
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

/* ─── Placeholder (loading / empty) ────────────── */
.ad-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 20px;
  color: var(--text-subtle);
  font-size: 13px;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 14px;
}

.ad-placeholder__icon {
  width: 36px;
  height: 36px;
  color: var(--text-subtle);
}

.ad-spinner {
  width: 20px;
  height: 20px;
  border: 2.5px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: ad-spin 0.7s linear infinite;
}

@keyframes ad-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ─── Row transitions ──────────────────────────── */
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
