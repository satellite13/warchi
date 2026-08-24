import { describe, expect, it } from 'vitest'
import {
  chunkLiveEnvelope,
  diffDiagramInstances,
  isEmptyLivePatch,
  utf8ByteLength,
} from './diagramLivePayload'
import type { DiagramEdgeInstance, DiagramNodeInstance } from '../modelAttrs'

const node = (id: string, x: number): DiagramNodeInstance => ({
  id,
  modelNodeId: `m-${id}`,
  x,
  y: 0,
})
const edge = (id: string): DiagramEdgeInstance => ({
  id,
  modelLinkId: `l-${id}`,
  sourceInstanceId: 'a',
  targetInstanceId: 'b',
})

describe('diffDiagramInstances', () => {
  it('returns empty patch when snapshots match', () => {
    const snap = { nodes: [node('n1', 1)], edges: [edge('e1')] }
    const patch = diffDiagramInstances(snap, structuredClone(snap))
    expect(isEmptyLivePatch(patch)).toBe(true)
  })

  it('upserts changed and added instances and lists removals', () => {
    const previous = { nodes: [node('n1', 1), node('gone', 0)], edges: [edge('e1')] }
    const next = { nodes: [node('n1', 9), node('n2', 2)], edges: [edge('e2')] }
    expect(diffDiagramInstances(previous, next)).toEqual({
      upsertNodes: [node('n1', 9), node('n2', 2)],
      upsertEdges: [edge('e2')],
      removeNodeIds: ['gone'],
      removeEdgeIds: ['e1'],
    })
  })
})

describe('chunkLiveEnvelope', () => {
  it('keeps a small patch as a single envelope', () => {
    const chunks = chunkLiveEnvelope(
      {
        v: 1,
        kind: 'patch',
        seq: 3,
        upsertNodes: [node('n1', 1)],
        upsertEdges: [],
        removeNodeIds: ['gone'],
        removeEdgeIds: [],
      },
      4_000
    )
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ kind: 'patch', seq: 3, chunkIndex: 0, chunkCount: 1 })
    expect(chunks[0]?.removeNodeIds).toEqual(['gone'])
  })

  it('splits upserts so each packet stays under the byte budget', () => {
    const upsertNodes = Array.from({ length: 40 }, (_, i) =>
      node(`n-${String(i).padStart(3, '0')}`, i)
    )
    const chunks = chunkLiveEnvelope(
      {
        v: 1,
        kind: 'snapshot-chunk',
        seq: 1,
        upsertNodes,
        upsertEdges: [],
        removeNodeIds: [],
        removeEdgeIds: [],
      },
      800
    )
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => utf8ByteLength(JSON.stringify(c)) <= 800)).toBe(true)
    expect(chunks.every((c) => c.chunkCount === chunks.length)).toBe(true)
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i))
    expect(chunks.flatMap((c) => c.upsertNodes ?? [])).toHaveLength(40)
  })
})
