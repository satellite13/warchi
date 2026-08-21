import { Client } from "@stomp/stompjs"
import { onBeforeUnmount, watch, type Ref } from "vue"
import { refreshAccessToken } from "@/api/apiClient"
import { buildModelSyncWsUrl } from "@/api/modelSyncWs"
import { listParams } from "@/api/queryHelpers"
import { apiGet } from "@/composables/useApi"
import {
  AUTH_CLEARED_EVENT,
  AUTH_UPDATED_EVENT,
  loadStoredUser,
} from "@/composables/authStorage"
import type {
  DiagramResponse,
  LinkResponse,
  LinkTypeResponse,
  NodeResponse,
  NodeTypeResponse,
} from "@/types/api"
import type { ModelData, PaginatedResponse } from "@/types/entities"
import type { EditorDiagram, ModelEditorState } from "../types"
import {
  mergeEntityListFromRemote,
  preserveOpenDiagramCanvasAfterRemoteMerge,
} from "../utils/modelEntityMerge"
import { decideCollectionPull } from "../utils/modelLiveSyncPullGate"
import { createModelChangedEventIdDeduper } from "../utils/modelLiveSyncEventDedup"
import {
  emitModelLiveSyncTelemetry,
  type ModelLiveSyncPullReason,
} from "../utils/modelLiveSyncTelemetry"
import {
  coalesceModelSyncGranularEvents,
  parseGranularSyncEventsFromPayload,
} from "../utils/modelSyncGranularCoalesce"
import { fetchAllByModelId } from "./modelEditorLoadModel"
import {
  toEditorDiagramPreservingLocalAttrs,
  toEditorLink,
  toEditorNode,
} from "./modelEditorMappers"

const STOMP_RECONNECT_DELAY_MS = 5000
const STOMP_HEARTBEAT_INCOMING_MS = 15000
const STOMP_HEARTBEAT_OUTGOING_MS = 15000

const DEFAULT_FALLBACK_POLL_MS = 15_000

export type ModelLiveSyncMode = "ws" | "poll" | "hybrid"

export function parseModelLiveSyncMode(raw: string | undefined): ModelLiveSyncMode {
  const normalized = raw?.trim().toLowerCase()
  if (normalized === "ws" || normalized === "poll" || normalized === "hybrid") {
    return normalized
  }
  return "hybrid"
}

export function parseModelLivePollMs(raw: string | undefined): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_FALLBACK_POLL_MS
  if (parsed < 1000) return 1000
  return Math.floor(parsed)
}

const MODEL_LIVE_SYNC_MODE = parseModelLiveSyncMode(import.meta.env.VITE_MODEL_LIVE_SYNC_MODE)
const MODEL_LIVE_POLL_MS = parseModelLivePollMs(import.meta.env.VITE_MODEL_LIVE_POLL_MS)

async function allSettledOrThrow<T extends readonly Promise<unknown>[]>(
  promises: T
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  let firstRejection: unknown
  let hasRejection = false
  const tracked = promises.map(promise =>
    promise.catch(error => {
      if (!hasRejection) {
        hasRejection = true
        firstRejection = error
      }
      throw error
    })
  )
  const settled = await Promise.allSettled(tracked)
  if (hasRejection) {
    throw firstRejection
  }
  return settled.map(result => (result as PromiseFulfilledResult<unknown>).value) as {
    [K in keyof T]: Awaited<T[K]>
  }
}

type PullSnapshotOptions = {
  /** Push / переподключение / возврат на вкладку — не ждать окончания локального save. */
  ignoreSavingGuard?: boolean
  /** Для телеметрии `pull_trigger` (см. WARCHI_MODEL_LIVE_SYNC_EVENT). */
  reason?: ModelLiveSyncPullReason
}

/**
 * Live sync по событию: STOMP `/topic/models/{modelId}` → один проход merge с API (ноды, связи, диаграммы, модель).
 * Режимы:
 * - ws: только STOMP + pull по событию
 * - poll: только периодический pull
 * - hybrid (default): STOMP primary + polling fallback при потере WS
 * Дополнительно: разовый pull при старте сессии (вкладка видима), после STOMP connect/reconnect,
 * при `model_changed`, при возврате на вкладку (догон после фона).
 * См. in-app help: /docs/diagrams и /docs/models.
 */
export type UseModelLiveSyncOptions = {
  modelId: Ref<string | null | undefined>
  state: Ref<ModelEditorState>
  model: Ref<ModelData | null>
  enabled: Ref<boolean>
  isLoading: Ref<boolean>
  /** false until shell+links finished; opportunistic pulls wait for this. */
  initialSnapshotReady: Ref<boolean>
  isSaving: Ref<boolean>
  modelDirty: Ref<boolean>
  ensureNotationRelationsAndRules: (notationId: string) => Promise<void>
  reconcileMaterializedRows?: () => void
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
}

