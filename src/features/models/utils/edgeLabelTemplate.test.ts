import { describe, expect, it } from 'vitest'
import { resolveDiagramEdgeLabelTemplate } from './edgeLabelTemplate'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'

function prop(
  overrides: Partial<CustomProperty> & { id: string; name: string }
): CustomProperty {
  return {
    type: 'string',
    required: false,
    min: null,
    max: null,
    ...overrides,
  }
}

describe('resolveDiagramEdgeLabelTemplate', () => {
  it('resolves ${name}', () => {
    expect(
      resolveDiagramEdgeLabelTemplate('<<${name}>>', 'Serving', {
        typeProperties: [],
        typeValues: {},
        relationProperties: [],
        relationValues: {},
      })
    ).toBe('<<Serving>>')
  })

  it('resolves #{code}+${protocol}', () => {
    expect(
      resolveDiagramEdgeLabelTemplate('#{code}+${protocol}', 'Link', {
        typeProperties: [prop({ id: '1', name: 'code', defaultValue: 'DEF' })],
        typeValues: { code: 'HTTP' },
        relationProperties: [prop({ id: '2', name: 'protocol', defaultValue: '1.0' })],
        relationValues: { protocol: '2.0' },
      })
    ).toBe('HTTP+2.0')
  })

  it('does not read type values for ${prop}', () => {
    expect(
      resolveDiagramEdgeLabelTemplate('${code}', 'X', {
        typeProperties: [prop({ id: '1', name: 'code', defaultValue: 'A' })],
        typeValues: { code: 'B' },
        relationProperties: [],
        relationValues: {},
      })
    ).toBe('')
  })

  it('does not read relation values for #{prop}', () => {
    expect(
      resolveDiagramEdgeLabelTemplate('#{code}', 'X', {
        typeProperties: [],
        typeValues: { code: 'only-here' },
        relationProperties: [prop({ id: '2', name: 'code', defaultValue: 'c' })],
        relationValues: { code: 'rel' },
      })
    ).toBe('')
  })
})
