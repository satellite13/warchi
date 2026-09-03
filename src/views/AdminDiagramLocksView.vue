<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet, apiPost } from '@/composables/useApi'
import type { DiagramLockStatusResponse, DiagramResponse } from '@/types/api'
import type { ModelData, PaginatedResponse } from '@/types/entities'
import AppAlert from '@/components/ui/AppAlert.vue'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AdminTableShell from '@/components/admin/AdminTableShell.vue'
import { formatDate } from '@/utils/formatDate'
import { paginatedContent } from '@/utils/paginatedResponse'

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
  const res = await apiGet<PaginatedResponse<DiagramLockStatusResponse>>('/diagram-locks')
  loading.value = false
  if (res.success) {
    const items = paginatedContent(res.data)
    locks.value = items
    lastRefreshed.value = new Date()
    void resolvePaths(items.map((l) => l.diagramId))
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
    <AdminPageHeader
      :title="t('adminDiagramLocks.title')"
      :subtitle="t('adminDiagramLocks.subtitle')"
    >
      <template #toolbar>
        <div class="dl-live">
          <span class="dl-live__dot"></span>
          <span class="dl-live__text">live</span>
        </div>
        <div v-if="lockCount > 0" class="dl__count">{{ lockCount }}</div>
        <button
          type="button"
          class="btn btn--secondary btn--xs btn--toolbar"
          :disabled="loading"
          @click="loadLocks"
        >
          <UiIcon name="sync" :class="{ 'dl-refresh-spin': loading }" />
          {{ t('adminDiagramLocks.refresh') }}
        </button>
      </template>
    </AdminPageHeader>

    <AppAlert v-if="errorMessage" type="error" :message="errorMessage" />

    <AdminTableShell
      :loading="loading && locks.length === 0"
      :empty="locks.length === 0"
      :loading-text="t('adminDiagramLocks.loading')"
      :empty-text="t('adminDiagramLocks.empty')"
    >
      <template #emptyIcon>
        <svg class="dl-placeholder__icon" viewBox="0 0 48 48" fill="none">
          <rect
            x="8"
            y="20"
            width="32"
            height="22"
            rx="3"
            stroke="currentColor"
            stroke-width="1.5"
            opacity="0.25"
          />
          <path
            d="M14 20v-6a10 10 0 0120 0v6"
            stroke="currentColor"
            stroke-width="1.5"
            opacity="0.25"
          />
          <circle cx="24" cy="31" r="3" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
        </svg>
      </template>
      <template #head>
        <tr>
          <th>{{ t('adminDiagramLocks.diagram') }}</th>
          <th>{{ t('adminDiagramLocks.holder') }}</th>
          <th>{{ t('adminDiagramLocks.expires') }}</th>
          <th></th>
        </tr>
      </template>
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
    </AdminTableShell>
  </div>
</template>

<style scoped>
/* ─── Root ─────────────────────────────────────── */
.dl {
  display: flex;
  flex-direction: column;
  gap: 20px;
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
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

:deep(.dl-refresh-spin) {
  animation: dl-spin 0.7s linear infinite;
}

@keyframes dl-spin {
  to {
    transform: rotate(360deg);
  }
}

.dl-placeholder__icon {
  width: 48px;
  height: 48px;
  color: var(--text-subtle);
}

/* ─── Table ────────────────────────────────────── */
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
