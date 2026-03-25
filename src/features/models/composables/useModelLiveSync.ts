import { Client } from "@stomp/stompjs"
import { onBeforeUnmount, watch, type Ref } from "vue"
import { buildModelSyncWsUrl } from "@/api/modelSyncWs"
import { apiGet } from "@/composables/useApi"
import {
  AUTH_CLEARED_EVENT,
  AUTH_UPDATED_EVENT,
  getAccessToken,
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
import { toEditorDiagram, toEditorLink, toEditorNode } from "./modelEditorMappers"

const FETCH_SIZE = 1000
const DEFAULT_FALLBACK_POLL_MS = 15_000

type ModelLiveSyncMode = "ws" | "poll" | "hybrid"

function parseModelLiveSyncMode(raw: string | undefined): ModelLiveSyncMode {
  const normalized = raw?.trim().toLowerCase()
  if (normalized === "ws" || normalized === "poll" || normalized === "hybrid") {
    return normalized
  }
  return "hybrid"
}

function parseModelLivePollMs(raw: string | undefined): number {
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
}

/**
 * Live sync по событию: STOMP `/topic/models/{modelId}` → один проход merge с API (ноды, связи, диаграммы, модель).
 * Режимы:
 * - ws: только STOMP + pull по событию
 * - poll: только периодический pull
 * - hybrid (default): STOMP primary + polling fallback при потере WS
 * Дополнительно: разовый pull при старте сессии (вкладка видима), после STOMP connect/reconnect,
 * при `model_changed`, при возврате на вкладку (догон после фона).
 * См. docs/plans/model-live-sync.md
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
      void pullRemoteSnapshot()
    }, MODEL_LIVE_POLL_MS)
    void pullRemoteSnapshot()
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

    inFlight = true
    try {
      const [nodesRes, linksRes, diagramsRes, modelRes] = await Promise.all([
        apiGet<PaginatedResponse<NodeResponse>>(
          `/nodes?modelId=${encodeURIComponent(mid)}&size=${FETCH_SIZE}`
        ),
        apiGet<PaginatedResponse<LinkResponse>>(
          `/links?modelId=${encodeURIComponent(mid)}&size=${FETCH_SIZE}`
        ),
        apiGet<PaginatedResponse<DiagramResponse>>(
          `/diagrams?modelId=${encodeURIComponent(mid)}&size=${FETCH_SIZE}`
        ),
        apiGet<ModelData>(`/models/${mid}`),
      ])

      if (
        !nodesRes.success ||
        !linksRes.success ||
        !diagramsRes.success ||
        !modelRes.success
      ) {
        return
      }

      // Guard against stale results: if modelId changed while requests were in flight,
      // discard results to avoid overwriting the newly loaded model's state.
      if (options.modelId.value !== mid) return

      const remoteNodes = nodesRes.data.content ?? []
      const remoteLinks = linksRes.data.content ?? []
      const remoteDiagrams = diagramsRes.data.content ?? []

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
        const typesQuery = new URLSearchParams({ size: String(FETCH_SIZE) })
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

  const connectPush = (): void => {
    disconnectPush()
    if (!isWsEnabled) return
    if (!options.enabled.value) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return
    const token = getAccessToken()
    if (!token) return

    const url = buildModelSyncWsUrl(token)
    if (!url) return

    const client = new Client({
      brokerURL: url,
      reconnectDelay: 5000,
      heartbeatIncoming: 15000,
      heartbeatOutgoing: 15000,
      onConnect: () => {
        wsConnected = true
        stopFallbackPoll()
        client.subscribe(`/topic/models/${mid}`, message => {
          try {
            const parsed = JSON.parse(message.body) as Record<string, unknown>
            if (typeof parsed.modelId !== "string" || parsed.modelId !== mid) {
              return
            }
            options.onModelTopicBroadcast?.(parsed)
            if (parsed.type !== "model_changed") {
              return
            }
            const self = options.currentUserId?.value
            if (self && parsed.actorUserId === self) {
              return
            }
            void pullRemoteSnapshot({ ignoreSavingGuard: true })
          } catch {
            /* ignore malformed */
          }
        })
        void pullRemoteSnapshot({ ignoreSavingGuard: true })
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
    void pullRemoteSnapshot()
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
    void pullRemoteSnapshot({ ignoreSavingGuard: true })
  }

  const onAuthUpdated = (): void => {
    if (isWsEnabled) {
      connectPush()
    }
    if (isPollEnabled) {
      startFallbackPoll()
    }
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
