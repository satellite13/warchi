import { describe, it, expect } from 'vitest'
import type { NodeShapeResponse } from '@/types/api'
import type { ExportedNodeShape } from './exportedNodeShape'
import {
  analyzeImportShapeConflicts,
  defaultShapeImportResolutions,
  setBulkShapeImportAction,
  sortShapeCandidates,
} from './importShapeConflicts'

const outlineA = JSON.stringify([{ type: 'line', points: [[0, 0], [1, 0]] }])
const outlineB = JSON.stringify([{ type: 'line', points: [[0, 0], [2, 0]] }])

function catalog(partial: Partial<NodeShapeResponse> & Pick<NodeShapeResponse, 'id' | 'name'>): NodeShapeResponse {
  return {
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ownerId: 'u1',
    outline: outlineA,
    accessPermission: 'OWNER',
    ...partial,
  }
}

function imported(partial: Partial<ExportedNodeShape> & Pick<ExportedNodeShape, 'id' | 'name'>): ExportedNodeShape {
  return { outline: outlineA, ...partial }
}

describe('sortShapeCandidates', () => {
  it('orders OWNER before EDIT before VIEW, then updatedAt desc', () => {
    const list = [
      catalog({ id: 'v', name: 'Hex', accessPermission: 'VIEW', updatedAt: '2026-03-01T00:00:00Z' }),
      catalog({ id: 'e-old', name: 'Hex', accessPermission: 'EDIT', updatedAt: '2026-01-01T00:00:00Z' }),
      catalog({ id: 'e-new', name: 'Hex', accessPermission: 'EDIT', updatedAt: '2026-02-01T00:00:00Z' }),
      catalog({ id: 'o', name: 'Hex', accessPermission: 'OWNER', updatedAt: '2026-01-01T00:00:00Z' }),
    ]
    expect(sortShapeCandidates(list).map((s) => s.id)).toEqual(['o', 'e-new', 'e-old', 'v'])
  })
})

describe('analyzeImportShapeConflicts', () => {
  it('matches names case-insensitively and skips unmatched', () => {
    const conflicts = analyzeImportShapeConflicts(
      [imported({ id: 'i1', name: 'Hexagon' }), imported({ id: 'i2', name: 'OnlyInFile' })],
      [catalog({ id: 'c1', name: 'hexagon' })]
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.imported.id).toBe('i1')
    expect(conflicts[0]!.candidates.map((c) => c.id)).toEqual(['c1'])
    expect(conflicts[0]!.geometryMatches).toEqual([true])
  })

  it('marks geometry mismatch per candidate', () => {
    const conflicts = analyzeImportShapeConflicts(
      [imported({ id: 'i1', name: 'Hex', outline: outlineA })],
      [catalog({ id: 'c1', name: 'Hex', outline: outlineB })]
    )
    expect(conflicts[0]!.geometryMatches).toEqual([false])
  })
})

describe('defaultShapeImportResolutions', () => {
  it('reuses first geometry match; otherwise create with first candidate selected', () => {
    const match = analyzeImportShapeConflicts(
      [imported({ id: 'i1', name: 'Hex', outline: outlineA })],
      [catalog({ id: 'c1', name: 'Hex', outline: outlineA })]
    )
    expect(defaultShapeImportResolutions(match)).toEqual([
      { importedId: 'i1', action: 'reuse', catalogShapeId: 'c1' },
    ])

    const differ = analyzeImportShapeConflicts(
      [imported({ id: 'i2', name: 'Hex', outline: outlineA })],
      [catalog({ id: 'c2', name: 'Hex', outline: outlineB })]
    )
    expect(defaultShapeImportResolutions(differ)).toEqual([
      { importedId: 'i2', action: 'create', catalogShapeId: 'c2' },
    ])
  })

  it('among multiple candidates prefers matching outline by sort order', () => {
    const conflicts = analyzeImportShapeConflicts(
      [imported({ id: 'i1', name: 'Hex', outline: outlineA })],
      [
        catalog({ id: 'owner-diff', name: 'Hex', outline: outlineB, accessPermission: 'OWNER' }),
        catalog({
          id: 'edit-match',
          name: 'Hex',
          outline: outlineA,
          accessPermission: 'EDIT',
          updatedAt: '2026-02-01T00:00:00Z',
        }),
      ]
    )
    expect(defaultShapeImportResolutions(conflicts)[0]).toEqual({
      importedId: 'i1',
      action: 'reuse',
      catalogShapeId: 'edit-match',
    })
  })
})

describe('setBulkShapeImportAction', () => {
  it('sets action on all rows without clearing catalogShapeId', () => {
    const resolutions = [
      { importedId: 'i1', action: 'reuse' as const, catalogShapeId: 'c1' },
      { importedId: 'i2', action: 'create' as const, catalogShapeId: 'c2' },
    ]
    expect(setBulkShapeImportAction(resolutions, 'create')).toEqual([
      { importedId: 'i1', action: 'create', catalogShapeId: 'c1' },
      { importedId: 'i2', action: 'create', catalogShapeId: 'c2' },
    ])
  })
})
