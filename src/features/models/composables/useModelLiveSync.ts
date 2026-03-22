import { onBeforeUnmount, watch, type Ref } from "vue"
import { apiGet } from "@/composables/useApi"
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
import { mergeEntityListFromRemote } from "../utils/modelEntityMerge"

const DEFAULT_POLL_MS = 10_000
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

/**
 * MVP live sync: периодический poll узлов/связей/диаграмм и слияние в state без перезаписи локальных черновиков.
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
  pollIntervalMs?: number
  ensureNotationRelationsAndRules: (notationId: string) => Promise<void>
}): void {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS
  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  const stopPolling = (): void => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
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

  const pollOnce = async (): Promise<void> => {
    if (inFlight) return
    if (!options.enabled.value || options.isLoading.value || options.isSaving.value) return
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

      const nextNodes = mergeEntityListFromRemote(
        options.state.value.nodes,
        remoteNodes,
        toEditorNode
      )
      const nextLinks = mergeEntityListFromRemote(
        options.state.value.links,
        remoteLinks,
        toEditorLink
      )
      const nextDiagrams = mergeEntityListFromRemote(
        options.state.value.diagrams,
        remoteDiagrams,
        toEditorDiagram
      )

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

  const startPolling = (): void => {
    stopPolling()
    if (!options.enabled.value) return
    const mid = options.modelId.value
    if (!mid) return
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return
    }
    void pollOnce()
    timer = setInterval(() => {
      void pollOnce()
    }, pollIntervalMs)
  }

  watch(
    () => [options.enabled.value, options.modelId.value] as const,
    () => {
      startPolling()
    },
    { flush: "post", immediate: true }
  )

  const onDocumentVisibilityChange = (): void => {
    if (typeof document === "undefined") return
    if (document.visibilityState === "hidden") {
      stopPolling()
      return
    }
    startPolling()
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onDocumentVisibilityChange)
  }

  onBeforeUnmount(() => {
    stopPolling()
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onDocumentVisibilityChange)
    }
  })
}
