import { describe, expect, it } from 'vitest'
import { applyDiagramLiveMessage, createLiveSnapshotBuffer } from './applyDiagramLiveMessage'
import type { DiagramLiveEnvelope } from './diagramLivePayload'
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

describe('applyDiagramLiveMessage', () => {
  it('replaces instances for legacy { nodes, edges }', () => {
    const current = { nodes: [node('old', 0)], edges: [] }
    const next = applyDiagramLiveMessage(
      current,
      { nodes: [node('n1', 1)], edges: [edge('e1')] },
      createLiveSnapshotBuffer()
    )
    expect(next?.nodes).toEqual([node('n1', 1)])
    expect(next?.edges).toEqual([edge('e1')])
  })

  it('merges a patch onto current instances', () => {
    const current = { nodes: [node('n1', 1), node('gone', 0)], edges: [edge('e1')] }
    const envelope: DiagramLiveEnvelope = {
      v: 1,
      kind: 'patch',
      seq: 2,
      upsertNodes: [node('n1', 9)],
      removeNodeIds: ['gone'],
      upsertEdges: [edge('e2')],
      removeEdgeIds: ['e1'],
    }
    const next = applyDiagramLiveMessage(current, envelope, createLiveSnapshotBuffer())
    expect(next?.nodes.map((n) => n.id).sort()).toEqual(['n1'])
    expect(next?.nodes[0]?.x).toBe(9)
    expect(next?.edges.map((e) => e.id)).toEqual(['e2'])
  })

  it('replaces only after all snapshot chunks arrive', () => {
    const current = { nodes: [node('stale', 0)], edges: [] }
    const buffer = createLiveSnapshotBuffer()
    const chunk0: DiagramLiveEnvelope = {
      v: 1,
      kind: 'snapshot-chunk',
      seq: 7,
      chunkIndex: 0,
      chunkCount: 2,
      upsertNodes: [node('n1', 1)],
    }
    const chunk1: DiagramLiveEnvelope = {
      v: 1,
      kind: 'snapshot-chunk',
      seq: 7,
      chunkIndex: 1,
      chunkCount: 2,
      upsertEdges: [edge('e1')],
    }
    expect(applyDiagramLiveMessage(current, chunk0, buffer)).toBeNull()
    const next = applyDiagramLiveMessage(current, chunk1, buffer)
    expect(next).toEqual({ nodes: [node('n1', 1)], edges: [edge('e1')] })
  })

  it('drops a previous incomplete snapshot when seq changes', () => {
    const current = { nodes: [node('keep', 0)], edges: [] }
    const buffer = createLiveSnapshotBuffer()
    applyDiagramLiveMessage(
      current,
      {
        v: 1,
        kind: 'snapshot-chunk',
        seq: 1,
        chunkIndex: 0,
        chunkCount: 2,
        upsertNodes: [node('a', 1)],
      },
      buffer
    )
    const next = applyDiagramLiveMessage(
      current,
      {
        v: 1,
        kind: 'snapshot-chunk',
        seq: 2,
        chunkIndex: 0,
        chunkCount: 1,
        upsertNodes: [node('b', 2)],
      },
      buffer
    )
    expect(next).toEqual({ nodes: [node('b', 2)], edges: [] })
  })
})
