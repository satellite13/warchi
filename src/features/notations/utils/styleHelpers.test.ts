import { describe, expect, it } from 'vitest'
import {
  getLabelSpacing,
  insetToPlain,
  normalizeIconPlacement,
  setLabelSpacing,
  toInsetNumber,
  toInsetSides,
} from './styleHelpers'

// ── normalizeIconPlacement ────────────────────────────────

describe('normalizeIconPlacement', () => {
  it('returns a valid placement string as-is', () => {
    expect(normalizeIconPlacement('center')).toBe('center')
    expect(normalizeIconPlacement('top')).toBe('top')
    expect(normalizeIconPlacement('bottom')).toBe('bottom')
    expect(normalizeIconPlacement('left')).toBe('left')
    expect(normalizeIconPlacement('right')).toBe('right')
    expect(normalizeIconPlacement('top-left')).toBe('top-left')
    expect(normalizeIconPlacement('top-right')).toBe('top-right')
    expect(normalizeIconPlacement('bottom-left')).toBe('bottom-left')
    expect(normalizeIconPlacement('bottom-right')).toBe('bottom-right')
  })

  it('returns default fallback "top-left" for invalid strings', () => {
    expect(normalizeIconPlacement('invalid')).toBe('top-left')
    expect(normalizeIconPlacement('')).toBe('top-left')
    expect(normalizeIconPlacement('CENTER')).toBe('top-left')
  })

  it('returns custom fallback for invalid strings', () => {
    expect(normalizeIconPlacement('invalid', 'center')).toBe('center')
  })

  it('returns fallback for null', () => {
    expect(normalizeIconPlacement(null)).toBe('top-left')
  })

  it('returns fallback for undefined', () => {
    expect(normalizeIconPlacement(undefined)).toBe('top-left')
  })

  it('returns fallback for a number', () => {
    expect(normalizeIconPlacement(42)).toBe('top-left')
  })

  it('returns fallback for NaN', () => {
    expect(normalizeIconPlacement(NaN)).toBe('top-left')
  })

  it('returns fallback for Infinity', () => {
    expect(normalizeIconPlacement(Infinity)).toBe('top-left')
  })

  it('returns fallback for boolean', () => {
    expect(normalizeIconPlacement(true)).toBe('top-left')
  })

  it('returns fallback for an object', () => {
    expect(normalizeIconPlacement({ placement: 'center' })).toBe('top-left')
  })

  it('returns fallback for an array', () => {
    expect(normalizeIconPlacement(['center'])).toBe('top-left')
  })
})

// ── toInsetSides ──────────────────────────────────────────

