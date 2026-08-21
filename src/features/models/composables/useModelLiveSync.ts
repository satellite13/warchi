import { Client } from '@stomp/stompjs'
import { onBeforeUnmount, watch, type Ref } from 'vue'
import { refreshAccessToken } from '@/api/apiClient'
import { buildModelSyncWsUrl } from '@/api/modelSyncWs'
import { AUTH_CLEARED_EVENT, AUTH_UPDATED_EVENT, loadStoredUser } from '@/composables/authStorage'
import type { ModelData } from '@/types/entities'
import type { ModelEditorState, TreeParentScope } from '../types'
import { decideCollectionPull } from '../utils/modelLiveSyncPullGate'
import { createModelChangedEventIdDeduper } from '../utils/modelLiveSyncEventDedup'
import {
  emitModelLiveSyncTelemetry,
  type ModelLiveSyncPullReason,
} from '../utils/modelLiveSyncTelemetry'
import {
  createModelGranularSyncReconciler,
  type ModelGranularSyncFetchers,
} from '../utils/modelGranularSyncReconciler'
import type { ModelPartialStore } from '../utils/modelPartialStore'
import {
  coalesceModelSyncGranularEvents,
  parseGranularSyncEventsFromPayload,
  reduceModelSyncGranularEvent,
  type GranularSyncEventPayload,
} from '../utils/modelSyncGranularCoalesce'
import {
  createBoundedModelReconcile,
  type BoundedModelReconcileFetchers,
  type PreparedChildrenScopeRefresh,
} from './useBoundedModelReconcile'

const STOMP_RECONNECT_DELAY_MS = 5000
const STOMP_HEARTBEAT_INCOMING_MS = 15000
const STOMP_HEARTBEAT_OUTGOING_MS = 15000

const DEFAULT_FALLBACK_POLL_MS = 15_000

export type ModelLiveSyncMode = 'ws' | 'poll' | 'hybrid'

export function parseModelLiveSyncMode(raw: string | undefined): ModelLiveSyncMode {
  const normalized = raw?.trim().toLowerCase()
  if (normalized === 'ws' || normalized === 'poll' || normalized === 'hybrid') {
    return normalized
  }
  return 'hybrid'
}

export function parseModelLivePollMs(raw: string | undefined): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_FALLBACK_POLL_MS
  if (parsed < 1000) return 1000
  return Math.floor(parsed)
}

const MODEL_LIVE_SYNC_MODE = parseModelLiveSyncMode(import.meta.env.VITE_MODEL_LIVE_SYNC_MODE)
const MODEL_LIVE_POLL_MS = parseModelLivePollMs(import.meta.env.VITE_MODEL_LIVE_POLL_MS)

type PullSnapshotOptions = {
  /** Push / переподключение / возврат на вкладку — не ждать окончания локального save. */
  ignoreSavingGuard?: boolean
  /** Для телеметрии `pull_trigger` (см. WARCHI_MODEL_LIVE_SYNC_EVENT). */
  reason?: ModelLiveSyncPullReason
}

/**
 * Live sync: STOMP `/topic/models/{modelId}` применяет granular events к materialized state.
 * Режимы:
 * - ws: STOMP granular reconcile без snapshot pull по событию
 * - poll: только периодический pull
 * - hybrid (default): STOMP primary + polling fallback при потере WS
 * Дополнительно: lightweight revision check после STOMP connect/reconnect, pull при обнаруженном
 * разрыве, `model_changed`, возврате на вкладку и polling fallback.
 * См. in-app help: /docs/diagrams и /docs/models.
 */
