import { describe, expect, it } from 'vitest'
import { clientPointForDrop, worldTopLeftCenteredOnCursor } from './dropCoordinates'

describe('clientPointForDrop', () => {
  it('prefers last dragover point over drop event', () => {
    expect(clientPointForDrop({ x: 0, y: 0 }, { x: 120, y: 80 })).toEqual({ x: 120, y: 80 })
    expect(clientPointForDrop({ x: 10, y: 20 }, { x: 120, y: 80 })).toEqual({ x: 120, y: 80 })
  })

  it('falls back to event when dragover is missing or 0,0', () => {
    expect(clientPointForDrop({ x: 50, y: 60 }, null)).toEqual({ x: 50, y: 60 })
    expect(clientPointForDrop({ x: 50, y: 60 }, { x: 0, y: 0 })).toEqual({ x: 50, y: 60 })
  })
})

describe('worldTopLeftCenteredOnCursor', () => {
  it('centers node on cursor', () => {
    expect(worldTopLeftCenteredOnCursor({ x: 200, y: 100 }, { width: 160, height: 56 })).toEqual({
      x: 120,
      y: 72,
    })
  })

  it('applies snap to top-left', () => {
    const snap = (v: number) => Math.round(v / 20) * 20
    expect(worldTopLeftCenteredOnCursor({ x: 205, y: 98 }, { width: 160, height: 56 }, snap)).toEqual(
      {
        x: 120,
        y: 80,
      }
    )
  })
})
