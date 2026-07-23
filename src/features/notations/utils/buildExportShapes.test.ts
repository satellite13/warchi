import { describe, it, expect, vi } from 'vitest'
import type { OutlineSegment } from '@/domain/attrs/notationAttrs'
import type { EditorComponent } from '../types'
import type { ExportedNodeShape } from './exportedNodeShape'
import { buildExportShapes } from './buildExportShapes'

const rectOutline: OutlineSegment[] = [
  { type: 'line', points: [[0, 0], [1, 0]] },
  { type: 'line', points: [[1, 0], [1, 1]] },
  { type: 'line', points: [[1, 1], [0, 1]] },
  { type: 'line', points: [[0, 1], [0, 0]] },
]

const otherOutline: OutlineSegment[] = [
  { type: 'line', points: [[0, 0], [0.5, 0.5]] },
  { type: 'line', points: [[0.5, 0.5], [1, 0]] },
]

const component = (partial: Partial<EditorComponent> & { id: string }): EditorComponent =>
  ({
    name: 'C',
    ownerId: 'o',
    notationId: 'n',
    nodeTypeId: 't',
    version: '1.0.0',
    parsedAttrs: { tags: [], customProperties: [] },
    ...partial,
  }) as EditorComponent

describe('buildExportShapes', () => {
  it('prefers pendingShapes when non-empty', async () => {
    const fetchById = vi.fn()
    const pending: ExportedNodeShape[] = [
      { id: 's1', name: 'Pending hex', outline: JSON.stringify(rectOutline) },
    ]
    const components = [
      component({
        id: 'c1',
        parsedAttrs: {
          tags: [],
          customProperties: [],
          diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
        },
      }),
    ]

    const shapes = await buildExportShapes({ components, pendingShapes: pending, fetchById })

    expect(shapes).toHaveLength(1)
    expect(shapes[0]).toEqual(pending[0])
    expect(fetchById).not.toHaveBeenCalled()
  })

  it('fetches catalog shapes by id when pending is empty', async () => {
    const fetchById = vi.fn().mockResolvedValue({
      id: 's1',
      name: 'Catalog hex',
      outline: JSON.stringify(rectOutline),
      contentArea: null,
      attrs: null,
    })
    const components = [
      component({
        id: 'c1',
        parsedAttrs: {
          tags: [],
          customProperties: [],
          diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
        },
      }),
    ]

    const shapes = await buildExportShapes({ components, pendingShapes: [], fetchById })

    expect(fetchById).toHaveBeenCalledWith('s1')
    expect(shapes).toHaveLength(1)
    expect(shapes[0]?.id).toBe('s1')
    expect(shapes[0]?.name).toBe('Catalog hex')
  })

  it('synthesizes shape when fetch returns null but component has outline', async () => {
    const fetchById = vi.fn().mockResolvedValue(null)
    const components = [
      component({
        id: 'c1',
        parsedAttrs: {
          tags: [],
          customProperties: [],
          diagramStyle: { customShapeId: 's-missing', customOutline: otherOutline },
        },
      }),
    ]

    const shapes = await buildExportShapes({ components, pendingShapes: [], fetchById })

    expect(fetchById).toHaveBeenCalledWith('s-missing')
    expect(shapes).toHaveLength(1)
    expect(shapes[0]?.id).toBe('s-missing')
    expect(shapes[0]?.name).toBe('Imported shape')
    expect(shapes[0]?.outline).toBe(JSON.stringify(otherOutline))
  })

  it('does not include unused shapes from pending', async () => {
    const fetchById = vi.fn()
    const pending: ExportedNodeShape[] = [
      { id: 's-used', name: 'Used', outline: JSON.stringify(rectOutline) },
      { id: 's-unused', name: 'Unused', outline: JSON.stringify(otherOutline) },
    ]
    const components = [
      component({
        id: 'c1',
        parsedAttrs: {
          tags: [],
          customProperties: [],
          diagramStyle: { customShapeId: 's-used', customOutline: rectOutline },
        },
      }),
    ]

    const shapes = await buildExportShapes({ components, pendingShapes: pending, fetchById })

    expect(shapes.map((s) => s.id)).toEqual(['s-used'])
    expect(fetchById).not.toHaveBeenCalled()
  })

  it('uses empty outline when catalog row has null outline', async () => {
    const fetchById = vi.fn().mockResolvedValue({
      id: 's1',
      name: 'No outline',
      outline: null,
    })
    const components = [
      component({
        id: 'c1',
        parsedAttrs: {
          tags: [],
          customProperties: [],
          diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
        },
      }),
    ]

    const shapes = await buildExportShapes({ components, pendingShapes: [], fetchById })

    expect(shapes[0]?.outline).toBe('[]')
  })
})