export type UseModelLiveSyncOptions = {
  modelId: Ref<string | null | undefined>
  state: Ref<ModelEditorState>
  model: Ref<ModelData | null>
  enabled: Ref<boolean>
  isLoading: Ref<boolean>
  /** false until the materialized shell baseline is ready; opportunistic pulls wait for this. */
  initialSnapshotReady: Ref<boolean>
  isSaving: Ref<boolean>
  modelDirty: Ref<boolean>
  ensureNotationRelationsAndRules: (notationId: string) => Promise<void>
  reconcileMaterializedRows?: () => void
  onRemoteSnapshotApplied?: () => void
  openDiagramId?: Ref<string | null | undefined>
  currentUserId?: Ref<string | null | undefined>
  /** false = для открытой диаграммы подставлять instances с сервера при pull (режим зрителя) */
  preserveOpenDiagramCanvasInstances?: Ref<boolean>
  /** Все сообщения по topic модели с совпадающим modelId (включая diagram_live и т.д.) */
  onModelTopicBroadcast?: (msg: Record<string, unknown>) => void
  /** Модель удалена / недоступна (404/403) — остановить sync и показать ошибку в редакторе */
  onModelUnavailable?: (status: number) => void
  /** Test/config override; production defaults to VITE_MODEL_LIVE_SYNC_MODE. */
  mode?: ModelLiveSyncMode
  granularSync?: {
    store: ModelPartialStore
    publishMaterializedRows: () => void
    refreshVisibleChildrenScope: (scope: TreeParentScope) => Promise<void>
    invalidateChildrenScope?: (scope: TreeParentScope) => void
    onDetachedSnapshotInvalidated?: () => void
    onDiagramReferencesInvalidated?: () => void
    onSyncError?: (
      event: GranularSyncEventPayload,
      message: string,
      retry: () => void
    ) => void
    onSyncRecovered?: (event: GranularSyncEventPayload) => void
    fetchers?: ModelGranularSyncFetchers
  }
  boundedSync?: {
    materializedScopes: () => TreeParentScope[]
    refreshVisibleChildrenScope: (scope: TreeParentScope, signal: AbortSignal) => Promise<void>
    prepareVisibleChildrenScopeRefresh?: (
      scope: TreeParentScope,
      signal: AbortSignal
    ) => Promise<PreparedChildrenScopeRefresh>
    reloadOpenDiagramScope?: (diagramId: string, signal: AbortSignal) => Promise<void>
    onDetachedSnapshotInvalidated?: () => void
    onSyncError?: (
      reason: ModelLiveSyncPullReason,
      message: string,
      retry: () => void
    ) => void
    onSyncRecovered?: (reason: ModelLiveSyncPullReason) => void
    fetchers?: BoundedModelReconcileFetchers
  }
}

