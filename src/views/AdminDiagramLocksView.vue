<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet, apiPost } from '@/composables/useApi'
import type { DiagramLockStatusResponse, DiagramResponse } from '@/types/api'
import type { ModelData } from '@/types/entities'
import { formatDate } from '@/utils/formatDate'

const { t, locale } = useI18n()

const locks = ref<DiagramLockStatusResponse[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const releasingId = ref<string | null>(null)
const lastRefreshed = ref<Date | null>(null)

/** diagramId → { modelName, diagramName } */
const pathCache = reactive<Record<string, { modelName: string; diagramName: string }>>({})
/** modelId → name (avoid duplicate fetches) */
const modelNameCache: Record<string, string> = {}

const lockCount = computed(() => locks.value.length)

function diagramPath(diagramId: string): string | null {
  const entry = pathCache[diagramId]
  if (!entry) return null
  return `${entry.modelName} / ${entry.diagramName}`
}

async function resolveModelName(modelId: string): Promise<string> {
  if (modelNameCache[modelId]) return modelNameCache[modelId]
  const res = await apiGet<ModelData>(`/models/${modelId}`)
  const name = res.success ? res.data.name : modelId
  modelNameCache[modelId] = name
  return name
}

async function resolvePaths(diagramIds: string[]): Promise<void> {
  const toResolve = diagramIds.filter((id) => !pathCache[id])
  if (toResolve.length === 0) return

  await Promise.all(
    toResolve.map(async (diagramId) => {
      const res = await apiGet<DiagramResponse>(`/diagrams/${diagramId}`)
      if (!res.success) {
        pathCache[diagramId] = { modelName: '?', diagramName: diagramId }
        return
      }
      const diagram = res.data
      const modelName = await resolveModelName(diagram.modelId)
      pathCache[diagramId] = { modelName, diagramName: diagram.name }
    }),
  )
}

let pollTimer: ReturnType<typeof setInterval> | null = null

async function loadLocks(): Promise<void> {
  loading.value = true
  errorMessage.value = null
  const res = await apiGet<DiagramLockStatusResponse[]>('/diagram-locks')
  loading.value = false
  if (res.success && Array.isArray(res.data)) {
    locks.value = res.data
    lastRefreshed.value = new Date()
    void resolvePaths(res.data.map((l) => l.diagramId))
  } else {
    locks.value = []
    if (!res.success) {
      errorMessage.value = res.error.message
    }
  }
}

async function forceRelease(diagramId: string): Promise<void> {
  if (!confirm(t('adminDiagramLocks.confirmForce'))) {
    return
  }
  releasingId.value = diagramId
  const res = await apiPost(`/diagram-locks/${diagramId}/force-release`, {})
  releasingId.value = null
  if (res.success) {
    await loadLocks()
  } else {
    errorMessage.value = res.error.message
  }
}

onMounted(() => {
  void loadLocks()
  pollTimer = setInterval(() => {
    void loadLocks()
  }, 10_000)
})

onBeforeUnmount(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="dl">
    <!-- Header -->
    <div class="dl__header">
      <div class="dl__titles">
        <h1 class="dl__heading">{{ t('adminDiagramLocks.title') }}</h1>
        <p class="dl__sub">{{ t('adminDiagramLocks.subtitle') }}</p>
      </div>

      <div class="dl__toolbar">
        <!-- Live indicator -->
        <div class="dl-live">
          <span class="dl-live__dot"></span>
          <span class="dl-live__text">live</span>
        </div>

        <!-- Lock count -->
        <div
          v-if="lockCount > 0"
          class="dl__count"
        >
          {{ lockCount }}
        </div>

        <!-- Refresh -->
        <button
          type="button"
          class="dl-refresh"
          :disabled="loading"
          @click="loadLocks"
        >
          <svg
            class="dl-refresh__icon"
            :class="{ 'dl-refresh__icon--spin': loading }"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M13.5 2.5v4h-4"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M12.3 10a5 5 0 11-1-6.3L13.5 6.5"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ t('adminDiagramLocks.refresh') }}
        </button>
      </div>
    </div>

    <!-- Error -->
    <Transition name="dl-msg">
      <div v-if="errorMessage" class="dl-msg dl-msg--error">
        <svg class="dl-msg__icon" viewBox="0 0 20 20" fill="none">
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

    <!-- Loading (initial) -->
    <div v-if="loading && locks.length === 0" class="dl-placeholder">
      <div class="dl-spinner"></div>
      <span>{{ t('adminDiagramLocks.loading') }}</span>
    </div>

    <!-- Empty -->
    <div v-else-if="locks.length === 0" class="dl-placeholder">
      <svg class="dl-placeholder__icon" viewBox="0 0 48 48" fill="none">
        <rect x="8" y="20" width="32" height="22" rx="3" stroke="currentColor" stroke-width="1.5" opacity="0.25" />
        <path d="M14 20v-6a10 10 0 0120 0v6" stroke="currentColor" stroke-width="1.5" opacity="0.25" />
        <circle cx="24" cy="31" r="3" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
      </svg>
      <span>{{ t('adminDiagramLocks.empty') }}</span>
    </div>

    <!-- Table -->
    <div v-else class="dl-card">
      <table class="dl-table">
        <thead>
          <tr>
            <th>{{ t('adminDiagramLocks.diagram') }}</th>
            <th>{{ t('adminDiagramLocks.holder') }}</th>
            <th>{{ t('adminDiagramLocks.expires') }}</th>
            <th></th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="dl-row">
          <tr
            v-for="row in locks"
            :key="row.diagramId"
            class="dl-table__row"
            :class="{ 'dl-table__row--busy': releasingId === row.diagramId }"
          >
            <td>
              <div class="dl-diagram-path">
                <span v-if="diagramPath(row.diagramId)" class="dl-diagram-path__text">
                  {{ diagramPath(row.diagramId) }}
                </span>
                <code class="dl-mono" :class="{ 'dl-mono--secondary': diagramPath(row.diagramId) }">
                  {{ row.diagramId }}
                </code>
              </div>
            </td>
            <td class="dl-table__holder">
              {{ row.lockedByDisplay || row.lockedByUserId || '—' }}
            </td>
            <td class="dl-table__date">
              {{ row.expiresAt ? formatDate(row.expiresAt, locale, false) : '—' }}
            </td>
            <td class="dl-table__action">
              <button
                type="button"
                class="dl-btn-release"
                :disabled="releasingId === row.diagramId"
                @click="forceRelease(row.diagramId)"
              >
                <svg viewBox="0 0 16 16" fill="none" class="dl-btn-release__icon">
                  <path
                    d="M4.5 7V5.5a3.5 3.5 0 017 0M3 8h10v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"
                    stroke="currentColor"
                    stroke-width="1.3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                {{ t('adminDiagramLocks.forceRelease') }}
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* ─── Root ─────────────────────────────────────── */
.dl {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 960px;
}

