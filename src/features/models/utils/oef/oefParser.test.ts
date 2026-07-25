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
    expect(parsed.views[0]?.nodes).toHaveLength(7)
    expect(parsed.views[0]?.connections).toHaveLength(6)
    expect(parsed.elements.map(item => item.type)).toEqual(
      expect.arrayContaining(['BusinessService', 'BusinessProcess', 'BusinessEvent'])
    )
    expect(parsed.relationships.map(item => item.type)).toEqual(
      expect.arrayContaining(['Serving', 'Triggering'])
    )
  })

  it('parses relationship name', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="m1">
  <name>Named</name>
  <elements>
    <element identifier="el-a" xsi:type="BusinessProcess"><name>A</name></element>
    <element identifier="el-b" xsi:type="BusinessProcess"><name>B</name></element>
  </elements>
  <relationships>
    <relationship identifier="rel-1" source="el-a" target="el-b" xsi:type="Flow">
      <name>My flow</name>
    </relationship>
  </relationships>
  <views><diagrams /></views>
</model>`
    const parsed = parseOefXml(xml)
    expect(parsed.relationships).toHaveLength(1)
    expect(parsed.relationships[0]?.name).toBe('My flow')
  })

  it('throws on malformed xml', () => {
    expect(() => parseOefXml('<model><elements></model>')).toThrow(/Invalid OEF XML/)
  })

  it('throws when model root is missing', () => {
    expect(() => parseOefXml('<root />')).toThrow('Invalid OEF XML: missing <model>')
  })
})
