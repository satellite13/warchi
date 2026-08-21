import { describe, expect, it } from 'vitest'
import {
  clientPointForDrop,
  worldTopLeftCenteredOnCursor,
  worldTopLeftCenteredOnScreenPoint,
} from './dropCoordinates'

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

describe('worldTopLeftCenteredOnScreenPoint', () => {
  it('converts the screen point and centers a styled node at that world point', () => {
    const screenToWorld = (point: { x: number; y: number }) => ({
      x: (point.x - 100) / 2,
      y: (point.y - 40) / 2,
    })

    expect(
      worldTopLeftCenteredOnScreenPoint(
        { x: 500, y: 340 },
        screenToWorld,
        { width: 240, height: 80 }
      )
    ).toEqual({ x: 80, y: 110 })
  })
})
