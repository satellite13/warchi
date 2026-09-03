import { describe, expect, it } from 'vitest'
import { parseOutlineSegments, parseOutlineSegmentsOrEmpty } from './outline'
import { DEFAULT_RECTANGLE_OUTLINE } from './notationAttrs'

describe('outline parse', () => {
  it('returns null for empty/invalid', () => {
    expect(parseOutlineSegments(null)).toBeNull()
    expect(parseOutlineSegments('')).toBeNull()
    expect(parseOutlineSegments('[]')).toBeNull()
    expect(parseOutlineSegments('not-json')).toBeNull()
  })

  it('parses segments and empty fallback', () => {
    const json = JSON.stringify(DEFAULT_RECTANGLE_OUTLINE)
    expect(parseOutlineSegments(json)).toEqual(DEFAULT_RECTANGLE_OUTLINE)
    expect(parseOutlineSegmentsOrEmpty(null)).toEqual([])
    expect(parseOutlineSegmentsOrEmpty(json)).toEqual(DEFAULT_RECTANGLE_OUTLINE)
  })
})
