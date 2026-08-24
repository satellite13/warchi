import type { DiagramEdgeInstance, DiagramNodeInstance } from '../modelAttrs'
import type { DiagramInstances, DiagramLiveEnvelope } from './diagramLivePayload'

export type LiveSnapshotBuffer = {
  seq: number | null
  chunks: Map<number, DiagramLiveEnvelope>
}

export function createLiveSnapshotBuffer(): LiveSnapshotBuffer {
  return { seq: null, chunks: new Map() }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const upsertById = <T extends { id: string }>(items: T[], incoming: T[]): T[] => {
  const next = [...items]
  for (const item of incoming) {
    const index = next.findIndex((current) => current.id === item.id)
    if (index >= 0) {
      next[index] = item
    } else {
      next.push(item)
    }
  }
  return next
}

const applyPatch = (current: DiagramInstances, envelope: DiagramLiveEnvelope): DiagramInstances => {
  const removeNodeIds = new Set(envelope.removeNodeIds ?? [])
  const removeEdgeIds = new Set(envelope.removeEdgeIds ?? [])
  const nodes = upsertById(
    current.nodes.filter((node) => !removeNodeIds.has(node.id)),
    envelope.upsertNodes ?? []
  )
  const edges = upsertById(
    current.edges.filter((edge) => !removeEdgeIds.has(edge.id)),
    envelope.upsertEdges ?? []
  )
  return { nodes, edges }
}

const collectSnapshot = (
  chunks: Map<number, DiagramLiveEnvelope>,
  chunkCount: number
): DiagramInstances => {
  const nodes: DiagramNodeInstance[] = []
  const edges: DiagramEdgeInstance[] = []
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = chunks.get(index)
    if (chunk?.upsertNodes) {
      nodes.push(...chunk.upsertNodes)
    }
    if (chunk?.upsertEdges) {
      edges.push(...chunk.upsertEdges)
    }
  }
  return { nodes, edges }
}

export function applyDiagramLiveMessage(
  current: DiagramInstances,
  raw: unknown,
  buffer: LiveSnapshotBuffer
): DiagramInstances | null {
  if (!isRecord(raw)) {
    return null
  }
  if (raw.kind === 'patch') {
    return applyPatch(current, raw as DiagramLiveEnvelope)
  }
  if (raw.kind === 'snapshot-chunk') {
    const envelope = raw as DiagramLiveEnvelope
    const chunkIndex = envelope.chunkIndex ?? 0
    const chunkCount = envelope.chunkCount ?? 1
    if (envelope.seq !== buffer.seq) {
      buffer.chunks.clear()
      buffer.seq = envelope.seq
    }
    buffer.chunks.set(chunkIndex, envelope)
    if (buffer.chunks.size === chunkCount) {
      const next = collectSnapshot(buffer.chunks, chunkCount)
      buffer.chunks.clear()
      buffer.seq = null
      return next
    }
    return null
  }
  if (Array.isArray(raw.nodes) && Array.isArray(raw.edges)) {
    return {
      nodes: raw.nodes as DiagramNodeInstance[],
      edges: raw.edges as DiagramEdgeInstance[],
    }
  }
  return null
}
