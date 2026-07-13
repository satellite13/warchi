import { describe, expect, it } from 'vitest'
import { resolveDiagramNodeLabelTemplate } from './nodeLabelTemplate'
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

describe('resolveDiagramNodeLabelTemplate', () => {
  it('resolves #{key} from type values and schema', () => {
    expect(
      resolveDiagramNodeLabelTemplate('#{code}: ${name}', 'N1', {
        typeProperties: [prop({ id: '1', name: 'code', defaultValue: 'DEF' })],
        typeValues: { code: 'T-1' },
        componentProperties: [],
        componentValues: {},
      })
    ).toBe('T-1: N1')
  })

  it('resolves ${key} from component values only', () => {
    expect(
      resolveDiagramNodeLabelTemplate('${name} [${st}]', 'X', {
        typeProperties: [],
        typeValues: {},
        componentProperties: [prop({ id: '2', name: 'st', defaultValue: 'ok' })],
        componentValues: { st: 'live' },
      })
    ).toBe('X [live]')
  })

  it('does not read type values for ${prop}', () => {
    expect(
      resolveDiagramNodeLabelTemplate('${code}', 'X', {
        typeProperties: [prop({ id: '1', name: 'code', defaultValue: 'A' })],
        typeValues: { code: 'B' },
        componentProperties: [],
        componentValues: {},
      })
    ).toBe('')
  })

  it('does not read component values for #{prop}', () => {
    expect(
      resolveDiagramNodeLabelTemplate('#{st}', 'X', {
        typeProperties: [],
        typeValues: { st: 'only-here' },
        componentProperties: [prop({ id: '2', name: 'st', defaultValue: 'c' })],
        componentValues: { st: 'comp' },
      })
    ).toBe('')
  })
})
