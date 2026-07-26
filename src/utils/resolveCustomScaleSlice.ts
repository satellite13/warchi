import type { DiagramStyle, ScaleSlice } from '@/domain/attrs/notationAttrs'
import { parseScaleSliceFromAttrs } from '@/types/shapes'
import { apiGet } from '@/composables/useApi'
import { pagedListParams } from '@/api/queryHelpers'
import type { PaginatedResponse } from '@/types/entities'
import type { NodeShapeResponse } from '@/types/api'
import { paginatedContent } from '@/utils/paginatedResponse'

/** Catalog shape attrs by id — filled when style panels / diagrams load /node-shapes. */
const shapeAttrsById = new Map<string, string | null>()
let catalogLoadPromise: Promise<boolean> | null = null

export function rememberNodeShapeAttrs(
  shapes: Array<{ id: string; attrs?: string | null }>
): void {
  for (const shape of shapes) {
    shapeAttrsById.set(shape.id, shape.attrs ?? null)
  }
}

export function resolveCustomScaleSlice(ds?: DiagramStyle | null): ScaleSlice | undefined {
  if (!ds) return undefined
  if (ds.customScaleSlice) return ds.customScaleSlice
  if (!ds.customShapeId) return undefined
  return parseScaleSliceFromAttrs(shapeAttrsById.get(ds.customShapeId))
}

/** Ensure diagramStyle carries customScaleSlice when catalog attrs are known. */
export function withResolvedScaleSlice(ds?: DiagramStyle): DiagramStyle | undefined {
  if (!ds) return undefined
  const slice = resolveCustomScaleSlice(ds)
  if (!slice) return ds
  if (ds.customScaleSlice) return ds
  return { ...ds, customScaleSlice: slice }
}

/** Prefetch node-shape attrs so 9-slice works before Style panel opens. */
export function ensureNodeShapeScaleSliceCatalog(): Promise<boolean> {
  if (!catalogLoadPromise) {
    catalogLoadPromise = (async () => {
      const query = pagedListParams(0, 200).toString()
      const result = await apiGet<PaginatedResponse<NodeShapeResponse>>(`/node-shapes?${query}`)
      if (!result.success) {
        catalogLoadPromise = null
        return false
      }
      rememberNodeShapeAttrs(paginatedContent(result.data))
      return true
    })()
  }
  return catalogLoadPromise
}

/** Drop cached catalog load so the next ensure() refetches (e.g. after shape save). */
export function invalidateNodeShapeScaleSliceCatalog(): void {
  catalogLoadPromise = null
}
