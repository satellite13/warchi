import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue"
import { buildApiUrl } from "@/api/config"
import { getCsrfTokenFromCookie, CSRF_HEADER_NAME } from "@/utils/csrfCookie"
import { apiGet, apiPost } from "@/composables/useApi"
import type { DiagramLockStatusResponse } from "@/types/api"
import type { PaginatedResponse } from "@/types/entities"
import { paginatedContent } from "@/utils/paginatedResponse"

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
  /** Лок потерян и повторный acquire не удался */
  const lockLost = ref(false)
  /** Сохранять локальный canvas после потери лока (до успешного recover / явной загрузки) */
  const preserveLocalCanvasAfterLockLoss = ref(false)

  const heldDiagramId = ref<string | null>(null)
  const heldByUserId = ref<string | null>(null)

  const isLockHeld = computed(
    () =>
      options.selectedDiagramId.value != null &&
      heldDiagramId.value === options.selectedDiagramId.value
  )
  let lockOpSeq = 0
  let lockOpInFlight = 0
  let blockedPollInFlight = false

  function beginLockOp(): void {
    lockOpInFlight += 1
  }
  function endLockOp(): void {
    lockOpInFlight = Math.max(0, lockOpInFlight - 1)
  }
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
      void (async () => {
        const res = await apiPost<DiagramLockStatusResponse>(
          `/diagram-locks/${diagramId}/heartbeat`,
          {}
        )
        if (res.success) return
        const status = res.error.status
        if (status === 404 || status === 403 || status === 409) {
          await recoverLostLock()
        }
      })()
    }, HEARTBEAT_MS)
  }

  async function releaseHeld(): Promise<void> {
    beginLockOp()
    try {
      const id = heldDiagramId.value
      if (!id) return
      heldDiagramId.value = null
      heldByUserId.value = null
      clearHeartbeat()
      try {
        await apiPost(`/diagram-locks/${id}/release`, {})
      } catch {
        // Release failed (network error, server down). The server-side lock
        // will expire via heartbeat timeout — log but do not block the caller.
        console.warn(`[DiagramEditLock] Failed to release lock for diagram ${id}`)
      }
    } finally {
      endLockOp()
    }
  }

  async function fetchLocksList(): Promise<void> {
    const mid = options.modelId.value
    if (!mid) {
      locksList.value = []
      return
    }
    const res = await apiGet<PaginatedResponse<DiagramLockStatusResponse>>(
      `/diagram-locks?modelId=${encodeURIComponent(mid)}`
    )
    if (res.success) {
      const locks = paginatedContent(res.data)
      locksList.value = locks
      checkHeldLockRevoked(locks)
      syncRemoteUpdatedAtFromLocksList()
    }
  }

  /**
   * Если мы держали lock, но в списке его нет или он теперь у другого
   * пользователя — пробуем тихо перезахватить, а не считать это force-revoke.
   */
  function checkHeldLockRevoked(serverLocks: DiagramLockStatusResponse[]): void {
    if (!heldDiagramId.value) return
    if (lockOpInFlight > 0) return
    const entry = serverLocks.find((l) => l.diagramId === heldDiagramId.value)
    const stillOurs =
      entry != null &&
      entry.isLocked &&
      (heldByUserId.value == null || entry.lockedByUserId === heldByUserId.value)
    if (stillOurs) return
    void recoverLostLock()
  }

  async function recoverLostLock(): Promise<"held" | "blocked" | "failed"> {
    beginLockOp()
    try {
      const diagramId = heldDiagramId.value ?? options.selectedDiagramId.value
      heldDiagramId.value = null
      heldByUserId.value = null
      clearHeartbeat()
      preserveLocalCanvasAfterLockLoss.value = true
      lockLost.value = false
      if (!diagramId) return "failed"
      const res = await apiPost<DiagramLockStatusResponse>(`/diagram-locks/${diagramId}/acquire`, {})
      if (res.success && res.data && res.data.reason !== LOCKED_BY_OTHER) {
        heldDiagramId.value = diagramId
        heldByUserId.value = res.data.lockedByUserId ?? null
        startHeartbeat(diagramId)
        preserveLocalCanvasAfterLockLoss.value = false
        return "held"
      }
      if (res.success && res.data?.reason === LOCKED_BY_OTHER) {
        isBlockedByOther.value = true
        lockHolderDisplay.value = res.data.lockedByDisplay ?? null
        remoteDiagramUpdatedAt.value = res.data.diagramUpdatedAt ?? null
        startBlockedPoll(diagramId)
        return "blocked"
      }
      lockLost.value = true
      return "failed"
    } finally {
      endLockOp()
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
    beginLockOp()
    try {
      const diagramId = options.selectedDiagramId.value
      const canEdit = options.canEditModel.value
      const latest = options.isActiveDiagramLatest.value
      const persisted = options.isSelectedDiagramPersistedOnServer.value
      const eligible = !!diagramId && canEdit && latest && persisted
      if (eligible && heldDiagramId.value === diagramId) {
        return
      }

      const seq = ++lockOpSeq
      await releaseHeld()
      clearPoll()
      isBlockedByOther.value = false
      lockHolderDisplay.value = null
      remoteDiagramUpdatedAt.value = null
      serverNewerWhileBlocked.value = false

      if (!diagramId || !canEdit || !latest || !persisted) {
        if (seq !== lockOpSeq) return
        // После releaseHeld() сервер уже без lock — без refresh дерево показывало бы старый locksList до LOCKS_LIST_MS
        await fetchLocksList()
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
          startBlockedPoll(diagramId)
          await fetchLocksList()
          return
        }
        heldDiagramId.value = diagramId
        heldByUserId.value = d.lockedByUserId ?? null
        startHeartbeat(diagramId)
        await fetchLocksList()
        return
      }

      // Совместимость: старый бэкенд мог отдавать 409 + тело в error.details
      if (!res.success && res.error.status === 409 && isLockStatusPayload(res.error.details)) {
        const d = res.error.details
        if (d.reason === LOCKED_BY_OTHER) {
          isBlockedByOther.value = true
          lockHolderDisplay.value = d.lockedByDisplay ?? null
          remoteDiagramUpdatedAt.value = d.diagramUpdatedAt ?? null
          startBlockedPoll(diagramId)
          await fetchLocksList()
          return
        }
      }

      // Fallback for backends that still return a bare 409 without lock payload:
      // infer blocked state from the locks list for the selected diagram.
      if (!res.success && res.error.status === 409) {
        await fetchLocksList()
        if (seq !== lockOpSeq) return
        const entry = locksList.value.find((l) => l.diagramId === diagramId && l.isLocked)
        if (entry) {
          isBlockedByOther.value = true
          lockHolderDisplay.value = entry.lockedByDisplay ?? null
          remoteDiagramUpdatedAt.value = entry.diagramUpdatedAt ?? null
          startBlockedPoll(diagramId)
          return
        }
      }

      await fetchLocksList()
    } finally {
      endLockOp()
    }
  }

  /** Start interval-based polling while blocked. First poll fires immediately. */
  function startBlockedPoll(diagramId: string): void {
    clearPoll()
    // Fire first poll immediately, then schedule subsequent polls.
    // setInterval is set *before* the first poll to avoid the race where
    // a fast poll → applyLockForSelection creates a new interval that gets
    // overwritten by a late setInterval call.
    pollTimer = setInterval(() => {
      void pollWhileBlocked(diagramId)
    }, POLL_MS)
    void pollWhileBlocked(diagramId)
  }

  async function pollWhileBlocked(diagramId: string): Promise<void> {
    if (blockedPollInFlight) return
    blockedPollInFlight = true
    try {
      await fetchLocksList()
      const entry = locksList.value.find((l) => l.diagramId === diagramId)
      if (!entry || !entry.isLocked) {
        clearPoll()
        await applyLockForSelection()
      }
    } finally {
      blockedPollInFlight = false
    }
  }

  async function reloadAfterRemoteChange(loadModel: () => Promise<void>): Promise<void> {
    preserveLocalCanvasAfterLockLoss.value = false
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
    const id = heldDiagramId.value
    if (!id) return
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    const csrfToken = getCsrfTokenFromCookie()
    if (csrfToken) {
      headers[CSRF_HEADER_NAME] = csrfToken
    }
    void fetch(buildApiUrl(`/diagram-locks/${id}/release`), {
      method: "POST",
      headers,
      body: "{}",
      credentials: "include",
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

  async function retryAcquire(): Promise<void> {
    if (heldDiagramId.value && heldDiagramId.value === options.selectedDiagramId.value) {
      return
    }
    await applyLockForSelection()
  }

  /**
   * Проверить перед сохранением, что наш лок ещё действует.
   * Делает GET /diagram-locks по модели и сверяет holder.
   * Если лока нет в списке — пробует recoverLostLock и разрешает save только при 'held'.
   */
  async function verifyLockBeforeSave(): Promise<boolean> {
    if (lockLost.value || isBlockedByOther.value) return false
    if (!heldDiagramId.value) return true // нет лока — сохранение модели без canvas-правок
    const mid = options.modelId.value
    if (!mid) return true
    const res = await apiGet<PaginatedResponse<DiagramLockStatusResponse>>(
      `/diagram-locks?modelId=${encodeURIComponent(mid)}`
    )
    if (!res.success) return false
    const entry = paginatedContent(res.data).find((l) => l.diagramId === heldDiagramId.value)
    const stillOurs =
      entry != null &&
      entry.isLocked &&
      (heldByUserId.value == null || entry.lockedByUserId === heldByUserId.value)
    if (stillOurs) return true
    return (await recoverLostLock()) === "held"
  }

  return {
    locksList,
    isLockHeld,
    isBlockedByOther,
    lockHolderDisplay,
    remoteDiagramUpdatedAt,
    serverNewerWhileBlocked,
    lockLost,
    preserveLocalCanvasAfterLockLoss,
    fetchLocksList,
    reloadAfterRemoteChange,
    evaluateServerNewer,
    releaseHeld,
    retryAcquire,
    verifyLockBeforeSave,
  }
}
