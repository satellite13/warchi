import { describe, expect, it } from 'vitest'
import {
  parseLinkAttrs,
  parseNodeAttrs,
  serializeLinkAttrs,
  serializeNodeAttrs,
} from './modelAttrs'

describe('parseNodeAttrs', () => {
  it('preserves the dpc scope (org-tree-sync marker) through round-trip', () => {
    const raw = JSON.stringify({
      typeProperties: { autoCreated: true },
      dpc: { kind: 'appProduct', id: 'P1', autoCreated: true },
    })
    const parsed = parseNodeAttrs(raw)
    expect(parsed.dpc).toEqual({ kind: 'appProduct', id: 'P1', autoCreated: true })
    expect(parsed.dpc?.autoCreated).toBe(true)

    const roundTripped = parseNodeAttrs(serializeNodeAttrs(parsed))
    expect(roundTripped.dpc).toEqual({ kind: 'appProduct', id: 'P1', autoCreated: true })
  })

  it('omits dpc when absent and for non-object values', () => {
    expect(parseNodeAttrs('{"typeProperties":{}}').dpc).toBeUndefined()
    expect(parseNodeAttrs('{"dpc":"broken"}').dpc).toBeUndefined()
  })
})

describe('parseLinkAttrs', () => {
  it('preserves the dpc scope through round-trip', () => {
    const raw = JSON.stringify({ dpc: { kind: 'link', autoCreated: true } })
    const parsed = parseLinkAttrs(raw)
    expect(parsed.dpc).toEqual({ kind: 'link', autoCreated: true })

    const roundTripped = parseLinkAttrs(serializeLinkAttrs(parsed))
    expect(roundTripped.dpc).toEqual({ kind: 'link', autoCreated: true })
  })
})