describe('toInsetSides', () => {
  it('creates uniform sides from a number', () => {
    expect(toInsetSides(10)).toEqual({ top: 10, right: 10, bottom: 10, left: 10 })
  })

  it('creates uniform sides from 0', () => {
    expect(toInsetSides(0)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('creates uniform sides from a negative number', () => {
    expect(toInsetSides(-5)).toEqual({ top: -5, right: -5, bottom: -5, left: -5 })
  })

  it('extracts individual sides from an object', () => {
    expect(toInsetSides({ top: 1, right: 2, bottom: 3, left: 4 })).toEqual({
      top: 1,
      right: 2,
      bottom: 3,
      left: 4,
    })
  })

  it('uses fallback for missing sides in an object', () => {
    expect(toInsetSides({ top: 5 })).toEqual({ top: 5, right: 0, bottom: 0, left: 0 })
  })

  it('uses custom fallback for missing sides', () => {
    expect(toInsetSides({ top: 5 }, 10)).toEqual({ top: 5, right: 10, bottom: 10, left: 10 })
  })

  it('uses fallback for NaN values in object', () => {
    expect(toInsetSides({ top: NaN, right: 2 })).toEqual({
      top: 0,
      right: 2,
      bottom: 0,
      left: 0,
    })
  })

  it('uses fallback for Infinity values in object', () => {
    expect(toInsetSides({ top: Infinity })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('uses fallback for string values in object', () => {
    expect(toInsetSides({ top: '10' as unknown })).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })
  })

  it('returns all fallback for null', () => {
    expect(toInsetSides(null)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('returns all fallback for undefined', () => {
    expect(toInsetSides(undefined)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('returns all fallback for NaN', () => {
    expect(toInsetSides(NaN)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('returns all fallback for Infinity', () => {
    expect(toInsetSides(Infinity)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('returns all fallback for a string', () => {
    expect(toInsetSides('10')).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('returns all fallback for a boolean', () => {
    expect(toInsetSides(true)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('handles an empty object', () => {
    expect(toInsetSides({})).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('uses custom fallback for all sides', () => {
    expect(toInsetSides(null, 5)).toEqual({ top: 5, right: 5, bottom: 5, left: 5 })
  })
})

// ── toInsetNumber ─────────────────────────────────────────

describe('toInsetNumber', () => {
  it('returns the number itself for a finite number', () => {
    expect(toInsetNumber(42)).toBe(42)
    expect(toInsetNumber(0)).toBe(0)
    expect(toInsetNumber(-3)).toBe(-3)
  })

  it('returns fallback for NaN', () => {
    expect(toInsetNumber(NaN)).toBe(0)
  })

  it('returns fallback for Infinity', () => {
    expect(toInsetNumber(Infinity)).toBe(0)
    expect(toInsetNumber(-Infinity)).toBe(0)
  })

  it('returns the first valid number from an object (priority: top, right, bottom, left)', () => {
    expect(toInsetNumber({ top: 5, right: 10 })).toBe(5)
    expect(toInsetNumber({ right: 10, bottom: 20 })).toBe(10)
    expect(toInsetNumber({ bottom: 20, left: 30 })).toBe(20)
    expect(toInsetNumber({ left: 30 })).toBe(30)
  })

  it('skips invalid numeric fields in the object', () => {
    expect(toInsetNumber({ top: NaN, right: 7 })).toBe(7)
    expect(toInsetNumber({ top: Infinity, right: NaN, bottom: 3 })).toBe(3)
  })

  it('returns fallback for an object with no valid numbers', () => {
    expect(toInsetNumber({ top: NaN, right: Infinity })).toBe(0)
    expect(toInsetNumber({})).toBe(0)
  })

  it('returns fallback for null', () => {
    expect(toInsetNumber(null)).toBe(0)
  })

  it('returns fallback for undefined', () => {
    expect(toInsetNumber(undefined)).toBe(0)
  })

  it('returns fallback for a string', () => {
    expect(toInsetNumber('10')).toBe(0)
  })

  it('returns custom fallback', () => {
    expect(toInsetNumber(null, 99)).toBe(99)
    expect(toInsetNumber({}, 42)).toBe(42)
  })
})

// ── insetToPlain ──────────────────────────────────────────

describe('insetToPlain', () => {
  it('returns a plain object with top, right, bottom, left', () => {
    const result = insetToPlain({ top: 1, right: 2, bottom: 3, left: 4 })
    expect(result).toEqual({ top: 1, right: 2, bottom: 3, left: 4 })
  })

  it('returns zeros for zero insets', () => {
    expect(insetToPlain({ top: 0, right: 0, bottom: 0, left: 0 })).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })
  })
})

// ── getLabelSpacing ───────────────────────────────────────

describe('getLabelSpacing', () => {
  it('returns the label object as TextLabelWithSpacing if it is an object', () => {
    const label = { inset: 5 }
    expect(getLabelSpacing(label)).toBe(label)
  })

  it('returns empty object for null', () => {
    expect(getLabelSpacing(null)).toEqual({})
  })

  it('returns empty object for undefined', () => {
    expect(getLabelSpacing(undefined)).toEqual({})
  })

  it('returns empty object for a string', () => {
    expect(getLabelSpacing('hello')).toEqual({})
  })

  it('returns empty object for a number', () => {
    expect(getLabelSpacing(42)).toEqual({})
  })

  it('returns empty object for a boolean', () => {
    expect(getLabelSpacing(false)).toEqual({})
  })

  it('returns the same reference for an object', () => {
    const label = { inset: { top: 1, right: 2, bottom: 3, left: 4 } }
    const result = getLabelSpacing(label)
    expect(result).toBe(label)
  })
})

// ── setLabelSpacing ───────────────────────────────────────

describe('setLabelSpacing', () => {
  it('sets inset on the label object when spacing.inset is provided', () => {
    const label: { inset?: unknown } = {}
    setLabelSpacing(label, { inset: 10 })
    expect(label.inset).toBe(10)
  })

  it('sets inset to an object value', () => {
    const label: { inset?: unknown } = {}
    setLabelSpacing(label, { inset: { top: 1, right: 2, bottom: 3, left: 4 } })
    expect(label.inset).toEqual({ top: 1, right: 2, bottom: 3, left: 4 })
  })

  it('does not set inset when spacing.inset is undefined', () => {
    const label: { inset?: unknown } = { inset: 5 }
    setLabelSpacing(label, {})
    expect(label.inset).toBe(5)
  })

  it('sets inset to 0 when spacing.inset is 0', () => {
    const label: { inset?: unknown } = { inset: 5 }
    setLabelSpacing(label, { inset: 0 })
    expect(label.inset).toBe(0)
  })

  it('does nothing when label is null', () => {
    expect(() => setLabelSpacing(null, { inset: 10 })).not.toThrow()
  })

  it('does nothing when label is undefined', () => {
    expect(() => setLabelSpacing(undefined, { inset: 10 })).not.toThrow()
  })

  it('does nothing when label is a number', () => {
    expect(() => setLabelSpacing(42, { inset: 10 })).not.toThrow()
  })

  it('does nothing when label is a string', () => {
    expect(() => setLabelSpacing('hello', { inset: 10 })).not.toThrow()
  })
})
