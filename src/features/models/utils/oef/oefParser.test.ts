import { describe, expect, it } from 'vitest'

import { parseOefXml } from './oefParser'
import mainXml from './__fixtures__/Main.xml?raw'

describe('oefParser', () => {
  it('parses archimate Main.xml fixture', () => {
    const parsed = parseOefXml(mainXml)

    expect(parsed.model.id).toBe('id-414f4f9dfd9a4df698fcfe8651fae096')
    expect(parsed.model.name).toBe('Main')
    expect(parsed.elements).toHaveLength(6)
    expect(parsed.relationships).toHaveLength(5)
    expect(parsed.views).toHaveLength(1)
    expect(parsed.views[0]?.nodes).toHaveLength(6)
    expect(parsed.views[0]?.connections).toHaveLength(5)
    expect(parsed.elements.map(item => item.type)).toEqual(
      expect.arrayContaining(['BusinessService', 'BusinessProcess', 'BusinessEvent'])
    )
    expect(parsed.relationships.map(item => item.type)).toEqual(
      expect.arrayContaining(['Serving', 'Triggering'])
    )
  })

  it('throws on malformed xml', () => {
    expect(() => parseOefXml('<model><elements></model>')).toThrow(/Invalid OEF XML/)
  })

  it('throws when model root is missing', () => {
    expect(() => parseOefXml('<root />')).toThrow('Invalid OEF XML: missing <model>')
  })
})
