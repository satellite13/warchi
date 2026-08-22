import { describe, expect, it } from 'vitest'

import type { DiagramAttrs } from '../modelAttrs'
import {
  applyEditablePolylineControlPointChangesToDiagram,
  applyNodeAndEditablePolylineChangesToDiagram,
  persistHistoryRendererLayout,
} from './diagramCanvasSync'

describe('diagramCanvasSync', () => {
  it('atomically applies node positions and editable polyline control points', () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [{ id: 'inst-1', modelNodeId: 'node-1', x: 10, y: 20, width: 120, height: 60 }],
        edges: [
          {
            id: 'edge-inst-1',
            modelLinkId: 'link-1',
            sourceInstanceId: 'inst-1',
            targetInstanceId: 'inst-2',
            attrs: {
              controlPoints: [{ x: 100, y: 100 }],
            },
          },
        ],
      },
    }

    const nodeRefs = new Map([['instance-inst-1', { instanceId: 'inst-1' }]])
    const edgeRefs = new Map([['edge-edge-inst-1', { edgeId: 'edge-inst-1' }]])

    const result = applyNodeAndEditablePolylineChangesToDiagram(
      diagram,
      ['instance-inst-1'],
      nodeRefs,
      edgeRefs,
      () => ({ x: 210, y: 320, width: 180, height: 90 }),
      () => ({ type: 'editable-polyline', controlPoints: [{ x: 310, y: 410 }] })
    )

    expect(result).toEqual({ nodeChanged: true, controlPointsChanged: true })
    expect(diagram.instances.nodes[0]).toMatchObject({ x: 210, y: 320, width: 180, height: 90 })
    expect(diagram.instances.edges[0]?.attrs).toMatchObject({
      controlPoints: [{ x: 310, y: 410 }],
    })
  })

  it('removes stale controlPoints when editable polyline has none', () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [],
        edges: [
          {
            id: 'edge-inst-1',
            modelLinkId: 'link-1',
            sourceInstanceId: 'inst-1',
            targetInstanceId: 'inst-2',
            attrs: {
              controlPoints: [{ x: 100, y: 100 }],
            },
          },
        ],
      },
    }

    const edgeRefs = new Map([['edge-edge-inst-1', { edgeId: 'edge-inst-1' }]])
    const changed = applyEditablePolylineControlPointChangesToDiagram(
      diagram,
      edgeRefs,
      () => ({ type: 'editable-polyline', controlPoints: [] })
    )

    expect(changed).toBe(true)
    expect(diagram.instances.edges[0]?.attrs).toBeUndefined()
  })

  it('persists undone node positions and control points in one snapshot', () => {
    const source: DiagramAttrs = {
      instances: {
        nodes: [{ id: 'inst-1', modelNodeId: 'node-1', x: 210, y: 320, width: 120, height: 60 }],
        edges: [
          {
            id: 'edge-inst-1',
            modelLinkId: 'link-1',
            sourceInstanceId: 'inst-1',
            targetInstanceId: 'inst-2',
            attrs: {
              controlPoints: [{ x: 310, y: 410 }],
            },
          },
        ],
      },
    }

    const nodeRefs = new Map([['instance-inst-1', { instanceId: 'inst-1' }]])
    const edgeRefs = new Map([['edge-edge-inst-1', { edgeId: 'edge-inst-1' }]])

    const result = persistHistoryRendererLayout({
      source,
      papNodeIds: ['instance-inst-1'],
      nodeIdToInstance: nodeRefs,
      edgeIdToInstance: edgeRefs,
      getNodeByPapId: () => ({ x: 10, y: 20, width: 120, height: 60 }),
      getEdgeByPapId: () => ({
        type: 'editable-polyline',
        controlPoints: [{ x: 100, y: 100 }],
      }),
    })

    expect(result.changed).toBe(true)
    expect(result.next.instances.nodes[0]).toMatchObject({ x: 10, y: 20 })
    expect(result.next.instances.edges[0]?.attrs).toMatchObject({
      controlPoints: [{ x: 100, y: 100 }],
    })
    expect(source.instances.nodes[0]?.x).toBe(210)
    expect(source.instances.edges[0]?.attrs).toMatchObject({
      controlPoints: [{ x: 310, y: 410 }],
    })
  })
})
