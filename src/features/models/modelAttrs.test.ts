import { describe, expect, it } from 'vitest'
import { parseLinkAttrs, serializeLinkAttrs } from './modelAttrs'

describe('parseLinkAttrs', () => {
  it('defaults typeProperties to {} when missing', () => {
    expect(parseLinkAttrs(null).typeProperties).toEqual({})
    expect(parseLinkAttrs('{}').typeProperties).toEqual({})
  })

  it('parses typeProperties and round-trips through serialize', () => {
    const raw = JSON.stringify({
      notationRelations: { 'notation-1': { relationId: 'rel-1' } },
      typeProperties: { code: 'L1', count: 3 },
    })
    const parsed = parseLinkAttrs(raw)
    expect(parsed.typeProperties).toEqual({ code: 'L1', count: 3 })

    const roundTripped = parseLinkAttrs(serializeLinkAttrs(parsed))
    expect(roundTripped.typeProperties).toEqual({ code: 'L1', count: 3 })
    expect(roundTripped.notationRelations).toEqual(parsed.notationRelations)
  })
})
