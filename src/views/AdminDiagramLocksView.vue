<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { apiGet, apiPost } from "@/composables/useApi"
import type { DiagramLockStatusResponse } from "@/types/api"
import { formatDate } from "@/utils/formatDate"

const { t } = useI18n()

const locks = ref<DiagramLockStatusResponse[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const releasingId = ref<string | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

async function loadLocks(): Promise<void> {
  loading.value = true
  errorMessage.value = null
  const res = await apiGet<DiagramLockStatusResponse[]>("/diagram-locks")
  loading.value = false
  if (res.success && Array.isArray(res.data)) {
    locks.value = res.data
  } else {
    locks.value = []
    if (!res.success) {
      errorMessage.value = res.error.message
    }
  }
}

async function forceRelease(diagramId: string): Promise<void> {
  if (!confirm(t("adminDiagramLocks.confirmForce"))) {
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
  <div class="admin-diagram-locks">
    <div class="title-bar">
      <div>
        <h1 class="title-bar__heading">{{ t("adminDiagramLocks.title") }}</h1>
        <p class="title-bar__sub">{{ t("adminDiagramLocks.subtitle") }}</p>
      </div>
      <button type="button" class="btn-refresh" :disabled="loading" @click="loadLocks">
        {{ loading ? t("adminDiagramLocks.loading") : t("adminDiagramLocks.refresh") }}
      </button>
    </div>

    <div v-if="errorMessage" class="message message--error">{{ errorMessage }}</div>

    <div v-if="loading && locks.length === 0" class="admin-diagram-locks__loading">
      {{ t("adminDiagramLocks.loading") }}
    </div>
    <div v-else-if="locks.length === 0" class="admin-diagram-locks__empty">
      {{ t("adminDiagramLocks.empty") }}
    </div>
    <table v-else class="locks-table">
      <thead>
        <tr>
          <th>{{ t("adminDiagramLocks.diagramId") }}</th>
          <th>{{ t("adminDiagramLocks.holder") }}</th>
          <th>{{ t("adminDiagramLocks.expires") }}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in locks" :key="row.diagramId">
          <td class="locks-table__mono">{{ row.diagramId }}</td>
          <td>{{ row.lockedByDisplay || row.lockedByUserId || "—" }}</td>
          <td>{{ row.expiresAt ? formatDate(row.expiresAt) : "—" }}</td>
          <td>
            <button
              type="button"
              class="btn-danger-outline"
              :disabled="releasingId === row.diagramId"
              @click="forceRelease(row.diagramId)"
            >
              {{ t("adminDiagramLocks.forceRelease") }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.admin-diagram-locks {
  max-width: 960px;
}

.title-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 1.25rem;
}

.title-bar__heading {
  margin: 0 0 6px;
  font-size: 1.35rem;
}

.title-bar__sub {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
}

.btn-refresh {
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-size: 13px;
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.message {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  margin-bottom: 1rem;
  font-size: 14px;
}

.message--error {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
}

.admin-diagram-locks__loading,
.admin-diagram-locks__empty {
  color: var(--text-muted);
  font-size: 14px;
  padding: 24px 0;
}

.locks-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.locks-table th,
.locks-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.locks-table th {
  color: var(--text-muted);
  font-weight: 600;
}

.locks-table__mono {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  word-break: break-all;
}

.btn-danger-outline {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--danger);
  background: transparent;
  color: var(--danger);
  cursor: pointer;
}

.btn-danger-outline:hover:not(:disabled) {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}

.btn-danger-outline:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
