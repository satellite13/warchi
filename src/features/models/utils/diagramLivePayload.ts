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
