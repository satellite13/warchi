import type { EditorComponent } from '../types'
import type { ExportedNodeShape } from './exportedNodeShape'
import { mergeScaleSliceIntoAttrs } from '@/types/shapes'

const IMPORTED_SHAPE_NAME = 'Imported shape'

function isNonDeletedComponent(component: EditorComponent): boolean {
  return !component._isDeleted
}

function getCustomShapeId(component: EditorComponent): string | undefined {
  const id = component.parsedAttrs.diagramStyle?.customShapeId
  if (typeof id !== 'string' || id === '') return undefined
  return id
}

function getCustomOutline(component: EditorComponent) {
  const outline = component.parsedAttrs.diagramStyle?.customOutline
  if (!Array.isArray(outline) || outline.length === 0) return undefined
  return outline
}

function getCustomScaleSliceAttrs(component: EditorComponent): string | undefined {
  const slice = component.parsedAttrs.diagramStyle?.customScaleSlice
  if (!slice) return undefined
  return mergeScaleSliceIntoAttrs(null, slice)
}

export function collectCustomShapeIds(components: EditorComponent[]): Set<string> {
  const ids = new Set<string>()
  for (const component of components) {
    if (!isNonDeletedComponent(component)) continue
    const id = getCustomShapeId(component)
    if (id) ids.add(id)
  }
  return ids
}

export function synthesizeShapesFromComponents(
  components: EditorComponent[],
  alreadyHaveIds: Set<string>
): ExportedNodeShape[] {
  const byId = new Map<string, ExportedNodeShape>()

  for (const component of components) {
    if (!isNonDeletedComponent(component)) continue

    const customOutline = getCustomOutline(component)
    if (!customOutline) continue

    const customShapeId = getCustomShapeId(component)
    if (customShapeId && alreadyHaveIds.has(customShapeId)) continue

    const id = customShapeId ?? JSON.stringify(customOutline)
    if (alreadyHaveIds.has(id) || byId.has(id)) continue

    const attrs = getCustomScaleSliceAttrs(component)
    byId.set(id, {
      id,
      name: IMPORTED_SHAPE_NAME,
      outline: JSON.stringify(customOutline),
      ...(attrs ? { attrs } : {}),
    })
  }

  return [...byId.values()]
}

export function mergeShapePackage(
  packageShapes: ExportedNodeShape[],
  components: EditorComponent[]
): ExportedNodeShape[] {
  const byId = new Map<string, ExportedNodeShape>()
  for (const shape of packageShapes) {
    byId.set(shape.id, shape)
  }

  const alreadyHaveIds = new Set(byId.keys())
  const synthesized = synthesizeShapesFromComponents(components, alreadyHaveIds)
  for (const shape of synthesized) {
    if (!byId.has(shape.id)) {
      byId.set(shape.id, shape)
    }
  }

  return [...byId.values()]
}

export function remapComponentCustomShapeIds(
  components: EditorComponent[],
  idMap: Map<string, string>
): void {
  for (const component of components) {
    if (!isNonDeletedComponent(component)) continue

    const diagramStyle = component.parsedAttrs.diagramStyle
    const currentId = diagramStyle?.customShapeId
    if (typeof currentId !== 'string' || currentId === '') continue

    const newId = idMap.get(currentId)
    if (newId == null || newId === currentId) continue

    component.parsedAttrs.diagramStyle = {
      ...diagramStyle,
      customShapeId: newId,
    }

    if (!component._isNew) {
      component._isDirty = true
    }
  }
}
