import { describe, expect, it } from 'vitest'
import {
  applyDiagramStyleToNodeInstance,
  withInstanceDimensions,
} from './applyDiagramStyleToNodeInstance'

describe('applyDiagramStyleToNodeInstance', () => {
  it('keeps canvas size on first style override when panel emits notation defaults', () => {
    const instance = {
      width: 320,
      height: 180,
      attrs: {} as Record<string, unknown>,
    }
    applyDiagramStyleToNodeInstance(instance, {
      nodeShape: 'composite',
      contentInset: { top: 8, right: 0, bottom: 0, left: 0 },
      width: 160,
      height: 56,
    })
    expect(instance.width).toBe(320)
    expect(instance.height).toBe(180)
    expect((instance.attrs.diagramStyle as { width: number }).width).toBe(320)
    expect((instance.attrs.diagramStyle as { height: number }).height).toBe(180)
    expect(
      (instance.attrs.diagramStyle as { contentInset: { top: number } }).contentInset.top
    ).toBe(8)
  })

  it('keeps canvas size when only non-size fields change', () => {
    const instance = {
      width: 320,
      height: 180,
      attrs: {
        diagramStyle: {
          nodeShape: 'composite',
          width: 160,
          height: 56,
          contentInset: 0,
        },
      },
    }
    applyDiagramStyleToNodeInstance(instance, {
      nodeShape: 'composite',
      width: 160,
      height: 56,
      contentInset: { top: 12, right: 0, bottom: 0, left: 0 },
    })
    expect(instance.width).toBe(320)
    expect(instance.height).toBe(180)
    expect((instance.attrs.diagramStyle as { width: number }).width).toBe(320)
  })

  it('applies width/height when user changes them in the panel', () => {
    const instance = {
      width: 320,
      height: 180,
      attrs: {
        diagramStyle: {
          nodeShape: 'composite',
          width: 320,
          height: 180,
        },
      },
    }
    applyDiagramStyleToNodeInstance(instance, {
      nodeShape: 'composite',
      width: 400,
      height: 180,
    })
    expect(instance.width).toBe(400)
    expect(instance.height).toBe(180)
    expect((instance.attrs.diagramStyle as { width: number }).width).toBe(400)
  })
})

describe('withInstanceDimensions', () => {
  it('overlays instance size onto style', () => {
    expect(
      withInstanceDimensions({ nodeShape: 'composite', width: 160, height: 56 }, {
        width: 320,
        height: 180,
      })
    ).toEqual({
      nodeShape: 'composite',
      width: 320,
      height: 180,
    })
  })
})
