import { describe, expect, it } from 'vitest'
import type { DiagramAttrs } from '../../modelAttrs'
import { applyEdgeTypeFromContextMenu } from './setEdgeTypeFromContextMenu'

function makeAttrs(edgeType?: string, controlPoints?: number[][]): DiagramAttrs {
  return {
    instances: {
      nodes: [],
      edges: [
        {
          id: 'e1',
          modelLinkId: 'link-1',
          sourceInstanceId: 'n1',
          targetInstanceId: 'n2',
          attrs: {
            ...(edgeType || controlPoints
              ? {
                  diagramStyle: edgeType ? { edgeType } : {},
                  ...(controlPoints ? { controlPoints } : {}),
                }
              : {}),
          },
        },
      ],
    },
  } as DiagramAttrs
}

describe('applyEdgeTypeFromContextMenu', () => {
  it('returns false when edge is missing', () => {
    const attrs = makeAttrs('bezier')
    expect(applyEdgeTypeFromContextMenu(attrs, 'missing', 'straight', () => undefined)).toBe(false)
  })

  it('returns false when type is unchanged', () => {
    const attrs = makeAttrs('straight')
    expect(applyEdgeTypeFromContextMenu(attrs, 'e1', 'straight', () => undefined)).toBe(false)
  })

  it('writes full effective style and new edgeType', () => {
    const attrs = makeAttrs('bezier')
    const changed = applyEdgeTypeFromContextMenu(attrs, 'e1', 'polyline', () => ({
      strokeColor: '#333',
      edgeType: 'bezier',
    }))
    expect(changed).toBe(true)
    expect(attrs.instances.edges[0]?.attrs?.diagramStyle).toEqual({
      strokeColor: '#333',
      edgeType: 'polyline',
    })
  })

  it('clears controlPoints when leaving polyline', () => {
    const attrs = makeAttrs('polyline', [
      [0, 0],
      [1, 1],
    ])
    const changed = applyEdgeTypeFromContextMenu(attrs, 'e1', 'bezier', () => undefined)
    expect(changed).toBe(true)
    expect(attrs.instances.edges[0]?.attrs?.controlPoints).toBeUndefined()
    expect(attrs.instances.edges[0]?.attrs?.diagramStyle).toMatchObject({ edgeType: 'bezier' })
  })
})
