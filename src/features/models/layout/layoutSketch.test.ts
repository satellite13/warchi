import { describe, expect, it } from 'vitest'
import { buildLayoutSketchModel } from './layoutSketch'
import { parseDiagramAttrs } from '../modelAttrs'

describe('buildLayoutSketchModel', () => {
  it('computes viewBox with padding from node bounds', () => {
    const diagram = parseDiagramAttrs(null)
    diagram.instances.nodes = [
      { id: 'a', modelNodeId: 'n1', x: 0, y: 0, width: 100, height: 40 },
      { id: 'b', modelNodeId: 'n2', x: 200, y: 80, width: 100, height: 40 },
    ]
    diagram.instances.edges = [
      {
        id: 'e1',
        modelLinkId: 'l1',
        sourceInstanceId: 'a',
        targetInstanceId: 'b',
      },
    ]
    const model = buildLayoutSketchModel(diagram, 16)
    expect(model.viewBox).toEqual({ x: -16, y: -16, width: 332, height: 152 })
    expect(model.nodes).toHaveLength(2)
    expect(model.edges[0]!.points.length).toBeGreaterThanOrEqual(2)
  })

  it('uses controlPoints between centers for editable polyline', () => {
    const diagram = parseDiagramAttrs(null)
    diagram.instances.nodes = [
      { id: 'a', modelNodeId: 'n1', x: 0, y: 0, width: 100, height: 40 },
      { id: 'b', modelNodeId: 'n2', x: 200, y: 0, width: 100, height: 40 },
    ]
    diagram.instances.edges = [
      {
        id: 'e1',
        modelLinkId: 'l1',
        sourceInstanceId: 'a',
        targetInstanceId: 'b',
        attrs: {
          controlPoints: [{ x: 150, y: 60 }],
          diagramStyle: { edgeType: 'editable-polyline' },
        },
      },
    ]
    const model = buildLayoutSketchModel(diagram, 0)
    expect(model.edges[0]!.points).toEqual([
      { x: 50, y: 20 },
      { x: 150, y: 60 },
      { x: 250, y: 20 },
    ])
  })
})
