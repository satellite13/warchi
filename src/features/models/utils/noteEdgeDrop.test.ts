import { describe, expect, it } from 'vitest'
import { pickNearestEdgeForDrop } from './noteEdgeDrop'

describe('pickNearestEdgeForDrop', () => {
  const groupId = 'instance-group'
  const center = { x: 140, y: 100 }

  it('picks a visible polyline that crosses the group even when it is not incident', () => {
    const picked = pickNearestEdgeForDrop({
      targetPapNodeId: groupId,
      targetCenter: center,
      dropPoint: { x: 160, y: 80 },
      maxDistance: 56,
      edges: [
        {
          instanceEdgeId: 'crossing',
          fromPapNodeId: 'instance-validate',
          toPapNodeId: 'instance-end-error',
          path: [
            { x: 80, y: 80 },
            { x: 240, y: 80 },
          ],
        },
      ],
    })
    expect(picked?.instanceEdgeId).toBe('crossing')
    expect(picked?.pathParam).toBeCloseTo(0.5, 1)
  })

  it('returns null when the nearest path is farther than maxDistance', () => {
    expect(
      pickNearestEdgeForDrop({
        targetPapNodeId: groupId,
        targetCenter: center,
        dropPoint: { x: 180, y: 100 },
        maxDistance: 10,
        edges: [
          {
            instanceEdgeId: 'other',
            fromPapNodeId: 'instance-a',
            toPapNodeId: 'instance-b',
            path: [
              { x: 10, y: 10 },
              { x: 20, y: 10 },
            ],
          },
        ],
      })
    ).toBeNull()
  })

  it('picks the relation that leaves the group only when the drop is on that stroke', () => {
    const picked = pickNearestEdgeForDrop({
      targetPapNodeId: groupId,
      targetCenter: center,
      dropPoint: { x: 250, y: 100 },
      maxDistance: 40,
      edges: [
        {
          instanceEdgeId: 'host',
          fromPapNodeId: groupId,
          toPapNodeId: 'instance-other',
          path: [
            { x: 240, y: 100 },
            { x: 320, y: 100 },
          ],
        },
      ],
    })
    expect(picked?.instanceEdgeId).toBe('host')
    expect(picked?.pathParam).toBeCloseTo(0.125)
  })

  it('does not steal a distant exit relation from an empty group fill', () => {
    expect(
      pickNearestEdgeForDrop({
        targetPapNodeId: groupId,
        targetCenter: center,
        dropPoint: { x: 180, y: 100 },
        maxDistance: 40,
        edges: [
          {
            instanceEdgeId: 'host',
            fromPapNodeId: groupId,
            toPapNodeId: 'instance-other',
            path: [
              { x: 240, y: 100 },
              { x: 320, y: 100 },
            ],
          },
        ],
      })
    ).toBeNull()
  })

  it('picks the nearer of two outgoing relations', () => {
    const picked = pickNearestEdgeForDrop({
      targetPapNodeId: groupId,
      targetCenter: center,
      dropPoint: { x: 145, y: 150 },
      edges: [
        {
          instanceEdgeId: 'right',
          fromPapNodeId: groupId,
          toPapNodeId: 'instance-right',
          path: [
            { x: 240, y: 100 },
            { x: 320, y: 100 },
          ],
        },
        {
          instanceEdgeId: 'bottom',
          fromPapNodeId: groupId,
          toPapNodeId: 'instance-bottom',
          path: [
            { x: 140, y: 160 },
            { x: 140, y: 220 },
          ],
        },
      ],
    })
    expect(picked?.instanceEdgeId).toBe('bottom')
  })
})
