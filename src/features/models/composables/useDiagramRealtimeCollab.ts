import type { DiagramRenderer } from "@ngroznykh/papirus"
import { onBeforeUnmount, ref, watch, type Ref } from "vue"
import { apiDelete, apiPost } from "@/composables/useApi"
import type { DiagramAttrs } from "../modelAttrs"
import type { ModelEditorState } from "../types"

const POINTER_MIN_MS = 100
const LIVE_DEBOUNCE_MS = 220
const SPECTATE_PING_MS = 20_000

export type DiagramSpectatorEntry = {
  userId: string
  displayName: string
}

export type RemoteEditorPointer = {
  worldX: number
  worldY: number
  visible: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function parseSpectators(raw: unknown): DiagramSpectatorEntry[] {
  if (!Array.isArray(raw)) return []
  const out: DiagramSpectatorEntry[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const userId = item.userId
    const displayName = item.displayName
    if (typeof userId === "string" && typeof displayName === "string") {
      out.push({ userId, displayName })
    }
  }
  return out
}

/**
 * Эфир диаграммы (live + pointer) для держателя lock и приём для зрителя;
 * spectate-сессия и список зрителей для редактора.
 */
export function useDiagramRealtimeCollab(options: {
  state: Ref<ModelEditorState>
  selectedDiagramId: Ref<string | null>
  currentUserId: Ref<string | null | undefined>
  getDiagramRenderer: () => DiagramRenderer | null
  /** Держит lock на выбранной диаграмме */
  isLockHolder: Ref<boolean>
  /** Редактирование canvas заблокировано чужим lock */
  isSpectator: Ref<boolean>
}): {
  remoteEditorPointer: Ref<RemoteEditorPointer | null>
  diagramSpectators: Ref<DiagramSpectatorEntry[]>
  gestureDepth: Ref<number>
  onLiveCollaborationGesture: (phase: "block" | "unblock") => void
  scheduleDebouncedLivePush: () => void
  flushLivePushNow: () => void
  handleModelTopicBroadcast: (msg: Record<string, unknown>) => void
  onCanvasMouseMoveForPointer: (clientX: number, clientY: number) => void
  onCanvasMouseLeaveForPointer: () => void
} {
  const remoteEditorPointer = ref<RemoteEditorPointer | null>(null)
  const diagramSpectators = ref<DiagramSpectatorEntry[]>([])
  const gestureDepth = ref(0)

  let liveDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let pointerLastSent = 0
  let spectatePingTimer: ReturnType<typeof setInterval> | null = null
  let lastSpectateDiagramId: string | null = null

  const clearLiveDebounce = (): void => {
    if (liveDebounceTimer !== null) {
      clearTimeout(liveDebounceTimer)
      liveDebounceTimer = null
    }
  }

  const clearSpectatePing = (): void => {
    if (spectatePingTimer !== null) {
      clearInterval(spectatePingTimer)
      spectatePingTimer = null
    }
  }

  async function spectateLeave(diagramId: string): Promise<void> {
    clearSpectatePing()
    await apiDelete(`/diagram-locks/${diagramId}/spectate`)
  }

  async function spectateStart(diagramId: string): Promise<void> {
    clearSpectatePing()
    const res = await apiPost(`/diagram-locks/${diagramId}/spectate`, {})
    if (res.success) {
      spectatePingTimer = setInterval(() => {
        void apiPost(`/diagram-locks/${diagramId}/spectate/ping`, {})
      }, SPECTATE_PING_MS)
    }
  }

  watch(
    () => [options.isSpectator.value, options.selectedDiagramId.value] as const,
    async ([spectator, diagramId]) => {
      if (lastSpectateDiagramId && (lastSpectateDiagramId !== diagramId || !spectator)) {
        await spectateLeave(lastSpectateDiagramId)
        lastSpectateDiagramId = null
      }
      if (spectator && diagramId) {
        await spectateStart(diagramId)
        lastSpectateDiagramId = diagramId
      }
    },
    { flush: "post", immediate: true }
  )

  watch(
    () => options.isLockHolder.value,
    (holder) => {
      if (!holder) {
        diagramSpectators.value = []
      }
    }
  )

  watch(
    () => options.isSpectator.value,
    (spec) => {
      if (!spec) {
        remoteEditorPointer.value = null
      }
    }
  )

  onBeforeUnmount(() => {
    clearLiveDebounce()
    clearSpectatePing()
    if (lastSpectateDiagramId) {
      void spectateLeave(lastSpectateDiagramId)
      lastSpectateDiagramId = null
    }
  })

  function getOpenDiagramRow() {
    const id = options.selectedDiagramId.value
    if (!id) return null
    return options.state.value.diagrams.find((d) => d.id === id && !d._isDeleted) ?? null
  }

  function flushLivePushNow(): void {
    if (!options.isLockHolder.value) return
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return
    const diagram = getOpenDiagramRow()
    if (!diagram) return
    const instances = diagram.parsedAttrs.instances
    void apiPost(`/diagram-locks/${diagram.id}/live`, instances)
  }

  function scheduleDebouncedLivePush(): void {
    if (!options.isLockHolder.value) return
    if (gestureDepth.value > 0) return
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return
    clearLiveDebounce()
    liveDebounceTimer = setTimeout(() => {
      liveDebounceTimer = null
      flushLivePushNow()
    }, LIVE_DEBOUNCE_MS)
  }

  function onLiveCollaborationGesture(phase: "block" | "unblock"): void {
    if (phase === "block") {
      gestureDepth.value += 1
      clearLiveDebounce()
      return
    }
    gestureDepth.value = Math.max(0, gestureDepth.value - 1)
    if (gestureDepth.value === 0) {
      flushLivePushNow()
    }
  }

  function handleModelTopicBroadcast(msg: Record<string, unknown>): void {
    const type = msg.type
    const diagramId = typeof msg.diagramId === "string" ? msg.diagramId : null
    const self = options.currentUserId.value

    if (type === "diagram_pointer") {
      if (!options.isSpectator.value) {
        return
      }
      if (!diagramId || diagramId !== options.selectedDiagramId.value) return
      const actor = typeof msg.actorUserId === "string" ? msg.actorUserId : null
      if (self && actor === self) return
      const visible = msg.visible !== false
      const wx = Number(msg.worldX)
      const wy = Number(msg.worldY)
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) return
      remoteEditorPointer.value = { worldX: wx, worldY: wy, visible }
      return
    }

    if (type === "diagram_live") {
      if (!options.isSpectator.value) return
      if (!diagramId || diagramId !== options.selectedDiagramId.value) return
      const actor = typeof msg.actorUserId === "string" ? msg.actorUserId : null
      if (self && actor === self) return
      const inst = msg.instances
      if (!isRecord(inst)) return
      const nodes = inst.nodes
      const edges = inst.edges
      if (!Array.isArray(nodes) || !Array.isArray(edges)) return
      const nextInstances = { nodes, edges } as DiagramAttrs["instances"]
      const diagrams = options.state.value.diagrams
      const idx = diagrams.findIndex((d) => d.id === diagramId && !d._isDeleted)
      if (idx < 0) return
      const row = diagrams[idx]!
      if (row._isDirty || row._isNew || row._isDeleted) return
      const nextDiagrams = [...diagrams]
      nextDiagrams[idx] = {
        ...row,
        parsedAttrs: {
          ...row.parsedAttrs,
          instances: structuredClone(nextInstances),
        },
      }
      options.state.value.diagrams = nextDiagrams
      return
    }

    if (type === "diagram_spectators") {
      if (!options.isLockHolder.value) return
      if (!diagramId || diagramId !== options.selectedDiagramId.value) return
      diagramSpectators.value = parseSpectators(msg.viewers)
    }
  }

  function onCanvasMouseMoveForPointer(clientX: number, clientY: number): void {
    if (!options.isLockHolder.value) return
    const diagram = getOpenDiagramRow()
    if (!diagram) return
    const renderer = options.getDiagramRenderer()
    if (!renderer) return
    const now = Date.now()
    if (now - pointerLastSent < POINTER_MIN_MS) return
    pointerLastSent = now
    const w = renderer.screenToWorld(clientX, clientY)
    void apiPost(`/diagram-locks/${diagram.id}/pointer`, {
      worldX: w.x,
      worldY: w.y,
      visible: true,
    })
  }

  function onCanvasMouseLeaveForPointer(): void {
    if (!options.isLockHolder.value) return
    const diagram = getOpenDiagramRow()
    if (!diagram) return
    void apiPost(`/diagram-locks/${diagram.id}/pointer`, {
      worldX: 0,
      worldY: 0,
      visible: false,
    })
  }

  return {
    remoteEditorPointer,
    diagramSpectators,
    gestureDepth,
    onLiveCollaborationGesture,
    scheduleDebouncedLivePush,
    flushLivePushNow,
    handleModelTopicBroadcast,
    onCanvasMouseMoveForPointer,
    onCanvasMouseLeaveForPointer,
  }
}