export function useModelLiveSync(options: UseModelLiveSyncOptions): void {
  const syncMode = options.mode ?? MODEL_LIVE_SYNC_MODE
  let syncGeneration = 0
  let disposed = false
  let stompClient: Client | null = null
  let fallbackPollTimer: ReturnType<typeof setInterval> | null = null
  let wsConnected = false
  let connectHelloPending = false
  let skipConnectResyncOnce = false
  let lastSyncedModelId: string | null = null
  /** После soft/permanent delete не долбить /models/{id} 404’ами. */
  let unavailableModelId: string | null = null
  const modelChangedEventIdDeduper = createModelChangedEventIdDeduper()
  let wsAuthRefreshInFlight: Promise<boolean> | null = null
  let lastAppliedModelRevision: number | null = null
  let authActive = loadStoredUser() != null
  let acceptedRemoteUpdatedAt = options.model.value?.updatedAt ?? null
  let pendingRemoteModel: ModelData | null = null
  const pendingGranularEvents = new Map<string, GranularSyncEventPayload>()
  const compareUpdatedAt = (left: string | null, right: string | null): number => {
    if (left === right) return 0
    if (left == null) return -1
    if (right == null) return 1
    const leftTime = Date.parse(left)
    const rightTime = Date.parse(right)
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime
    return left.localeCompare(right)
  }
  const currentAcceptedUpdatedAt = (): string | null => {
    const current = options.model.value?.updatedAt ?? null
    return compareUpdatedAt(current, acceptedRemoteUpdatedAt) > 0
      ? current
      : acceptedRemoteUpdatedAt
  }
  const acceptRemoteModelMetadata = (remote: ModelData): boolean => {
    const remoteUpdatedAt = remote.updatedAt ?? null
    if (compareUpdatedAt(remoteUpdatedAt, currentAcceptedUpdatedAt()) < 0) return false
    acceptedRemoteUpdatedAt = remoteUpdatedAt
    if (options.modelDirty.value) {
      pendingRemoteModel = remote
      return true
    }
    pendingRemoteModel = null
    options.model.value = remote
    return true
  }
  const granularReconciler = options.granularSync
    ? createModelGranularSyncReconciler({
        modelId: () => options.modelId.value,
        model: () => options.model.value,
        replaceModel: model => {
          options.model.value = model
        },
        modelDirty: () => options.modelDirty.value,
        acceptModelMetadata: acceptRemoteModelMetadata,
        store: options.granularSync.store,
        defaultsCatalog: () => options.state.value,
        diagrams: () => options.state.value.diagrams,
        openDiagramId: () => options.openDiagramId?.value,
        replaceDiagrams: diagrams => {
          options.state.value.diagrams = diagrams
        },
        publishMaterializedRows: options.granularSync.publishMaterializedRows,
        refreshVisibleChildrenScope: options.granularSync.refreshVisibleChildrenScope,
        invalidateChildrenScope: options.granularSync.invalidateChildrenScope,
        fetchers: options.granularSync.fetchers,
        onDetachedSnapshotInvalidated: options.granularSync.onDetachedSnapshotInvalidated,
        onDiagramReferencesInvalidated:
          options.granularSync.onDiagramReferencesInvalidated,
        onModelRevisionApplied: revision => {
          if (revision != null) {
            lastAppliedModelRevision =
              lastAppliedModelRevision == null
                ? revision
                : Math.max(lastAppliedModelRevision, revision)
          }
        },
        onUnknownEvent: event => {
          const mid = options.modelId.value
          if (typeof mid === 'string') {
            emitModelLiveSyncTelemetry({ kind: 'granular_event_unknown', modelId: mid, event })
          }
        },
        onError: (event, error, retry) => {
          const mid = options.modelId.value
          const message = error instanceof Error ? error.message : String(error)
          if (typeof mid === 'string') {
            emitModelLiveSyncTelemetry({
              kind: 'granular_event_error',
              modelId: mid,
              event,
              message,
            })
          }
          options.granularSync?.onSyncError?.(event, message, retry)
        },
        onRecovered: event => options.granularSync?.onSyncRecovered?.(event),
      })
    : null
  const boundedReconciler = createBoundedModelReconcile({
    modelId: () => options.modelId.value,
    model: () => options.model.value,
    replaceModel: next => {
      options.model.value = next
    },
    modelDirty: () => options.modelDirty.value,
    acceptedRevision: currentAcceptedUpdatedAt,
    acceptModelMetadata: acceptRemoteModelMetadata,
    diagrams: () => options.state.value.diagrams,
    replaceDiagrams: diagrams => {
      options.state.value.diagrams = diagrams
    },
    materializedScopes: options.boundedSync?.materializedScopes ?? (() => []),
    refreshVisibleChildrenScope:
      options.boundedSync?.refreshVisibleChildrenScope ?? (async () => undefined),
    prepareVisibleChildrenScopeRefresh:
      options.boundedSync?.prepareVisibleChildrenScopeRefresh,
    openDiagramId: () => options.openDiagramId?.value,
    reloadOpenDiagramScope: options.boundedSync?.reloadOpenDiagramScope,
    fetchers: options.boundedSync?.fetchers,
    onDetachedSnapshotInvalidated: () => {
      options.boundedSync?.onDetachedSnapshotInvalidated?.()
      options.onRemoteSnapshotApplied?.()
    },
    onError: (reason, error, retry) => {
      options.boundedSync?.onSyncError?.(
        reason,
        error instanceof Error ? error.message : String(error),
        retry
      )
    },
    onRecovered: reason => options.boundedSync?.onSyncRecovered?.(reason),
    onModelUnavailable: status => haltForUnavailable(options.modelId.value ?? '', status),
  })

  const runAsyncSafely = (task: () => Promise<unknown>): void => {
    try {
      void task().catch(() => undefined)
    } catch {
      // Fire-and-forget lifecycle work must not escape into Vue/STOMP callbacks.
    }
  }

  const isHaltedForCurrentModel = (): boolean => {
    const mid = options.modelId.value
    return typeof mid === 'string' && unavailableModelId === mid
  }

  const haltForUnavailable = (mid: string, status: number): void => {
    if (unavailableModelId === mid) return
    unavailableModelId = mid
    disconnectPush()
    stopFallbackPoll()
    options.onModelUnavailable?.(status)
  }

  const ensureWsAuthCookieFresh = async (): Promise<boolean> => {
    if (!wsAuthRefreshInFlight) {
      wsAuthRefreshInFlight = refreshAccessToken()
        .catch(() => false)
        .finally(() => {
          wsAuthRefreshInFlight = null
        })
    }
    return wsAuthRefreshInFlight
  }

  const isWsEnabled = syncMode === 'ws' || syncMode === 'hybrid'
  const isPollEnabled = syncMode === 'poll' || syncMode === 'hybrid'

  const disconnectPush = (): void => {
    const c = stompClient
    stompClient = null
    wsConnected = false
    if (c) {
      runAsyncSafely(() => c.deactivate())
    }
  }

  const stopFallbackPoll = (): void => {
    if (fallbackPollTimer !== null) {
      clearInterval(fallbackPollTimer)
      fallbackPollTimer = null
    }
  }

  const isInitialSnapshotReady = (): boolean => options.initialSnapshotReady.value

  const startFallbackPoll = (opts?: { immediate?: boolean }): void => {
    if (!isPollEnabled) return
    if (!authActive || !options.enabled.value || options.isLoading.value) return
    if (!isInitialSnapshotReady()) return
    if (isHaltedForCurrentModel()) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== 'string') return
    if (fallbackPollTimer !== null) return
    fallbackPollTimer = setInterval(() => {
      void pullRemoteSnapshot({ reason: 'poll_timer' })
    }, MODEL_LIVE_POLL_MS)
    if (opts?.immediate !== false) {
      void pullRemoteSnapshot({ reason: 'poll_timer' })
    }
  }

  const canPullCurrentModel = (): boolean => {
    if (disposed || !authActive || !options.enabled.value || options.isLoading.value) return false
    if (isHaltedForCurrentModel()) return false
    const mid = options.modelId.value
    return typeof mid === 'string' && mid.length > 0
  }

  const pullRemoteSnapshot = (pullOpts: PullSnapshotOptions = {}): void => {
    if (!canPullCurrentModel()) return
    if (!pullOpts.ignoreSavingGuard && options.isSaving.value) return
    const reason = pullOpts.reason
    if (!reason) return
    const decision = decideCollectionPull({
      reason,
      snapshotReady: isInitialSnapshotReady(),
      skipConnectResyncOnce,
    })
    if (decision.action === 'skip' || decision.action === 'queue') return
    if (decision.action === 'skip_hello') {
      skipConnectResyncOnce = false
      return
    }
    const mid = options.modelId.value
    if (!mid || typeof mid !== 'string') return
    emitModelLiveSyncTelemetry({ kind: 'pull_trigger', modelId: mid, reason })
    boundedReconciler.request(reason)
  }

  const enqueueGranularEvents = (events: readonly GranularSyncEventPayload[]): void => {
    if (!authActive || !options.enabled.value) return
    const coalesced = coalesceModelSyncGranularEvents([...events]).filter(
      event =>
        event.revision == null ||
        lastAppliedModelRevision == null ||
        event.revision >= lastAppliedModelRevision
    )
    if (!isInitialSnapshotReady()) {
      for (const event of coalesced) {
        const key = `${event.entity}:${event.id}`
        const previous = pendingGranularEvents.get(key)
        pendingGranularEvents.set(
          key,
          previous ? reduceModelSyncGranularEvent(previous, event) : event
        )
      }
      return
    }
    granularReconciler?.enqueue(coalesced)
  }

  const drainPendingGranularEvents = (): void => {
    if (pendingGranularEvents.size === 0) return
    const events = [...pendingGranularEvents.values()]
    pendingGranularEvents.clear()
    enqueueGranularEvents(events)
  }

  const connectPush = (): void => {
    disconnectPush()
    if (!isWsEnabled) return
    if (!authActive || !options.enabled.value) return
    if (isHaltedForCurrentModel()) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== 'string') return
    if (!loadStoredUser()) return

    const url = buildModelSyncWsUrl()
    if (!url) return

    const clientGeneration = syncGeneration
    const client = new Client({
      brokerURL: url,
      reconnectDelay: STOMP_RECONNECT_DELAY_MS,
      heartbeatIncoming: STOMP_HEARTBEAT_INCOMING_MS,
      heartbeatOutgoing: STOMP_HEARTBEAT_OUTGOING_MS,
      beforeConnect: async () => {
        if (disposed || !authActive || stompClient !== client || options.modelId.value !== mid) {
          runAsyncSafely(() => client.deactivate())
          return
        }
        const refreshed = await ensureWsAuthCookieFresh()
        if (
          !refreshed ||
          disposed ||
          !authActive ||
          stompClient !== client ||
          options.modelId.value !== mid
        ) {
          runAsyncSafely(() => client.deactivate())
        }
      },
      onConnect: () => {
        if (
          disposed ||
          !authActive ||
          stompClient !== client ||
          options.modelId.value !== mid ||
          syncGeneration !== clientGeneration
        ) {
          runAsyncSafely(() => client.deactivate())
          return
        }
        connectHelloPending = false
        wsConnected = true
        stopFallbackPoll()
        client.subscribe(`/topic/models/${mid}`, message => {
          if (
            disposed ||
            !authActive ||
            stompClient !== client ||
            options.modelId.value !== mid ||
            syncGeneration !== clientGeneration
          ) {
            return
          }
          try {
            const parsed = JSON.parse(message.body) as Record<string, unknown>
            if (typeof parsed.modelId !== 'string' || parsed.modelId !== mid) {
              return
            }
            emitModelLiveSyncTelemetry({
              kind: 'ws_message_received',
              modelId: mid,
              messageType: typeof parsed.type === 'string' ? parsed.type : '',
              eventId: typeof parsed.eventId === 'string' ? parsed.eventId : undefined,
            })
            options.onModelTopicBroadcast?.(parsed)
            if (parsed.type !== 'model_changed') {
              return
            }
            const self = options.currentUserId?.value
            if (self && parsed.actorUserId === self) {
              return
            }
            const eid = parsed.eventId
            if (!modelChangedEventIdDeduper.consume(eid)) {
              if (typeof eid === 'string' && eid.length > 0) {
                emitModelLiveSyncTelemetry({
                  kind: 'ws_message_deduped',
                  modelId: mid,
                  eventId: eid,
                })
              }
              return
            }
            const events = parseGranularSyncEventsFromPayload(parsed.events)
            if (events.length === 0) {
              lastAppliedModelRevision = null
              emitModelLiveSyncTelemetry({
                kind: 'granular_payload_unsupported',
                modelId: mid,
                eventId: typeof parsed.eventId === 'string' ? parsed.eventId : undefined,
              })
              return
            }
            enqueueGranularEvents(events)
          } catch {
            /* ignore malformed */
          }
        })
        pullRemoteSnapshot({ ignoreSavingGuard: true, reason: 'ws_revision_changed' })
      },
      onDisconnect: () => {
        if (stompClient !== client) return
        wsConnected = false
        if (authActive && options.enabled.value && !isHaltedForCurrentModel()) {
          startFallbackPoll()
        }
      },
      onStompError: () => {
        if (stompClient !== client) return
        wsConnected = false
        if (authActive && options.enabled.value && !isHaltedForCurrentModel()) {
          startFallbackPoll()
        }
      },
      onWebSocketClose: () => {
        if (stompClient !== client) return
        wsConnected = false
        runAsyncSafely(() => ensureWsAuthCookieFresh())
        if (authActive && options.enabled.value && !isHaltedForCurrentModel()) {
          startFallbackPoll()
        }
      },
    })
    connectHelloPending = true
    stompClient = client
    void client.activate()
    if (isPollEnabled) {
      startFallbackPoll()
    }
  }

  const resyncSession = (): void => {
    if (!authActive || !options.enabled.value) {
      syncGeneration += 1
      pendingGranularEvents.clear()
      lastAppliedModelRevision = null
      granularReconciler?.invalidate()
      boundedReconciler.invalidate()
      connectHelloPending = false
      disconnectPush()
      stopFallbackPoll()
      return
    }
    const mid = options.modelId.value
    if (!mid || typeof mid !== 'string') {
      disconnectPush()
      stopFallbackPoll()
      return
    }
    // New model id → allow sync again after a previous unavailable halt.
    if (unavailableModelId != null && unavailableModelId !== mid) {
      unavailableModelId = null
    }
    if (lastSyncedModelId !== mid) {
      syncGeneration += 1
      lastSyncedModelId = mid
      pendingGranularEvents.clear()
      lastAppliedModelRevision = null
      acceptedRemoteUpdatedAt = options.model.value?.updatedAt ?? null
      pendingRemoteModel = null
      granularReconciler?.invalidate()
      boundedReconciler.invalidate()
      skipConnectResyncOnce = false
      connectHelloPending = false
    }
    if (isHaltedForCurrentModel()) {
      disconnectPush()
      stopFallbackPoll()
      return
    }

    // connectPush triggers pullRemoteSnapshot in its onConnect callback,
    // so we only pull here if the tab is visible and WS is not being set up
    // (to avoid a duplicate pull when onConnect fires quickly).
    if (isWsEnabled) {
      connectPush()
    } else {
      disconnectPush()
    }
    if (isPollEnabled) {
      startFallbackPoll({ immediate: syncMode !== 'poll' })
    } else {
      stopFallbackPoll()
    }

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }
    // The bounded reconciler coalesces this with a fast onConnect revision probe.
    if (syncMode !== 'poll') {
      pullRemoteSnapshot({ reason: 'session_resync' })
    }
  }

  watch(
    () => [options.enabled.value, options.modelId.value] as const,
    () => {
      resyncSession()
    },
    { flush: 'post', immediate: true }
  )

  watch(
    () => options.initialSnapshotReady.value,
    (ready, wasReady) => {
      if (!ready) return
      if (wasReady === false) {
        skipConnectResyncOnce = connectHelloPending
        drainPendingGranularEvents()
      }
      if (isPollEnabled && !wsConnected) {
        startFallbackPoll({ immediate: false })
      }
    }
  )

  watch(
    () => options.modelDirty.value,
    dirty => {
      if (dirty || !pendingRemoteModel) return
      const pending = pendingRemoteModel
      pendingRemoteModel = null
      if (
        pending.id === options.model.value?.id &&
        compareUpdatedAt(pending.updatedAt ?? null, options.model.value?.updatedAt ?? null) > 0
      ) {
        options.model.value = pending
      }
    },
    { flush: 'post' }
  )

  const onDocumentVisibilityChange = (): void => {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'hidden') {
      if (syncMode === 'hybrid') {
        stopFallbackPoll()
      }
      return
    }
    if (!authActive || !options.enabled.value || isHaltedForCurrentModel()) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== 'string') return
    if (isPollEnabled) {
      startFallbackPoll()
    }
    if (isWsEnabled && !wsConnected) {
      connectPush()
    }
    pullRemoteSnapshot({ ignoreSavingGuard: true, reason: 'visibility' })
  }

  const onAuthUpdated = (): void => {
    authActive = true
    if (!options.enabled.value) return
    if (isHaltedForCurrentModel()) return
    if (isWsEnabled) {
      connectPush()
    }
    if (isPollEnabled) {
      startFallbackPoll()
    }
    pullRemoteSnapshot({ reason: 'auth_refresh' })
  }

  const onAuthCleared = (): void => {
    authActive = false
    syncGeneration += 1
    pendingGranularEvents.clear()
    granularReconciler?.invalidate()
    boundedReconciler.invalidate()
    disconnectPush()
    stopFallbackPoll()
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onDocumentVisibilityChange)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener(AUTH_UPDATED_EVENT, onAuthUpdated)
    window.addEventListener(AUTH_CLEARED_EVENT, onAuthCleared)
  }

  onBeforeUnmount(() => {
    disposed = true
    syncGeneration += 1
    pendingGranularEvents.clear()
    granularReconciler?.dispose()
    boundedReconciler.dispose()
    disconnectPush()
    stopFallbackPoll()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onDocumentVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener(AUTH_UPDATED_EVENT, onAuthUpdated)
      window.removeEventListener(AUTH_CLEARED_EVENT, onAuthCleared)
    }
  })
}
