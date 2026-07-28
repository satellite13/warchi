import { describe, expect, it } from 'vitest'
import { buildEdgeAnchorLookup, resolveDiagramEdgeEndpoint } from './resolveDiagramEdgeEndpoint'

describe('resolveDiagramEdgeEndpoint', () => {
  it('maps edge-anchor instances to host edge path params', () => {
    const lookup = buildEdgeAnchorLookup([
      {
        id: 'a1',
        modelNodeId: '__diagram-edge-anchor__:a1',
        x: 0,
        y: 0,
        attrs: { isEdgeAnchor: true, hostEdgeInstanceId: 'host-1', pathParam: 0.25 },
      },
    ])
    expect(
      resolveDiagramEdgeEndpoint({
        instanceId: 'a1',
        papNodeId: 'instance-a1',
        anchorLookup: lookup,
        hostEdgeExists: () => true,
      })
    ).toEqual({ edgeId: 'edge-host-1', pathParam: 0.25 })
  })

  it('keeps normal node endpoints', () => {
    expect(
      resolveDiagramEdgeEndpoint({
        instanceId: 'n1',
        papNodeId: 'instance-n1',
        outlineParam: 0.3,
        anchorLookup: new Map(),
        hostEdgeExists: () => true,
      })
    ).toEqual({ nodeId: 'instance-n1', outlineParam: 0.3 })
  })

  it('prefers portId over stale outlineParam', () => {
    expect(
      resolveDiagramEdgeEndpoint({
        instanceId: 'n1',
        papNodeId: 'instance-n1',
        outlineParam: 0.3,
        portId: 'anchor:right:1',
        anchorLookup: new Map(),
        hostEdgeExists: () => true,
      })
    ).toEqual({ nodeId: 'instance-n1', portId: 'anchor:right:1' })
  })
})
