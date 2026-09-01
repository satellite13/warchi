import { usePagedResourceCrud } from './usePagedResourceCrud'
import type {
  NodeShapeResponse,
  NodeShapeRequest,
  NodeShapeUpdateRequest,
} from '../types/api'
import {
  invalidateNodeShapeScaleSliceCatalog,
  rememberNodeShapeAttrs,
} from '@/utils/resolveCustomScaleSlice'

const nodeShapesPath = '/node-shapes'

export function useNodeShapes(options?: { beforeUpdate?: () => boolean }) {
  return usePagedResourceCrud<
    NodeShapeResponse,
    NodeShapeResponse,
    NodeShapeRequest,
    NodeShapeUpdateRequest
  >({
    basePath: nodeShapesPath,
    beforeUpdate: options?.beforeUpdate,
    onListLoaded: (items) => {
      rememberNodeShapeAttrs(items)
    },
    afterMutation: (kind, item) => {
      invalidateNodeShapeScaleSliceCatalog()
      if ((kind === 'create' || kind === 'update') && item) {
        rememberNodeShapeAttrs([item])
      }
    },
  })
}
