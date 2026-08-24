import type { DiagramEdgeInstance, DiagramNodeInstance } from '../modelAttrs'

export const LIVE_CHUNK_MAX_BYTES = 400 * 1024

export type DiagramInstances = {
  nodes: DiagramNodeInstance[]
  edges: DiagramEdgeInstance[]
}

export type DiagramLiveEnvelope = {
  v: 1
  kind: 'patch' | 'snapshot-chunk'
  seq: number
  upsertNodes?: DiagramNodeInstance[]
  upsertEdges?: DiagramEdgeInstance[]
  removeNodeIds?: string[]
  removeEdgeIds?: string[]
  chunkIndex?: number
  chunkCount?: number
}

export type DiagramLivePatch = {
  upsertNodes: DiagramNodeInstance[]
  upsertEdges: DiagramEdgeInstance[]
  removeNodeIds: string[]
  removeEdgeIds: string[]
}

const instanceKey = (item: { id: string }): string => item.id
const fingerprint = (item: unknown): string => JSON.stringify(item)

export function isEmptyLivePatch(patch: DiagramLivePatch): boolean {
  return (
    patch.upsertNodes.length === 0 &&
    patch.upsertEdges.length === 0 &&
    patch.removeNodeIds.length === 0 &&
    patch.removeEdgeIds.length === 0
  )
}

export function diffDiagramInstances(
  previous: DiagramInstances,
  next: DiagramInstances
): DiagramLivePatch {
  const prevNodes = new Map(previous.nodes.map((n) => [instanceKey(n), n]))
  const prevEdges = new Map(previous.edges.map((e) => [instanceKey(e), e]))
  const nextNodeIds = new Set(next.nodes.map(instanceKey))
  const nextEdgeIds = new Set(next.edges.map(instanceKey))

  const upsertNodes = next.nodes.filter((n) => {
    const prev = prevNodes.get(n.id)
    return !prev || fingerprint(prev) !== fingerprint(n)
  })
  const upsertEdges = next.edges.filter((e) => {
    const prev = prevEdges.get(e.id)
    return !prev || fingerprint(prev) !== fingerprint(e)
  })
  const removeNodeIds = [...prevNodes.keys()].filter((id) => !nextNodeIds.has(id))
  const removeEdgeIds = [...prevEdges.keys()].filter((id) => !nextEdgeIds.has(id))
  return { upsertNodes, upsertEdges, removeNodeIds, removeEdgeIds }
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

type LiveChunkDraft = {
  upsertNodes: DiagramNodeInstance[]
  upsertEdges: DiagramEdgeInstance[]
  removeNodeIds: string[]
  removeEdgeIds: string[]
}

const draftHasUpsert = (draft: LiveChunkDraft): boolean =>
  draft.upsertNodes.length > 0 || draft.upsertEdges.length > 0

const draftHasPayload = (draft: LiveChunkDraft): boolean =>
  draftHasUpsert(draft) || draft.removeNodeIds.length > 0 || draft.removeEdgeIds.length > 0

export function chunkLiveEnvelope(
  envelope: DiagramLiveEnvelope,
  maxBytes: number
): DiagramLiveEnvelope[] {
  const upsertNodes = envelope.upsertNodes ?? []
  const upsertEdges = envelope.upsertEdges ?? []
  const removeNodeIds = envelope.removeNodeIds ?? []
  const removeEdgeIds = envelope.removeEdgeIds ?? []

  if (
    upsertNodes.length === 0 &&
    upsertEdges.length === 0 &&
    removeNodeIds.length === 0 &&
    removeEdgeIds.length === 0
  ) {
    return []
  }

  const measure = (draft: LiveChunkDraft): number =>
    utf8ByteLength(
      JSON.stringify({
        v: envelope.v,
        kind: envelope.kind,
        seq: envelope.seq,
        upsertNodes: draft.upsertNodes,
        upsertEdges: draft.upsertEdges,
        removeNodeIds: draft.removeNodeIds,
        removeEdgeIds: draft.removeEdgeIds,
        chunkIndex: 0,
        chunkCount: 1,
      })
    )

  const emptyDraft = (withRemoves: boolean): LiveChunkDraft => ({
    upsertNodes: [],
    upsertEdges: [],
    removeNodeIds: withRemoves ? [...removeNodeIds] : [],
    removeEdgeIds: withRemoves ? [...removeEdgeIds] : [],
  })

  const drafts: LiveChunkDraft[] = []
  let current = emptyDraft(true)

  const closeCurrent = (): void => {
    drafts.push(current)
    current = emptyDraft(false)
  }

  const addItem = (kind: 'node' | 'edge', item: DiagramNodeInstance | DiagramEdgeInstance): void => {
    const candidate: LiveChunkDraft = {
      upsertNodes:
        kind === 'node' ? [...current.upsertNodes, item as DiagramNodeInstance] : current.upsertNodes,
      upsertEdges:
        kind === 'edge' ? [...current.upsertEdges, item as DiagramEdgeInstance] : current.upsertEdges,
      removeNodeIds: current.removeNodeIds,
      removeEdgeIds: current.removeEdgeIds,
    }
    if (measure(candidate) > maxBytes && draftHasUpsert(current)) {
      closeCurrent()
      current = {
        upsertNodes: kind === 'node' ? [item as DiagramNodeInstance] : [],
        upsertEdges: kind === 'edge' ? [item as DiagramEdgeInstance] : [],
        removeNodeIds: [],
        removeEdgeIds: [],
      }
      return
    }
    current = candidate
  }

  for (const item of upsertNodes) {
    addItem('node', item)
  }
  for (const item of upsertEdges) {
    addItem('edge', item)
  }
  if (draftHasPayload(current)) {
    drafts.push(current)
  }

  return drafts.map((draft, index) => ({
    v: envelope.v,
    kind: envelope.kind,
    seq: envelope.seq,
    upsertNodes: draft.upsertNodes,
    upsertEdges: draft.upsertEdges,
    removeNodeIds: draft.removeNodeIds,
    removeEdgeIds: draft.removeEdgeIds,
    chunkIndex: index,
    chunkCount: drafts.length,
  }))
}
