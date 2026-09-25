import { describe, expect, it, vi } from 'vitest'
import type { Node as DiagramNode } from '@ngroznykh/papirus'
import type { DiagramNodeInstance } from '../modelAttrs'
import { applyMinSizeConstraint } from './minSizeConstraint'

const ctx = {} as CanvasRenderingContext2D

const makeInstance = (): DiagramNodeInstance => ({ id: 'i1', modelNodeId: 'n1', x: 0, y: 0 })

describe('applyMinSizeConstraint', () => {
  it('forwards availableWidth to the original getContentMinSize', () => {
    const original = vi.fn((_ctx: CanvasRenderingContext2D, w?: number) => ({
      width: 100,
      height: w === 80 ? 53.6 : 16.8,
    }))
    const node = { getContentMinSize: original } as unknown as DiagramNode

    applyMinSizeConstraint(node, makeInstance(), () => ({ width: 40, height: 20 }))

    const result = node.getContentMinSize(ctx, 80)

    expect(original).toHaveBeenCalledWith(ctx, 80)
    expect(result.height).toBe(53.6)
  })

  it('keeps the larger of content and component minimum dimensions', () => {
    const node = {
      getContentMinSize: vi.fn(() => ({ width: 100, height: 30 })),
    } as unknown as DiagramNode

    applyMinSizeConstraint(node, makeInstance(), () => ({ width: 200, height: 10 }))

    expect(node.getContentMinSize(ctx)).toEqual({ width: 200, height: 30 })
  })
})