export function useModelLiveSync(options: UseModelLiveSyncOptions): void {
  const syncMode = options.mode ?? MODEL_LIVE_SYNC_MODE
  let inFlight = false
  let activePullGeneration: number | null = null
  let activePullModelId: string | null = null
  let pullScheduled = false
  let pendingPull: PullSnapshotOptions | null = null
  let syncGeneration = 0
  let disposed = false
  let stompClient: Client | null = null
  let fallbackPollTimer: ReturnType<typeof setInterval> | null = null
  let wsConnected = false
  let connectHelloPending = false
  let skipConnectResyncOnce = false
  let pendingModelChanged = false
  let lastSyncedModelId: string | null = null
  /** После soft/permanent delete не долбить /models/{id} 404’ами. */
  let unavailableModelId: string | null = null
  const modelChangedEventIdDeduper = createModelChangedEventIdDeduper()
  let stompPullCoalesceScheduled = false
  let wsAuthRefreshInFlight: Promise<boolean> | null = null

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

  const isWsEnabled = syncMode === "ws" || syncMode === "hybrid"
  const isPollEnabled = syncMode === "poll" || syncMode === "hybrid"

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
    if (!options.enabled.value || options.isLoading.value) return
    if (!isInitialSnapshotReady()) return
    if (isHaltedForCurrentModel()) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return
    if (fallbackPollTimer !== null) return
    fallbackPollTimer = setInterval(() => {
      void pullRemoteSnapshot({ reason: "poll_timer" })
    }, MODEL_LIVE_POLL_MS)
    if (opts?.immediate !== false) {
      void pullRemoteSnapshot({ reason: "poll_timer" })
    }
  }

  const collectNotationIds = (diagrams: EditorDiagram[]): string[] => {
    const set = new Set<string>()
    for (const d of diagrams) {
      if (d._isDeleted) continue
      if (d.notationId) set.add(d.notationId)
    }
    return [...set]
  }

  const canPullCurrentModel = (): boolean => {
    if (disposed || !options.enabled.value || options.isLoading.value) return false
    if (isHaltedForCurrentModel()) return false
    const mid = options.modelId.value
    return typeof mid === 'string' && mid.length > 0
  }

  const executeRemoteSnapshotPull = async (pullOpts: PullSnapshotOptions): Promise<void> => {
    if (inFlight) return
    if (!options.enabled.value || options.isLoading.value) return
    if (isHaltedForCurrentModel()) return
    if (!pullOpts.ignoreSavingGuard && options.isSaving.value) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return
    const pullGeneration = syncGeneration

    inFlight = true
    activePullGeneration = pullGeneration
    activePullModelId = mid
    if (pullOpts.reason) {
      emitModelLiveSyncTelemetry({
        kind: "pull_trigger",
        modelId: mid,
        reason: pullOpts.reason,
      })
    }
    try {
      // Must page through the full collections — a single size=1000 page drops the rest
      // via mergeEntityListFromRemote and empties the tree after a large import.
      const [remoteNodes, remoteLinks, remoteDiagrams, modelRes] = await allSettledOrThrow(
        [
          fetchAllByModelId<NodeResponse>('/nodes', mid),
          fetchAllByModelId<LinkResponse>('/links', mid),
          fetchAllByModelId<DiagramResponse>('/diagrams', mid, undefined, {
            includeAttrs: 'false',
          }),
          apiGet<ModelData>(`/models/${mid}`),
        ] as const
      )

      if (
        disposed ||
        !options.enabled.value ||
        syncGeneration !== pullGeneration ||
        options.modelId.value !== mid
      ) {
        return
      }

      if (!modelRes.success) {
        // Soft/permanent delete → findById returns 404; keep polling would spam console on any page
        // until the editor unmounts (and Safari keeps those errors in the console).
        if (modelRes.error.status === 404 || modelRes.error.status === 403) {
          haltForUnavailable(mid, modelRes.error.status)
        }
        return
      }

      const diagramsBefore = options.state.value.diagrams
      const notationIdsBefore = new Set(collectNotationIds(diagramsBefore))

      const mergedNodes = mergeEntityListFromRemote(
        options.state.value.nodes,
        remoteNodes,
        toEditorNode
      )
      const mergedLinks = mergeEntityListFromRemote(
        options.state.value.links,
        remoteLinks,
        toEditorLink
      )
      const mergedDiagrams = mergeEntityListFromRemote(
        options.state.value.diagrams,
        remoteDiagrams,
        row => toEditorDiagramPreservingLocalAttrs(row, diagramsBefore)
      )
      const nextNodes = mergedNodes.items
      const nextLinks = mergedLinks.items
      let nextDiagrams = mergedDiagrams.items
      const openId = options.openDiagramId?.value
      if (openId) {
        const preserveInstances = options.preserveOpenDiagramCanvasInstances?.value ?? true
        nextDiagrams = preserveOpenDiagramCanvasAfterRemoteMerge(
          nextDiagrams,
          diagramsBefore,
          openId,
          { preserveInstances }
        )
      }

      options.state.value.nodes = nextNodes
      options.state.value.links = nextLinks
      options.reconcileMaterializedRows?.()
      options.state.value.diagrams = nextDiagrams

      if (options.model.value && !options.modelDirty.value && modelRes.success) {
        const d = modelRes.data
        const m = options.model.value
        options.model.value = {
          ...m,
          name: d.name,
          version: d.version,
          ownerId: d.ownerId,
          attrs: d.attrs,
          sourceId: d.sourceId,
          accessPermission: d.accessPermission,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }
      }

      const notationIds = collectNotationIds(nextDiagrams)
      for (const nid of notationIds) {
        if (!notationIdsBefore.has(nid)) {
          await options.ensureNotationRelationsAndRules(nid)
          if (
            disposed ||
            !options.enabled.value ||
            syncGeneration !== pullGeneration ||
            options.modelId.value !== mid
          ) {
            return
          }
        }
      }

      if (notationIds.length > 0) {
        const typesQuery = listParams()
        typesQuery.set("modelId", mid)
        for (const nid of notationIds) {
          typesQuery.append("notationId", nid)
        }
        const [ntRes, ltRes] = await allSettledOrThrow(
          [
            apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${typesQuery.toString()}`),
            apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${typesQuery.toString()}`),
          ] as const
        )
        if (
          disposed ||
          !options.enabled.value ||
          syncGeneration !== pullGeneration ||
          options.modelId.value !== mid
        ) {
          return
        }
        if (ntRes.success) {
          options.state.value.nodeTypes = ntRes.data.content ?? []
        }
        if (ltRes.success) {
          options.state.value.linkTypes = ltRes.data.content ?? []
        }
      }
    } finally {
      inFlight = false
      activePullGeneration = null
      activePullModelId = null
      queuePullDrain()
    }
  }

  const mergePendingPull = (pullOpts: PullSnapshotOptions): void => {
    if (!pendingPull || pullOpts.reason === 'stomp_model_changed') {
      pendingPull = pullOpts
    }
  }

  const drainPullQueue = (): void => {
    pullScheduled = false
    if (inFlight || !pendingPull) return
    if (!canPullCurrentModel()) {
      pendingPull = null
      return
    }
    const nextPull = pendingPull
    pendingPull = null
    runAsyncSafely(() => executeRemoteSnapshotPull(nextPull))
  }

  function queuePullDrain(): void {
    if (pullScheduled || disposed || !pendingPull) return
    pullScheduled = true
    queueMicrotask(() => {
      drainPullQueue()
    })
  }

  const pullRemoteSnapshot = (pullOpts: PullSnapshotOptions = {}): void => {
    if (!canPullCurrentModel()) return
    if (!pullOpts.ignoreSavingGuard && options.isSaving.value) return
    const reason = pullOpts.reason
    if (
      inFlight &&
      reason !== 'stomp_model_changed' &&
      activePullGeneration === syncGeneration &&
      activePullModelId === options.modelId.value
    ) {
      return
    }
    if (reason) {
      const decision = decideCollectionPull({
        reason,
        snapshotReady: isInitialSnapshotReady(),
        skipConnectResyncOnce,
      })
      if (decision.action === 'skip') return
      if (decision.action === 'queue') {
        pendingModelChanged = true
        return
      }
      if (decision.action === 'skip_hello') {
        skipConnectResyncOnce = false
        return
      }
    }
    mergePendingPull(pullOpts)
    queuePullDrain()
  }

  const scheduleStompModelChangedPull = (): void => {
    if (stompPullCoalesceScheduled) return
    stompPullCoalesceScheduled = true
    queueMicrotask(() => {
      stompPullCoalesceScheduled = false
      pullRemoteSnapshot({ ignoreSavingGuard: true, reason: 'stomp_model_changed' })
    })
  }

  const connectPush = (): void => {
    disconnectPush()
    if (!isWsEnabled) return
    if (!options.enabled.value) return
    if (isHaltedForCurrentModel()) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return
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
        if (disposed || stompClient !== client || options.modelId.value !== mid) {
          runAsyncSafely(() => client.deactivate())
          return
        }
        const refreshed = await ensureWsAuthCookieFresh()
        if (
          !refreshed ||
          disposed ||
          stompClient !== client ||
          options.modelId.value !== mid
        ) {
          runAsyncSafely(() => client.deactivate())
        }
      },
      onConnect: () => {
        if (
          disposed ||
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
            stompClient !== client ||
            options.modelId.value !== mid ||
            syncGeneration !== clientGeneration
          ) {
            return
          }
          try {
            const parsed = JSON.parse(message.body) as Record<string, unknown>
            if (typeof parsed.modelId !== "string" || parsed.modelId !== mid) {
              return
            }
            emitModelLiveSyncTelemetry({
              kind: "ws_message_received",
              modelId: mid,
              messageType: typeof parsed.type === "string" ? parsed.type : "",
              eventId: typeof parsed.eventId === "string" ? parsed.eventId : undefined,
            })
            options.onModelTopicBroadcast?.(parsed)
            if (parsed.type !== "model_changed") {
              return
            }
            const self = options.currentUserId?.value
            if (self && parsed.actorUserId === self) {
              return
            }
            const eid = parsed.eventId
            if (!modelChangedEventIdDeduper.consume(eid)) {
              if (typeof eid === "string" && eid.length > 0) {
                emitModelLiveSyncTelemetry({ kind: "ws_message_deduped", modelId: mid, eventId: eid })
              }
              return
            }
            coalesceModelSyncGranularEvents(parseGranularSyncEventsFromPayload(parsed.events))
            scheduleStompModelChangedPull()
          } catch {
            /* ignore malformed */
          }
        })
        pullRemoteSnapshot({ ignoreSavingGuard: true, reason: "ws_connect" })
      },
      onDisconnect: () => {
        if (stompClient !== client) return
        wsConnected = false
        if (options.enabled.value && !isHaltedForCurrentModel()) {
          startFallbackPoll()
        }
      },
      onStompError: () => {
        if (stompClient !== client) return
        wsConnected = false
        if (options.enabled.value && !isHaltedForCurrentModel()) {
          startFallbackPoll()
        }
      },
      onWebSocketClose: () => {
        if (stompClient !== client) return
        wsConnected = false
        runAsyncSafely(() => ensureWsAuthCookieFresh())
        if (options.enabled.value && !isHaltedForCurrentModel()) {
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
    if (!options.enabled.value) {
      syncGeneration += 1
      pendingPull = null
      pendingModelChanged = false
      connectHelloPending = false
      disconnectPush()
      stopFallbackPoll()
      return
    }
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") {
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
      pendingPull = null
      pendingModelChanged = false
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

    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return
    }
    // The onConnect callback in connectPush also pulls — the inFlight guard
    // ensures only one pull runs at a time, so this is safe but may be redundant.
    // We keep it for the case where WS connection is slow or fails.
    if (syncMode !== 'poll') {
      pullRemoteSnapshot({ reason: "session_resync" })
    }
  }

  watch(
    () => [options.enabled.value, options.modelId.value] as const,
    () => {
      resyncSession()
    },
    { flush: "post", immediate: true }
  )

  watch(
    () => options.initialSnapshotReady.value,
    (ready, wasReady) => {
      if (!ready) return
      if (wasReady === false) {
        skipConnectResyncOnce = connectHelloPending
        if (pendingModelChanged) {
          pendingModelChanged = false
          pullRemoteSnapshot({ ignoreSavingGuard: true, reason: 'stomp_model_changed' })
        }
      }
      if (isPollEnabled && !wsConnected) {
        startFallbackPoll({ immediate: false })
      }
    }
  )

  const onDocumentVisibilityChange = (): void => {
    if (typeof document === "undefined") return
    if (document.visibilityState === "hidden") {
      if (syncMode === "hybrid") {
        stopFallbackPoll()
      }
      return
    }
    if (!options.enabled.value || isHaltedForCurrentModel()) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return
    if (isPollEnabled) {
      startFallbackPoll()
    }
    if (isWsEnabled && !wsConnected) {
      connectPush()
    }
    pullRemoteSnapshot({ ignoreSavingGuard: true, reason: "visibility" })
  }

  const onAuthUpdated = (): void => {
    if (isHaltedForCurrentModel()) return
    if (isWsEnabled) {
      connectPush()
    }
    if (isPollEnabled) {
      startFallbackPoll()
    }
    pullRemoteSnapshot({ reason: "auth_refresh" })
  }

  const onAuthCleared = (): void => {
    disconnectPush()
    stopFallbackPoll()
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onDocumentVisibilityChange)
  }
  if (typeof window !== "undefined") {
    window.addEventListener(AUTH_UPDATED_EVENT, onAuthUpdated)
    window.addEventListener(AUTH_CLEARED_EVENT, onAuthCleared)
  }

  onBeforeUnmount(() => {
    disposed = true
    syncGeneration += 1
    pendingPull = null
    pendingModelChanged = false
    disconnectPush()
    stopFallbackPoll()
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onDocumentVisibilityChange)
    }
    if (typeof window !== "undefined") {
      window.removeEventListener(AUTH_UPDATED_EVENT, onAuthUpdated)
      window.removeEventListener(AUTH_CLEARED_EVENT, onAuthCleared)
    }
  })
}
