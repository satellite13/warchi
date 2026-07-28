import { describe, expect, it } from 'vitest'
import {
  applyElkLayout,
  buildElkGraph,
  buildCompoundParentMap,
  nodeBounds,
  type LayoutNode,
} from './diagramLayoutGraph'
import type { DiagramAttrs } from '../modelAttrs'

const n = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number
): LayoutNode => ({ id, x, y, width: w, height: h })

describe('nodeBounds', () => {
  it('uses defaults when width/height missing', () => {
    expect(nodeBounds({ id: 'a', x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 160,
      height: 90,
    })
  })
})

describe('buildCompoundParentMap', () => {
  it('assigns smallest-area fully containing parent', () => {
    const nodes = [
      n('outer', 0, 0, 400, 300),
      n('inner', 20, 20, 200, 200),
      n('child', 40, 40, 40, 40),
    ]
    const parent = buildCompoundParentMap(nodes, new Set(['outer', 'inner', 'child']))
    expect(parent.get('child')).toBe('inner')
    expect(parent.get('inner')).toBe('outer')
    expect(parent.get('outer')).toBeUndefined()
  })

  it('ignores parents outside scope', () => {
    const nodes = [n('outer', 0, 0, 400, 300), n('child', 40, 40, 40, 40)]
    const parent = buildCompoundParentMap(nodes, new Set(['child']))
    expect(parent.get('child')).toBeUndefined()
  })

  it('requires full containment, not partial overlap', () => {
    const nodes = [n('a', 0, 0, 100, 100), n('b', 80, 80, 50, 50)]
    const parent = buildCompoundParentMap(nodes, new Set(['a', 'b']))
    expect(parent.get('b')).toBeUndefined()
  })
})

describe('buildElkGraph', () => {
  it('nests children and keeps relative edges only inside scope', () => {
    const nodes = [
      n('outer', 0, 0, 400, 300),
      n('a', 40, 40, 80, 40),
      n('b', 40, 120, 80, 40),
      n('out', 500, 0, 80, 40),
    ]
    const edges = [
      { id: 'e1', sourceInstanceId: 'a', targetInstanceId: 'b' },
      { id: 'e2', sourceInstanceId: 'a', targetInstanceId: 'out' },
    ]
    const graph = buildElkGraph(nodes, edges, {
      scopeIds: new Set(['outer', 'a', 'b']),
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.edgeRouting': 'ORTHOGONAL',
      },
    })
    expect(graph.id).toBe('root')
    expect(graph.layoutOptions?.['elk.algorithm']).toBe('layered')
    const outer = graph.children?.find(c => c.id === 'outer')
    expect(outer?.children?.map(c => c.id).sort()).toEqual(['a', 'b'])
    expect(outer).toMatchObject({ x: 0, y: 0 })
    const childA = outer?.children?.find(c => c.id === 'a')
    const childB = outer?.children?.find(c => c.id === 'b')
    expect(childA).toMatchObject({ x: 40, y: 40 })
    expect(childB).toMatchObject({ x: 40, y: 120 })
    expect(graph.edges?.map(e => e.id)).toEqual(['e1'])
  })
})

