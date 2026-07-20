import { describe, expect, it } from 'vitest'
import {
  findOrphanEdgeAnchorInstanceIds,
  placeEdgeAnchorAtMidpoint,
  removeOrphanEdgeAnchors,
  syncEdgeAnchorPositions,
} from './edgeAnchorSync'
import { EDGE_ANCHOR_SIZE } from './diagramOnlyInstances'

describe('edgeAnchorSync', () => {
  it('places anchor so its center matches midpoint', () => {
    const placed = placeEdgeAnchorAtMidpoint(
      {
        id: 'a1',
        modelNodeId: '__diagram-edge-anchor__:a1',
        x: 0,
        y: 0,
        attrs: { isEdgeAnchor: true, hostEdgeInstanceId: 'e1' },
      },
      { x: 100, y: 50 }
    )
    expect(placed.x).toBe(100 - EDGE_ANCHOR_SIZE / 2)
    expect(placed.y).toBe(50 - EDGE_ANCHOR_SIZE / 2)
    expect(placed.width).toBe(EDGE_ANCHOR_SIZE)
    expect(placed.height).toBe(EDGE_ANCHOR_SIZE)
  })

  it('syncs positions for anchors with known host midpoints', () => {
    const { nodes, changed } = syncEdgeAnchorPositions(
      [
        {
          id: 'a1',
          modelNodeId: '__diagram-edge-anchor__:a1',
          x: 0,
          y: 0,
          attrs: { isEdgeAnchor: true, hostEdgeInstanceId: 'e1' },
        },
        { id: 'n1', modelNodeId: 'node-1', x: 10, y: 10 },
      ],
      new Map([['e1', { x: 40, y: 60 }]])
    )
    expect(changed).toBe(true)
    expect(nodes[0]?.x).toBe(40 - EDGE_ANCHOR_SIZE / 2)
    expect(nodes[0]?.y).toBe(60 - EDGE_ANCHOR_SIZE / 2)
    expect(nodes[1]?.x).toBe(10)
  })

  it('removes orphan anchors and attached edges', () => {
    const attrs = {
      instances: {
        nodes: [
          {
            id: 'a1',
            modelNodeId: '__diagram-edge-anchor__:a1',
            x: 0,
            y: 0,
            attrs: { isEdgeAnchor: true, hostEdgeInstanceId: 'missing' },
          },
          { id: 'n1', modelNodeId: 'node-1', x: 1, y: 1 },
        ],
        edges: [
          {
            id: 'edge-1',
            modelLinkId: '__diagram-note-edge__:1',
            sourceInstanceId: 'n1',
            targetInstanceId: 'a1',
            attrs: { isDiagramOnly: true },
          },
        ],
      },
    }
    expect(findOrphanEdgeAnchorInstanceIds(attrs)).toEqual(['a1'])
    const cleaned = removeOrphanEdgeAnchors(attrs)
    expect(cleaned.changed).toBe(true)
    expect(cleaned.removedAnchorIds).toEqual(['a1'])
    expect(cleaned.nextAttrs.instances.nodes).toHaveLength(1)
    expect(cleaned.nextAttrs.instances.edges).toHaveLength(0)
  })
})
