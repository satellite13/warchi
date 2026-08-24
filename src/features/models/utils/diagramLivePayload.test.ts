import { describe, expect, it } from 'vitest'
import { diffDiagramInstances, isEmptyLivePatch } from './diagramLivePayload'
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