describe('applyElkLayout', () => {
  it('writes node positions and edge controlPoints for scoped elements only', () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 0, y: 100, width: 80, height: 40 },
          { id: 'c', modelNodeId: 'm3', x: 900, y: 900, width: 80, height: 40 },
        ],
        edges: [
          { id: 'e1', modelLinkId: 'l1', sourceInstanceId: 'a', targetInstanceId: 'b' },
          {
            id: 'e2',
            modelLinkId: 'l2',
            sourceInstanceId: 'a',
            targetInstanceId: 'c',
            attrs: { controlPoints: [{ x: 1, y: 1 }] },
          },
        ],
      },
    }
    const elkResult = {
      id: 'root',
      children: [
        { id: 'a', x: 10, y: 20, width: 80, height: 40 },
        { id: 'b', x: 200, y: 20, width: 80, height: 40 },
      ],
      edges: [
        {
          id: 'e1',
          sections: [
            {
              startPoint: { x: 90, y: 40 },
              endPoint: { x: 200, y: 40 },
              bendPoints: [{ x: 140, y: 40 }],
            },
          ],
        },
      ],
    }
    const next = applyElkLayout(diagram, elkResult, new Set(['a', 'b']))
    expect(next.instances.nodes.find(n => n.id === 'a')).toMatchObject({ x: 10, y: 20 })
    expect(next.instances.nodes.find(n => n.id === 'c')).toMatchObject({ x: 900, y: 900 })
    const e1 = next.instances.edges.find(e => e.id === 'e1')
    expect(e1?.attrs?.controlPoints).toEqual([{ x: 140, y: 40 }])
    expect(e1?.attrs?.diagramStyle).toEqual({ edgeType: 'editable-polyline' })
    expect(next.instances.edges.find(e => e.id === 'e2')?.attrs?.controlPoints).toEqual([
      { x: 1, y: 1 },
    ])
  })

  it('sets editable-polyline edgeType when applying bend points', () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 0, y: 100, width: 80, height: 40 },
        ],
        edges: [
          {
            id: 'e1',
            modelLinkId: 'l1',
            sourceInstanceId: 'a',
            targetInstanceId: 'b',
            attrs: { diagramStyle: { edgeType: 'bezier' } },
          },
        ],
      },
    }
    const next = applyElkLayout(
      diagram,
      {
        id: 'root',
        children: [
          { id: 'a', x: 10, y: 20, width: 80, height: 40 },
          { id: 'b', x: 200, y: 20, width: 80, height: 40 },
        ],
        edges: [
          {
            id: 'e1',
            sections: [
              {
                startPoint: { x: 90, y: 40 },
                endPoint: { x: 200, y: 40 },
                bendPoints: [{ x: 140, y: 40 }],
              },
            ],
          },
        ],
      },
      new Set(['a', 'b'])
    )
    const edge = next.instances.edges[0]
    expect(edge?.attrs?.controlPoints).toEqual([{ x: 140, y: 40 }])
    expect(edge?.attrs?.diagramStyle).toEqual({ edgeType: 'editable-polyline' })
  })

  it('maps nested ELK coords to absolute world positions', () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'outer', modelNodeId: 'm0', x: 0, y: 0, width: 400, height: 300 },
          { id: 'a', modelNodeId: 'm1', x: 40, y: 40, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 40, y: 120, width: 80, height: 40 },
        ],
        edges: [],
      },
    }
    const elkResult = {
      id: 'root',
      children: [
        {
          id: 'outer',
          x: 50,
          y: 60,
          width: 400,
          height: 300,
          children: [
            { id: 'a', x: 10, y: 20, width: 80, height: 40 },
            { id: 'b', x: 10, y: 100, width: 80, height: 40 },
          ],
        },
      ],
    }
    const next = applyElkLayout(diagram, elkResult, new Set(['outer', 'a', 'b']))
    expect(next.instances.nodes.find(n => n.id === 'outer')).toMatchObject({
      x: 50,
      y: 60,
    })
    expect(next.instances.nodes.find(n => n.id === 'a')).toMatchObject({ x: 60, y: 80 })
    expect(next.instances.nodes.find(n => n.id === 'b')).toMatchObject({ x: 60, y: 160 })
  })

  it('does not mutate the input diagram', () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [{ id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 }],
        edges: [
          {
            id: 'e1',
            modelLinkId: 'l1',
            sourceInstanceId: 'a',
            targetInstanceId: 'a',
            attrs: { controlPoints: [{ x: 1, y: 1 }] },
          },
        ],
      },
    }
    const snapshot = structuredClone(diagram)
    applyElkLayout(
      diagram,
      {
        id: 'root',
        children: [{ id: 'a', x: 10, y: 20, width: 80, height: 40 }],
        edges: [
          {
            id: 'e1',
            sections: [
              {
                startPoint: { x: 0, y: 0 },
                endPoint: { x: 0, y: 0 },
                bendPoints: [{ x: 5, y: 5 }],
              },
            ],
          },
        ],
      },
      new Set(['a'])
    )
    expect(diagram).toEqual(snapshot)
  })

  it('sets straight and clears controlPoints when ELK has no bend points', () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 200, y: 0, width: 80, height: 40 },
        ],
        edges: [
          {
            id: 'e1',
            modelLinkId: 'l1',
            sourceInstanceId: 'a',
            targetInstanceId: 'b',
            attrs: {
              controlPoints: [{ x: 5, y: 5 }],
              diagramStyle: { edgeType: 'bezier' },
            },
          },
        ],
      },
    }
    const elkResult = {
      id: 'root',
      children: [
        { id: 'a', x: 10, y: 20, width: 80, height: 40 },
        { id: 'b', x: 200, y: 20, width: 80, height: 40 },
      ],
      edges: [
        {
          id: 'e1',
          sections: [{ startPoint: { x: 90, y: 40 }, endPoint: { x: 200, y: 40 } }],
        },
      ],
    }
    const next = applyElkLayout(diagram, elkResult, new Set(['a', 'b']))
    const edge = next.instances.edges[0]!
    expect(edge.attrs?.controlPoints).toBeUndefined()
    expect(edge.attrs?.diagramStyle).toMatchObject({ edgeType: 'straight' })
  })

  it('forces editable-polyline even when previous type was polyline', () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 0, y: 100, width: 80, height: 40 },
        ],
        edges: [
          {
            id: 'e1',
            modelLinkId: 'l1',
            sourceInstanceId: 'a',
            targetInstanceId: 'b',
            attrs: { diagramStyle: { edgeType: 'polyline' } },
          },
        ],
      },
    }
    const next = applyElkLayout(
      diagram,
      {
        id: 'root',
        children: [
          { id: 'a', x: 10, y: 20, width: 80, height: 40 },
          { id: 'b', x: 200, y: 20, width: 80, height: 40 },
        ],
        edges: [
          {
            id: 'e1',
            sections: [
              {
                startPoint: { x: 90, y: 40 },
                endPoint: { x: 200, y: 40 },
                bendPoints: [{ x: 140, y: 40 }],
              },
            ],
          },
        ],
      },
      new Set(['a', 'b'])
    )
    const edge = next.instances.edges[0]!
    expect(edge.attrs?.controlPoints).toEqual([{ x: 140, y: 40 }])
    expect(edge.attrs?.diagramStyle).toMatchObject({ edgeType: 'editable-polyline' })
  })
})
