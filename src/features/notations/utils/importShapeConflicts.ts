import type { NodeShapeResponse } from '@/types/api'
import type { ExportedNodeShape } from './exportedNodeShape'
import { outlinesEquivalent } from './outlinesEquivalent'

export type ShapeImportAction = 'reuse' | 'create'

export type ShapeImportConflict = {
  imported: ExportedNodeShape
  candidates: NodeShapeResponse[]
  geometryMatches: boolean[]
}

export type ShapeImportResolution = {
  importedId: string
  action: ShapeImportAction
  catalogShapeId?: string
}

const PERM_RANK: Record<string, number> = {
  OWNER: 0,
  ADMIN: 0,
  EDIT: 1,
  VIEW: 2,
}

function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

export function sortShapeCandidates(candidates: NodeShapeResponse[]): NodeShapeResponse[] {
  return [...candidates].sort((a, b) => {
    const ra = PERM_RANK[a.accessPermission ?? 'VIEW'] ?? 3
    const rb = PERM_RANK[b.accessPermission ?? 'VIEW'] ?? 3
    if (ra !== rb) return ra - rb
    const ta = a.updatedAt ?? a.createdAt ?? ''
    const tb = b.updatedAt ?? b.createdAt ?? ''
    return tb.localeCompare(ta)
  })
}

export function analyzeImportShapeConflicts(
  importedShapes: ExportedNodeShape[],
  catalogShapes: NodeShapeResponse[]
): ShapeImportConflict[] {
  const byName = new Map<string, NodeShapeResponse[]>()
  for (const shape of catalogShapes) {
    const key = nameKey(shape.name)
    if (!key) continue
    const list = byName.get(key)
    if (list) list.push(shape)
    else byName.set(key, [shape])
  }

  const conflicts: ShapeImportConflict[] = []
  for (const imported of importedShapes) {
    const key = nameKey(imported.name)
    const rawCandidates = byName.get(key)
    if (!rawCandidates || rawCandidates.length === 0) continue
    const candidates = sortShapeCandidates(rawCandidates)
    const geometryMatches = candidates.map((c) => outlinesEquivalent(imported.outline, c.outline))
    conflicts.push({ imported, candidates, geometryMatches })
  }
  return conflicts
}

export function defaultShapeImportResolutions(
  conflicts: ShapeImportConflict[]
): ShapeImportResolution[] {
  return conflicts.map((conflict) => {
    const matchIndex = conflict.geometryMatches.findIndex(Boolean)
    if (matchIndex >= 0) {
      return {
        importedId: conflict.imported.id,
        action: 'reuse',
        catalogShapeId: conflict.candidates[matchIndex]!.id,
      }
    }
    return {
      importedId: conflict.imported.id,
      action: 'create',
      catalogShapeId: conflict.candidates[0]?.id,
    }
  })
}

export function setBulkShapeImportAction(
  resolutions: ShapeImportResolution[],
  action: ShapeImportAction
): ShapeImportResolution[] {
  return resolutions.map((row) => ({ ...row, action }))
}
