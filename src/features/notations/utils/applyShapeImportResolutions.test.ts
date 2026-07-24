import { describe, it, expect } from 'vitest'
import type { NodeShapeResponse } from '@/types/api'
import type { EditorComponent } from '../types'
import { applyShapeImportResolutions } from './applyShapeImportResolutions'
import type { ExportedNodeShape } from './exportedNodeShape'

const fileOutline = [{ type: 'line' as const, points: [[0, 0], [1, 0]] as [number, number][] }]
const catalogOutline = [{ type: 'line' as const, points: [[0, 0], [3, 0]] as [number, number][] }]

function component(id: string, shapeId: string): EditorComponent {
  return {
    id,
    name: 'C',
    version: '1.0.0',
    notationId: 'n1',
    ownerId: 'u1',
    nodeTypeId: 't1',
    parsedAttrs: {
      diagramStyle: {
        customShapeId: shapeId,
        customOutline: fileOutline,
      },
    },
    _isNew: true,
  } as EditorComponent
}

describe('applyShapeImportResolutions', () => {
  it('reuses: remaps id, syncs outline from catalog, drops from pending', () => {
    const components = [component('c1', 'imported-s1')]
    const pending: ExportedNodeShape[] = [
      { id: 'imported-s1', name: 'Hex', outline: JSON.stringify(fileOutline) },
      { id: 'imported-s2', name: 'Other', outline: JSON.stringify(fileOutline) },
    ]
    const catalogById = new Map<string, NodeShapeResponse>([
      [
        'catalog-1',
        {
          id: 'catalog-1',
          name: 'Hex',
          ownerId: 'u1',
          createdAt: '2026-01-01T00:00:00Z',
          outline: JSON.stringify(catalogOutline),
        },
      ],
    ])

    const nextPending = applyShapeImportResolutions({
      components,
      pendingShapes: pending,
      resolutions: [{ importedId: 'imported-s1', action: 'reuse', catalogShapeId: 'catalog-1' }],
      catalogById,
    })

    expect(nextPending.map((s) => s.id)).toEqual(['imported-s2'])
    expect(components[0]!.parsedAttrs.diagramStyle?.customShapeId).toBe('catalog-1')
    expect(components[0]!.parsedAttrs.diagramStyle?.customOutline).toEqual(catalogOutline)
  })

  it('create: leaves pending entry and does not remap', () => {
    const components = [component('c1', 'imported-s1')]
    const pending: ExportedNodeShape[] = [
      { id: 'imported-s1', name: 'Hex', outline: JSON.stringify(fileOutline) },
    ]
    const nextPending = applyShapeImportResolutions({
      components,
      pendingShapes: pending,
      resolutions: [{ importedId: 'imported-s1', action: 'create', catalogShapeId: 'catalog-1' }],
      catalogById: new Map(),
    })
    expect(nextPending).toHaveLength(1)
    expect(components[0]!.parsedAttrs.diagramStyle?.customShapeId).toBe('imported-s1')
  })

  it('ignores reuse without catalogShapeId or missing catalog row', () => {
    const components = [component('c1', 'imported-s1')]
    const pending: ExportedNodeShape[] = [
      { id: 'imported-s1', name: 'Hex', outline: JSON.stringify(fileOutline) },
    ]
    const nextPending = applyShapeImportResolutions({
      components,
      pendingShapes: pending,
      resolutions: [{ importedId: 'imported-s1', action: 'reuse' }],
      catalogById: new Map(),
    })
    expect(nextPending).toHaveLength(1)
    expect(components[0]!.parsedAttrs.diagramStyle?.customShapeId).toBe('imported-s1')
  })
})
