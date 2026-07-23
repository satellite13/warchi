export type ExportedNodeShape = {
  id: string
  name: string
  outline: string
  contentArea?: string | null
  attrs?: string | null
}

export function stripShapeDocumentFileId(shape: ExportedNodeShape): ExportedNodeShape {
  if (shape.attrs == null || shape.attrs === '') return shape
  try {
    const parsed = JSON.parse(shape.attrs) as Record<string, unknown>
    if (!('documentFileId' in parsed)) return shape
    const { documentFileId: _removed, ...rest } = parsed
    return { ...shape, attrs: JSON.stringify(rest) }
  } catch {
    return shape
  }
}