/* ─── Header ───────────────────────────────────── */
.dl__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.dl__heading {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--base-text);
  letter-spacing: -0.03em;
}

.dl__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.dl__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ─── Live indicator ───────────────────────────── */
.dl-live {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--success-soft);
}

.dl-live__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  animation: dl-pulse 2s ease-in-out infinite;
}

@keyframes dl-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.dl-live__text {
  font-size: 11px;
  font-weight: 600;
  color: var(--success);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ─── Lock count ───────────────────────────────── */
.dl__count {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ─── Refresh button ───────────────────────────── */
.dl-refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
}

.dl-refresh:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--base-text);
  box-shadow: var(--shadow-sm);
}

.dl-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dl-refresh__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition: transform 0.3s ease;
}

.dl-refresh__icon--spin {
  animation: dl-spin 0.7s linear infinite;
}

@keyframes dl-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ─── Error message ────────────────────────────── */
.dl-msg {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
}

.dl-msg--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 16%, transparent);
}

.dl-msg__icon {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}

.dl-msg-enter-active,
.dl-msg-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.dl-msg-enter-from,
.dl-msg-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ─── Placeholder ──────────────────────────────── */
.dl-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 20px;
  color: var(--text-subtle);
  font-size: 13px;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 14px;
}

.dl-placeholder__icon {
  width: 48px;
  height: 48px;
  color: var(--text-subtle);
}

.dl-spinner {
  width: 20px;
  height: 20px;
  border: 2.5px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: dl-spin 0.7s linear infinite;
}

/* ─── Card ─────────────────────────────────────── */
.dl-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: auto;
}

/* ─── Table ────────────────────────────────────── */
.dl-table {
  width: 100%;
  border-collapse: collapse;
}

.dl-table thead th {
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

.dl-table tbody td {
  padding: 12px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  vertical-align: middle;
}

.dl-table tbody tr:last-child td {
  border-bottom: none;
}

.dl-table__row {
  transition: background 0.15s;
}

.dl-table__row:hover {
  background: var(--surface-muted);
}

.dl-table__row--busy {
  opacity: 0.45;
  pointer-events: none;
}

.dl-table__holder {
  font-size: 13px;
  color: var(--base-text);
}

.dl-table__date {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dl-table__action {
  text-align: right;
  white-space: nowrap;
}

/* ─── Diagram path ─────────────────────────────── */
.dl-diagram-path {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dl-diagram-path__text {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
}

/* ─── Mono code ────────────────────────────────── */
.dl-mono {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-size: 11px;
  padding: 3px 8px;
  background: var(--surface-strong);
  border-radius: 5px;
  color: var(--text-muted);
  word-break: break-all;
}

.dl-mono--secondary {
  font-size: 10px;
  padding: 1px 6px;
  color: var(--text-subtle);
  background: transparent;
}

/* ─── Release button ───────────────────────────── */
.dl-btn-release {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--warning);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.dl-btn-release__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.dl-btn-release:hover:not(:disabled) {
  background: var(--warning-soft);
  border-color: color-mix(in srgb, var(--warning) 50%, transparent);
}

.dl-btn-release:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ─── Row transitions ──────────────────────────── */
.dl-row-enter-active {
  transition: all 0.25s ease;
}

.dl-row-leave-active {
  transition: all 0.2s ease;
}

.dl-row-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.dl-row-leave-to {
  opacity: 0;
}
</style>
