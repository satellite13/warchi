import type { EditorComponent } from '../types'
import { stripShapeDocumentFileId, type ExportedNodeShape } from './exportedNodeShape'
import {
  collectCustomShapeIds,
  mergeShapePackage,
} from './notationShapePackage'

type FetchShapeRow = {
  id: string
  name: string
  outline: string | null
  contentArea?: string | null
  attrs?: string | null
}

function getUsedShapeIds(components: EditorComponent[]): Set<string> {
  const ids = collectCustomShapeIds(components)

  for (const component of components) {
    if (component._isDeleted) continue

    const outline = component.parsedAttrs.diagramStyle?.customOutline
    if (!Array.isArray(outline) || outline.length === 0) continue

    const customShapeId = component.parsedAttrs.diagramStyle?.customShapeId
    if (typeof customShapeId !== 'string' || customShapeId === '') {
      ids.add(JSON.stringify(outline))
    }
  }

  return ids
}

function filterUsedPackageShapes(
  packageShapes: ExportedNodeShape[],
  components: EditorComponent[]
): ExportedNodeShape[] {
  const usedIds = getUsedShapeIds(components)
  return packageShapes.filter((shape) => usedIds.has(shape.id))
}

export async function buildExportShapes(params: {
  components: EditorComponent[]
  pendingShapes: ExportedNodeShape[]
  fetchById: (id: string) => Promise<FetchShapeRow | null>
}): Promise<ExportedNodeShape[]> {
  const components = params.components.filter((component) => !component._isDeleted)

  if (params.pendingShapes.length > 0) {
    const stripped = params.pendingShapes.map(stripShapeDocumentFileId)
    return mergeShapePackage(filterUsedPackageShapes(stripped, components), components)
  }

  const hits: ExportedNodeShape[] = []

  for (const id of collectCustomShapeIds(components)) {
    const row = await params.fetchById(id)
    if (!row) continue

    hits.push(
      stripShapeDocumentFileId({
        id: row.id,
        name: row.name,
        outline: row.outline ?? '[]',
        contentArea: row.contentArea,
        attrs: row.attrs,
      })
    )
  }

  return mergeShapePackage(hits, components)
}
