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
import { isModelEditorSnapshotFresh } from "../utils/modelEditorSnapshotFreshness"
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
import { toEditorDiagram, toEditorLink, toEditorNode } from "./modelEditorMappers"

const STOMP_RECONNECT_DELAY_MS = 5000
const STOMP_HEARTBEAT_INCOMING_MS = 15000
const STOMP_HEARTBEAT_OUTGOING_MS = 15000

const DEFAULT_FALLBACK_POLL_MS = 15_000

type ModelLiveSyncMode = "ws" | "poll" | "hybrid"

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
export function useModelLiveSync(options: {
  modelId: Ref<string | null | undefined>
  state: Ref<ModelEditorState>
  model: Ref<ModelData | null>
  enabled: Ref<boolean>
  isLoading: Ref<boolean>
  isSaving: Ref<boolean>
  modelDirty: Ref<boolean>
  ensureNotationRelationsAndRules: (notationId: string) => Promise<void>
  openDiagramId?: Ref<string | null | undefined>
  currentUserId?: Ref<string | null | undefined>
  /** false = для открытой диаграммы подставлять instances с сервера при pull (режим зрителя) */
  preserveOpenDiagramCanvasInstances?: Ref<boolean>
  /** Все сообщения по topic модели с совпадающим modelId (включая diagram_live и т.д.) */
  onModelTopicBroadcast?: (msg: Record<string, unknown>) => void
}): void {
  let inFlight = false
  let stompClient: Client | null = null
  let fallbackPollTimer: ReturnType<typeof setInterval> | null = null
  let wsConnected = false
  const modelChangedEventIdDeduper = createModelChangedEventIdDeduper()
  let stompPullCoalesceScheduled = false
  let wsAuthRefreshInFlight: Promise<boolean> | null = null

  const ensureWsAuthCookieFresh = async (): Promise<boolean> => {
    if (!wsAuthRefreshInFlight) {
      wsAuthRefreshInFlight = refreshAccessToken().finally(() => {
        wsAuthRefreshInFlight = null
      })
    }
    return wsAuthRefreshInFlight
  }

  const isWsEnabled = MODEL_LIVE_SYNC_MODE === "ws" || MODEL_LIVE_SYNC_MODE === "hybrid"
  const isPollEnabled = MODEL_LIVE_SYNC_MODE === "poll" || MODEL_LIVE_SYNC_MODE === "hybrid"

  const disconnectPush = (): void => {
    const c = stompClient
    stompClient = null
    wsConnected = false
    if (c) {
      void c.deactivate()
    }
  }

  const stopFallbackPoll = (): void => {
    if (fallbackPollTimer !== null) {
      clearInterval(fallbackPollTimer)
      fallbackPollTimer = null
    }
  }

  const startFallbackPoll = (): void => {
    if (!isPollEnabled) return
    if (!options.enabled.value || options.isLoading.value) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return
    if (fallbackPollTimer !== null) return
    fallbackPollTimer = setInterval(() => {
      void pullRemoteSnapshot({ reason: "poll_timer" })
    }, MODEL_LIVE_POLL_MS)
    void pullRemoteSnapshot({ reason: "poll_timer" })
  }

  const collectNotationIds = (diagrams: EditorDiagram[]): string[] => {
    const set = new Set<string>()
    for (const d of diagrams) {
      if (d._isDeleted) continue
      if (d.notationId) set.add(d.notationId)
    }
    return [...set]
  }

  const pullRemoteSnapshot = async (pullOpts?: PullSnapshotOptions): Promise<void> => {
    if (inFlight) return
    if (!options.enabled.value || options.isLoading.value) return
    if (!pullOpts?.ignoreSavingGuard && options.isSaving.value) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return

    // After loadModel we already have a full snapshot — skip connect/poll/resync churn.
    // Real remote changes (STOMP model_changed) must still pull.
    const reason = pullOpts?.reason
    const skipWhileFresh =
      reason === "session_resync" ||
      reason === "ws_connect" ||
      reason === "poll_timer" ||
      reason === "auth_refresh" ||
      reason === "visibility"
    if (skipWhileFresh && isModelEditorSnapshotFresh()) return

    inFlight = true
    if (pullOpts?.reason) {
      emitModelLiveSyncTelemetry({
        kind: "pull_trigger",
        modelId: mid,
        reason: pullOpts.reason,
      })
    }
    try {
      // Must page through the full collections — a single size=1000 page drops the rest
      // via mergeEntityListFromRemote and empties the tree after a large import.
      const [remoteNodes, remoteLinks, remoteDiagrams, modelRes] = await Promise.all([
        fetchAllByModelId<NodeResponse>('/nodes', mid),
        fetchAllByModelId<LinkResponse>('/links', mid),
        fetchAllByModelId<DiagramResponse>('/diagrams', mid),
        apiGet<ModelData>(`/models/${mid}`),
      ])

      if (!modelRes.success) {
        return
      }

      // Guard against stale results: if modelId changed while requests were in flight,
      // discard results to avoid overwriting the newly loaded model's state.
      if (options.modelId.value !== mid) return

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
        toEditorDiagram
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
        }
      }

      if (notationIds.length > 0) {
        const typesQuery = listParams()
        typesQuery.set("modelId", mid)
        for (const nid of notationIds) {
          typesQuery.append("notationId", nid)
        }
        const [ntRes, ltRes] = await Promise.all([
          apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${typesQuery.toString()}`),
          apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${typesQuery.toString()}`),
        ])
        if (ntRes.success) {
          options.state.value.nodeTypes = ntRes.data.content ?? []
        }
        if (ltRes.success) {
          options.state.value.linkTypes = ltRes.data.content ?? []
        }
      }
    } finally {
      inFlight = false
    }
  }

  const scheduleStompModelChangedPull = (): void => {
    if (stompPullCoalesceScheduled) {
      return
    }
    stompPullCoalesceScheduled = true
    queueMicrotask(() => {
      stompPullCoalesceScheduled = false
      void pullRemoteSnapshot({ ignoreSavingGuard: true, reason: "stomp_model_changed" })
    })
  }

  const connectPush = (): void => {
    disconnectPush()
    if (!isWsEnabled) return
    if (!options.enabled.value) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return
    if (!loadStoredUser()) return

    const url = buildModelSyncWsUrl()
    if (!url) return

    const client = new Client({
      brokerURL: url,
      reconnectDelay: STOMP_RECONNECT_DELAY_MS,
      heartbeatIncoming: STOMP_HEARTBEAT_INCOMING_MS,
      heartbeatOutgoing: STOMP_HEARTBEAT_OUTGOING_MS,
      beforeConnect: async () => {
        const refreshed = await ensureWsAuthCookieFresh()
        if (!refreshed) {
          client.deactivate()
        }
      },
      onConnect: () => {
        wsConnected = true
        stopFallbackPoll()
        client.subscribe(`/topic/models/${mid}`, message => {
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
            void coalesceModelSyncGranularEvents(parseGranularSyncEventsFromPayload(parsed.events))
            scheduleStompModelChangedPull()
          } catch {
            /* ignore malformed */
          }
        })
        void pullRemoteSnapshot({ ignoreSavingGuard: true, reason: "ws_connect" })
      },
      onDisconnect: () => {
        wsConnected = false
        if (options.enabled.value) {
          startFallbackPoll()
        }
      },
      onStompError: () => {
        wsConnected = false
        if (options.enabled.value) {
          startFallbackPoll()
        }
      },
      onWebSocketClose: () => {
        wsConnected = false
        void ensureWsAuthCookieFresh()
        if (options.enabled.value) {
          startFallbackPoll()
        }
      },
    })
    stompClient = client
    void client.activate()
    if (isPollEnabled) {
      startFallbackPoll()
    }
  }

  const resyncSession = (): void => {
    if (!options.enabled.value) {
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

    // connectPush triggers pullRemoteSnapshot in its onConnect callback,
    // so we only pull here if the tab is visible and WS is not being set up
    // (to avoid a duplicate pull when onConnect fires quickly).
    if (isWsEnabled) {
      connectPush()
    } else {
      disconnectPush()
    }
    if (isPollEnabled) {
      startFallbackPoll()
    } else {
      stopFallbackPoll()
    }

    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return
    }
    // The onConnect callback in connectPush also pulls — the inFlight guard
    // ensures only one pull runs at a time, so this is safe but may be redundant.
    // We keep it for the case where WS connection is slow or fails.
    void pullRemoteSnapshot({ reason: "session_resync" })
  }

  watch(
    () => [options.enabled.value, options.modelId.value] as const,
    () => {
      resyncSession()
    },
    { flush: "post", immediate: true }
  )

  const onDocumentVisibilityChange = (): void => {
    if (typeof document === "undefined") return
    if (document.visibilityState === "hidden") {
      if (MODEL_LIVE_SYNC_MODE === "hybrid") {
        stopFallbackPoll()
      }
      return
    }
    if (!options.enabled.value) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return
    if (isPollEnabled) {
      startFallbackPoll()
    }
    if (isWsEnabled && !wsConnected) {
      connectPush()
    }
    void pullRemoteSnapshot({ ignoreSavingGuard: true, reason: "visibility" })
  }

  const onAuthUpdated = (): void => {
    if (isWsEnabled) {
      connectPush()
    }
    if (isPollEnabled) {
      startFallbackPoll()
    }
    void pullRemoteSnapshot({ reason: "auth_refresh" })
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
