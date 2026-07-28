import { describe, expect, it } from 'vitest'

import { parseOefXml } from './oefParser'
import { validateParsedOefModel } from './oefImportValidation'
import mainXml from './__fixtures__/Main.xml?raw'
import containerAssocXml from './__fixtures__/container-assoc-to-flow.xml?raw'

describe('oefImportValidation', () => {
  it('returns no errors for Main.xml fixture', () => {
    const parsed = parseOefXml(mainXml)
    const validation = validateParsedOefModel(parsed)

    expect(validation.hasErrors).toBe(false)
    expect(validation.issues).toHaveLength(0)
  })

  it('accepts Container nodes and relationship-to-relationship endpoints as non-blocking', () => {
    const parsed = parseOefXml(containerAssocXml)
    const validation = validateParsedOefModel(parsed)
    expect(validation.hasErrors).toBe(false)
    expect(validation.issues.some(issue => issue.code === 'relationshipEndpointIsRelationship')).toBe(
      true
    )
    expect(validation.issues.some(issue => issue.code === 'viewNodeMissingElementRef')).toBe(false)
    expect(validation.issues.some(issue => issue.code === 'viewConnectionMissingTargetNode')).toBe(
      false
    )
  })

  it('reports broken relationship and broken diagram refs', () => {
    const xml = `
      <model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <name>Broken</name>
        <elements>
          <element identifier="el-1" xsi:type="BusinessService"><name>A</name></element>
        </elements>
        <relationships>
          <relationship identifier="rel-1" source="el-1" target="el-missing" xsi:type="Serving" />
        </relationships>
        <views>
          <diagrams>
            <view identifier="view-1" xsi:type="Diagram">
              <name>V1</name>
              <node identifier="node-1" elementRef="el-1" xsi:type="Element" x="10" y="20" />
              <connection identifier="conn-1" relationshipRef="rel-missing" source="node-1" target="node-404" xsi:type="Relationship" />
            </view>
          </diagrams>
        </views>
      </model>
    `
    const parsed = parseOefXml(xml)
    const validation = validateParsedOefModel(parsed)
    const codes = validation.issues.map(issue => issue.code)

    expect(validation.hasErrors).toBe(true)
    expect(codes).toEqual(
      expect.arrayContaining([
        'relationshipMissingTarget',
        'viewConnectionMissingRelationshipRef',
        'viewConnectionMissingTargetNode',
      ])
    )
  })

  it('reports duplicate identifiers', () => {
    const xml = `
      <model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <name>Duplicate IDs</name>
        <elements>
          <element identifier="el-1" xsi:type="BusinessService"><name>A</name></element>
          <element identifier="el-1" xsi:type="BusinessService"><name>B</name></element>
        </elements>
        <relationships />
        <views>
          <diagrams>
            <view identifier="view-1" xsi:type="Diagram">
              <node identifier="node-1" elementRef="el-1" xsi:type="Element" x="1" y="1" />
              <node identifier="node-1" elementRef="el-1" xsi:type="Element" x="2" y="2" />
            </view>
          </diagrams>
        </views>
      </model>
    `
    const parsed = parseOefXml(xml)
    const validation = validateParsedOefModel(parsed)
    const codes = validation.issues.map(issue => issue.code)

    expect(codes).toEqual(expect.arrayContaining(['duplicateElementId', 'duplicateViewNodeId']))
  })
})
