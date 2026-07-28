import { describe, expect, it, beforeEach } from 'vitest'
import {
  rememberNodeShapeAttrs,
  resolveCustomScaleSlice,
  withResolvedScaleSlice,
} from '@/utils/resolveCustomScaleSlice'
import type { DiagramStyle } from '@/domain/attrs/notationAttrs'

const slice = {
  left: 10,
  right: 10,
  top: 10,
  bottom: 10,
  refWidth: 180,
  refHeight: 120,
}

describe('resolveCustomScaleSlice', () => {
  beforeEach(() => {
    rememberNodeShapeAttrs([])
  })

  it('returns diagramStyle.customScaleSlice when present', () => {
    const ds: DiagramStyle = { customScaleSlice: slice, customShapeId: 's1' }
    expect(resolveCustomScaleSlice(ds)).toEqual(slice)
  })

  it('resolves from catalog attrs by customShapeId', () => {
    rememberNodeShapeAttrs([
      { id: 's1', attrs: JSON.stringify({ scaleSlice: slice }) },
    ])
    const ds: DiagramStyle = { customShapeId: 's1', customOutline: [] }
    expect(resolveCustomScaleSlice(ds)).toEqual(slice)
  })

  it('withResolvedScaleSlice fills missing snapshot from catalog', () => {
    rememberNodeShapeAttrs([
      { id: 's1', attrs: JSON.stringify({ scaleSlice: slice }) },
    ])
    const ds: DiagramStyle = { customShapeId: 's1' }
    expect(withResolvedScaleSlice(ds)?.customScaleSlice).toEqual(slice)
  })
})
