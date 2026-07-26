import type { NodeShapeResponse } from '@/types/api'
import type { EditorComponent } from '../types'
import type { ExportedNodeShape } from './exportedNodeShape'
import type { ShapeImportResolution } from './importShapeConflicts'
import { parseOutlineSegmentsOrEmpty } from './outlinesEquivalent'
import { remapComponentCustomShapeIds } from './notationShapePackage'
import { parseScaleSliceFromAttrs } from '@/types/shapes'

export function applyShapeImportResolutions(params: {
  components: EditorComponent[]
  pendingShapes: ExportedNodeShape[]
  resolutions: ShapeImportResolution[]
  catalogById: Map<string, NodeShapeResponse>
}): ExportedNodeShape[] {
  const reuseIdMap = new Map<string, string>()
  const reusedImportedIds = new Set<string>()

  for (const resolution of params.resolutions) {
    if (resolution.action !== 'reuse') continue
    const catalogId = resolution.catalogShapeId
    if (!catalogId) continue
    if (!params.catalogById.has(catalogId)) continue
    reusedImportedIds.add(resolution.importedId)
    reuseIdMap.set(resolution.importedId, catalogId)
  }

  remapComponentCustomShapeIds(params.components, reuseIdMap)

  for (const resolution of params.resolutions) {
    if (resolution.action !== 'reuse' || !resolution.catalogShapeId) continue
    const catalogShape = params.catalogById.get(resolution.catalogShapeId)
    if (!catalogShape) continue
    const outline = parseOutlineSegmentsOrEmpty(catalogShape.outline)
    if (outline.length === 0) continue
    const scaleSlice = parseScaleSliceFromAttrs(catalogShape.attrs)
    for (const component of params.components) {
      if (component._isDeleted) continue
      const style = component.parsedAttrs.diagramStyle
      if (style?.customShapeId !== resolution.catalogShapeId) continue
      const nextStyle = { ...style, customOutline: outline }
      if (scaleSlice) nextStyle.customScaleSlice = scaleSlice
      else delete nextStyle.customScaleSlice
      component.parsedAttrs.diagramStyle = nextStyle
      if (!component._isNew) component._isDirty = true
    }
  }

  return params.pendingShapes.filter((shape) => !reusedImportedIds.has(shape.id))
}
