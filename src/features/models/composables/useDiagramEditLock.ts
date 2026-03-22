import { onBeforeUnmount, ref, watch, type Ref } from "vue"
import { buildApiUrl } from "@/api/config"
import { getAccessToken } from "@/composables/authStorage"
import { apiGet, apiPost } from "@/composables/useApi"
import type { DiagramLockStatusResponse } from "@/types/api"

const HEARTBEAT_MS = 60_000
const POLL_MS = 12_000
const LOCKS_LIST_MS = 15_000

const LOCKED_BY_OTHER = "LOCKED_BY_OTHER"

/** Сравнение ISO-времён диаграммы: сервер новее локального снимка (для кнопки «Загрузить с сервера»). */
export function isDiagramServerNewerThanLocal(
  remoteIso: string | null,
  localIso: string | null | undefined
): boolean {
  if (!remoteIso || !localIso) return false
  const r = Date.parse(remoteIso)
  const l = Date.parse(localIso)
  if (Number.isNaN(r) || Number.isNaN(l)) return false
  return r > l
}

function isLockStatusPayload(value: unknown): value is DiagramLockStatusResponse {
  if (value === null || typeof value !== "object") return false
  const o = value as Record<string, unknown>
  return typeof o.diagramId === "string" && typeof o.isLocked === "boolean"
}

/**
 * Эксклюзивная блокировка редактирования строки диаграммы (см. arepos diagram-locks API).
 */
