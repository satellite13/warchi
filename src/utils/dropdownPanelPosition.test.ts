import { describe, expect, it, afterEach, vi } from 'vitest'
import { computeDropdownPanelPlacement } from './dropdownPanelPosition'

function anchor(left: number, width: number): DOMRect {
  return {
    left,
    right: left + width,
    top: 100,
    bottom: 132,
    width,
    height: 32,
    x: left,
    y: 100,
    toJSON() {
      return {}
    },
  } as DOMRect
}

describe('computeDropdownPanelPlacement', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('grows wider than the control so a long option keeps its version', () => {
    vi.spyOn(globalThis, 'innerWidth', 'get').mockReturnValue(800)
    vi.spyOn(globalThis, 'innerHeight', 'get').mockReturnValue(600)

    const placement = computeDropdownPanelPlacement(anchor(600, 180), { contentWidth: 320 })

    expect(placement.width).toBe(320)
    expect(placement.left + placement.width).toBeLessThanOrEqual(800 - 8)
    expect(placement.left).toBe(800 - 8 - 320)
  })

  it('stays at least as wide as the control when every option fits', () => {
    vi.spyOn(globalThis, 'innerWidth', 'get').mockReturnValue(800)
    vi.spyOn(globalThis, 'innerHeight', 'get').mockReturnValue(600)

    const placement = computeDropdownPanelPlacement(anchor(40, 180), { contentWidth: 90 })

    expect(placement.width).toBe(180)
    expect(placement.left).toBe(40)
  })

  it('caps the menu at the viewport when the label is wider than the screen', () => {
    vi.spyOn(globalThis, 'innerWidth', 'get').mockReturnValue(320)
    vi.spyOn(globalThis, 'innerHeight', 'get').mockReturnValue(600)

    const placement = computeDropdownPanelPlacement(anchor(40, 120), { contentWidth: 900 })

    expect(placement.width).toBe(320 - 16)
    expect(placement.left).toBe(8)
  })
})
