import { describe, expect, it } from 'vitest'
import { parseDiagramAttrs } from '../modelAttrs'
import {
  BOUNDARY_SNAP_DISTANCE,
  guestCenter,
  listBoundaryLinksToGuest,
  pickNearestOutlineHost,
  placeGuestCenterAt,
  retargetBoundaryEdges,
  shouldHideBoundaryEdge,
} from './boundaryAttach'

describe('boundaryAttach helpers', () => {
  it('places the guest so its center sits on the outline point', () => {
    const guest = { x: 0, y: 0, width: 20, height: 10 }
    placeGuestCenterAt(guest, { x: 100, y: 50 })
    expect(guestCenter(guest)).toEqual({ x: 100, y: 50 })
    expect(guest).toMatchObject({ x: 90, y: 45 })
  })

  it('picks the closest host within the snap radius', () => {
    const picked = pickNearestOutlineHost({ x: 10, y: 10 }, [
      { id: 'far', point: { x: 80, y: 10 }, param: 0.2 },
      { id: 'near', point: { x: 18, y: 10 }, param: 0.4 },
    ])
    expect(picked).toMatchObject({ id: 'near', param: 0.4 })
  })

  it('returns null when every host is farther than the snap distance', () => {
    expect(
      pickNearestOutlineHost(
        { x: 0, y: 0 },
        [{ id: 'host', point: { x: BOUNDARY_SNAP_DISTANCE + 1, y: 0 }, param: 0 }],
      ),
    ).toBeNull()
  })

  it('hides a boundary edge only while the guest is attached to one of its ends', () => {
    expect(
      shouldHideBoundaryEdge({
        sourceInstanceId: 'host',
        targetInstanceId: 'guest',
        attach: { hostInstanceId: 'host', param: 0.1 },
      }),
    ).toBe(true)
    expect(
      shouldHideBoundaryEdge({
        sourceInstanceId: 'host',
        targetInstanceId: 'guest',
        attach: { hostInstanceId: 'other', param: 0.1 },
      }),
    ).toBe(false)
    expect(
      shouldHideBoundaryEdge({
        sourceInstanceId: 'host',
        targetInstanceId: 'guest',
        attach: undefined,
      }),
    ).toBe(false)
  })

  it('round-trips boundaryAttach on diagram node attrs', () => {
    const parsed = parseDiagramAttrs(
      JSON.stringify({
        instances: {
          nodes: [
            {
              id: 'guest',
              modelNodeId: 'node',
              x: 1,
              y: 2,
              attrs: { boundaryAttach: { hostInstanceId: 'host', param: 0.25 } },
            },
          ],
          edges: [],
        },
      }),
    )
    expect(parsed.instances.nodes[0]?.attrs?.boundaryAttach).toEqual({
      hostInstanceId: 'host',
      param: 0.25,
    })
  })

  it('lists and retargets an existing boundary link onto a new host', () => {
    const links = [
      {
        id: 'keep',
        sourceId: 'host-a',
        targetId: 'guest',
        parsedAttrs: { notationRelations: { n1: { relationId: 'rel-boundary' } } },
      },
      {
        id: 'other',
        sourceId: 'host-a',
        targetId: 'guest',
        parsedAttrs: { notationRelations: { n1: { relationId: 'rel-group' } } },
      },
    ]
    const found = listBoundaryLinksToGuest({
      links,
      boundaryRelationIds: new Set(['rel-boundary']),
      notationId: 'n1',
      guestModelNodeId: 'guest',
      hostModelNodeId: 'host-a',
    })
    expect(found.map(link => link.id)).toEqual(['keep'])

    const edges = [
      { modelLinkId: 'keep', sourceInstanceId: 'inst-a', targetInstanceId: 'inst-guest' },
    ]
    expect(
      retargetBoundaryEdges({
        edges,
        linkIds: new Set(['keep']),
        guestInstanceId: 'inst-guest',
        newHostInstanceId: 'inst-b',
      }),
    ).toBe(true)
    expect(edges[0]).toMatchObject({
      sourceInstanceId: 'inst-b',
      targetInstanceId: 'inst-guest',
    })
  })

  it('drops invalid boundaryAttach payloads', () => {
    const parsed = parseDiagramAttrs(
      JSON.stringify({
        instances: {
          nodes: [
            {
              id: 'guest',
              modelNodeId: 'node',
              x: 0,
              y: 0,
              attrs: { boundaryAttach: { hostInstanceId: '', param: 1 } },
            },
          ],
          edges: [],
        },
      }),
    )
    expect(parsed.instances.nodes[0]?.attrs?.boundaryAttach).toBeUndefined()
  })
})