export function useDiagramEditLock(options: {
  modelId: Ref<string | null | undefined>
  selectedDiagramId: Ref<string | null>
  /** true, если открыта последняя версия диаграммы с данным именем (можно редактировать контент) */
  isActiveDiagramLatest: Ref<boolean>
  /** Можно ли вообще редактировать модель (OWNER / EDIT / ADMIN) */
  canEditModel: Ref<boolean>
  /**
   * Диаграмма уже есть на сервере (не локальный черновик с temp id).
   * Иначе acquire вернёт 404 — блокировка по несуществующему diagram id не имеет смысла.
   */
  isSelectedDiagramPersistedOnServer: Ref<boolean>
}) {
  const locksList = ref<DiagramLockStatusResponse[]>([])
  /** Чужой lock на текущей выбранной диаграмме — блокируем редактирование canvas */
  const isBlockedByOther = ref(false)
  const lockHolderDisplay = ref<string | null>(null)
  /** diagramUpdatedAt с сервера: acquire при LOCKED_BY_OTHER и актуализация из GET /diagram-locks */
  const remoteDiagramUpdatedAt = ref<string | null>(null)
  const serverNewerWhileBlocked = ref(false)

  let heldDiagramId: string | null = null
  let lockOpSeq = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let locksListTimer: ReturnType<typeof setInterval> | null = null

  const clearHeartbeat = (): void => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  const clearPoll = (): void => {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const clearLocksListTimer = (): void => {
    if (locksListTimer !== null) {
      clearInterval(locksListTimer)
      locksListTimer = null
    }
  }

  const startHeartbeat = (diagramId: string): void => {
    clearHeartbeat()
    heartbeatTimer = setInterval(() => {
      void apiPost<DiagramLockStatusResponse>(`/diagram-locks/${diagramId}/heartbeat`, {})
    }, HEARTBEAT_MS)
  }

  async function releaseHeld(): Promise<void> {
    const id = heldDiagramId
    if (!id) return
    heldDiagramId = null
    clearHeartbeat()
    await apiPost(`/diagram-locks/${id}/release`, {})
  }

  async function fetchLocksList(): Promise<void> {
    const mid = options.modelId.value
    if (!mid) {
      locksList.value = []
      return
    }
    const res = await apiGet<DiagramLockStatusResponse[]>(
      `/diagram-locks?modelId=${encodeURIComponent(mid)}`
    )
    if (res.success && Array.isArray(res.data)) {
      locksList.value = res.data
      syncRemoteUpdatedAtFromLocksList()
    }
  }

  /** Подтягивает свежий diagramUpdatedAt с сервера при поллинге списка locks (после сохранения держателем lock). */
  function syncRemoteUpdatedAtFromLocksList(): void {
    if (!isBlockedByOther.value) return
    const diagramId = options.selectedDiagramId.value
    if (!diagramId) return
    const entry = locksList.value.find((l) => l.diagramId === diagramId)
    const at = entry?.diagramUpdatedAt
    if (at) {
      remoteDiagramUpdatedAt.value = at
    }
  }

  function evaluateServerNewer(localUpdatedAt: string | null | undefined): void {
    serverNewerWhileBlocked.value = isDiagramServerNewerThanLocal(
      remoteDiagramUpdatedAt.value,
      localUpdatedAt
    )
  }

  async function applyLockForSelection(): Promise<void> {
    const seq = ++lockOpSeq
    await releaseHeld()
    clearPoll()
    isBlockedByOther.value = false
    lockHolderDisplay.value = null
    remoteDiagramUpdatedAt.value = null
    serverNewerWhileBlocked.value = false

    const diagramId = options.selectedDiagramId.value
    const canEdit = options.canEditModel.value
    const latest = options.isActiveDiagramLatest.value
    const persisted = options.isSelectedDiagramPersistedOnServer.value

    if (!diagramId || !canEdit || !latest || !persisted) {
      if (seq !== lockOpSeq) return
      // После releaseHeld() сервер уже без lock — без refresh дерево показывало бы старый locksList до LOCKS_LIST_MS
      void fetchLocksList()
      return
    }

    const res = await apiPost<DiagramLockStatusResponse>(`/diagram-locks/${diagramId}/acquire`, {})
    if (seq !== lockOpSeq) return

    if (res.success && res.data) {
      const d = res.data
      if (d.reason === LOCKED_BY_OTHER) {
        isBlockedByOther.value = true
        lockHolderDisplay.value = d.lockedByDisplay ?? null
        remoteDiagramUpdatedAt.value = d.diagramUpdatedAt ?? null
        void pollWhileBlocked(diagramId)
        pollTimer = setInterval(() => {
          void pollWhileBlocked(diagramId)
        }, POLL_MS)
        void fetchLocksList()
        return
      }
      heldDiagramId = diagramId
      startHeartbeat(diagramId)
      void fetchLocksList()
      return
    }

    // Совместимость: старый бэкенд мог отдавать 409 + тело в error.details
    if (!res.success && res.error.status === 409 && isLockStatusPayload(res.error.details)) {
      const d = res.error.details
      if (d.reason === LOCKED_BY_OTHER) {
        isBlockedByOther.value = true
        lockHolderDisplay.value = d.lockedByDisplay ?? null
        remoteDiagramUpdatedAt.value = d.diagramUpdatedAt ?? null
        void pollWhileBlocked(diagramId)
        pollTimer = setInterval(() => {
          void pollWhileBlocked(diagramId)
        }, POLL_MS)
      }
    }
    void fetchLocksList()
  }

  async function pollWhileBlocked(diagramId: string): Promise<void> {
    await fetchLocksList()
    const entry = locksList.value.find((l) => l.diagramId === diagramId)
    if (!entry || !entry.isLocked) {
      clearPoll()
      await applyLockForSelection()
    }
  }

  async function reloadAfterRemoteChange(loadModel: () => Promise<void>): Promise<void> {
    await loadModel()
    serverNewerWhileBlocked.value = false
    await applyLockForSelection()
  }

  watch(
    () =>
      [
        options.selectedDiagramId.value,
        options.isActiveDiagramLatest.value,
        options.canEditModel.value,
        options.isSelectedDiagramPersistedOnServer.value,
      ] as const,
    () => {
      void applyLockForSelection()
    }
  )

  watch(
    () => options.modelId.value,
    (mid) => {
      void fetchLocksList()
      clearLocksListTimer()
      if (!mid) {
        return
      }
      locksListTimer = setInterval(() => {
        void fetchLocksList()
      }, LOCKS_LIST_MS)
    },
    { immediate: true }
  )

  const onBeforeWindowUnload = (): void => {
    const id = heldDiagramId
    if (!id) return
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    const token = getAccessToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    void fetch(buildApiUrl(`/diagram-locks/${id}/release`), {
      method: "POST",
      headers,
      body: "{}",
      keepalive: true,
    })
  }

  /** Пока вкладка в фоне — отпускаем lock, чтобы другой редактор мог работать; при возврате снова пытаемся взять. */
  const onDocumentVisibilityChange = (): void => {
    if (typeof document === "undefined") return
    if (document.visibilityState === "hidden") {
      void releaseHeld().then(() => fetchLocksList())
      return
    }
    void applyLockForSelection()
  }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", onBeforeWindowUnload)
    document.addEventListener("visibilitychange", onDocumentVisibilityChange)
  }

  onBeforeUnmount(() => {
    clearHeartbeat()
    clearPoll()
    clearLocksListTimer()
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", onBeforeWindowUnload)
      document.removeEventListener("visibilitychange", onDocumentVisibilityChange)
    }
    void releaseHeld()
  })

  return {
    locksList,
    isBlockedByOther,
    lockHolderDisplay,
    remoteDiagramUpdatedAt,
    serverNewerWhileBlocked,
    fetchLocksList,
    reloadAfterRemoteChange,
    evaluateServerNewer,
    releaseHeld,
  }
}
