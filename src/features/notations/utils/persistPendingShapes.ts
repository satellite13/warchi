import { nextUniqueShapeName } from './uniqueShapeName'
import { stripShapeDocumentFileId, type ExportedNodeShape } from './exportedNodeShape'
import type { NodeShapeRequest } from '@/types/api'

export type PersistPendingShapesDeps = {
  shapes: ExportedNodeShape[]
  existingNames: string[]
  create: (request: NodeShapeRequest) => Promise<{ id: string } | null>
  remove: (id: string) => Promise<boolean>
}

export async function persistPendingShapes(
  deps: PersistPendingShapesDeps
): Promise<Map<string, string>> {
  const taken = new Set(deps.existingNames)
  const createdIds: string[] = []
  const idMap = new Map<string, string>()
  try {
    for (const raw of deps.shapes) {
      const shape = stripShapeDocumentFileId(raw)
      const name = nextUniqueShapeName(shape.name, taken)
      taken.add(name)
      const created = await deps.create({
        name,
        outline: shape.outline,
        contentArea: shape.contentArea ?? null,
        attrs: shape.attrs ?? null,
      })
      if (!created) throw new Error(`Failed to create shape "${name}"`)
      createdIds.push(created.id)
      idMap.set(shape.id, created.id)
    }
    return idMap
  } catch (error) {
    for (const id of createdIds.reverse()) {
      try {
        await deps.remove(id)
      } catch {
        /* best effort */
      }
    }
    throw error
  }
}
