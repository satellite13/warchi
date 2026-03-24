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
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from "../modelAttrs"
import type { EditorDiagram, EditorLink, EditorNode, ModelEditorState } from "../types"
import {
  mergeEntityListFromRemote,
  preserveOpenDiagramCanvasAfterRemoteMerge,
} from "../utils/modelEntityMerge"

const FETCH_SIZE = 1000

const toEditorNode = (row: NodeResponse): EditorNode => ({
  ...row,
  parsedAttrs: parseNodeAttrs(row.attrs ?? null),
})

const toEditorLink = (row: LinkResponse): EditorLink => ({
  ...row,
  parsedAttrs: parseLinkAttrs(row.attrs ?? null),
})

const toEditorDiagram = (row: DiagramResponse): EditorDiagram => ({
  ...row,
  parsedAttrs: parseDiagramAttrs(row.attrs ?? null),
})

type PullSnapshotOptions = {
  /** Push / переподключение / возврат на вкладку — не ждать окончания локального save. */
  ignoreSavingGuard?: boolean
}

/**
 * Live sync по событию: STOMP `/topic/models/{modelId}` → один проход merge с API (ноды, связи, диаграммы, модель).
 * Периодического poll нет. Разовый pull: при старте сессии (вкладка видима), после STOMP connect/reconnect,
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
}): void {
  let inFlight = false
  let stompClient: Client | null = null

  const disconnectPush = (): void => {
    const c = stompClient
    stompClient = null
    if (c) {
      void c.deactivate()
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

      if (!nodesRes.success || !linksRes.success || !diagramsRes.success) {
        return
      }

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
        nextDiagrams = preserveOpenDiagramCanvasAfterRemoteMerge(
          nextDiagrams,
          diagramsBefore,
          openId
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
        client.subscribe(`/topic/models/${mid}`, message => {
          try {
            const parsed = JSON.parse(message.body) as {
              type?: string
              modelId?: string
              actorUserId?: string
            }
            if (parsed.type !== "model_changed" || parsed.modelId !== mid) {
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
    })
    stompClient = client
    void client.activate()
  }

  const resyncSession = (): void => {
    if (!options.enabled.value) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return

    connectPush()

    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return
    }
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
    if (document.visibilityState === "hidden") return
    if (!options.enabled.value) return
    const mid = options.modelId.value
    if (!mid || typeof mid !== "string") return
    void pullRemoteSnapshot({ ignoreSavingGuard: true })
  }

  const onAuthUpdated = (): void => {
    connectPush()
  }

  const onAuthCleared = (): void => {
    disconnectPush()
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
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onDocumentVisibilityChange)
    }
    if (typeof window !== "undefined") {
      window.removeEventListener(AUTH_UPDATED_EVENT, onAuthUpdated)
      window.removeEventListener(AUTH_CLEARED_EVENT, onAuthCleared)
    }
  })
}
