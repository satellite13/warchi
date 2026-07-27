import { describe, expect, it } from 'vitest'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import {
  convertOefPropertyValue,
  mergeOefPropertiesIntoBuckets,
} from './oefPropertyConversion'

function prop(
  overrides: Partial<CustomProperty> & { name: string; type: CustomProperty['type'] }
): CustomProperty {
  return {
    id: overrides.id ?? 'p1',
    name: overrides.name,
    type: overrides.type,
    required: false,
    min: null,
    max: null,
    enumValues: overrides.enumValues,
    defaultValue: overrides.defaultValue,
  }
}

describe('convertOefPropertyValue', () => {
  it('string: trims and accepts non-empty', () => {
    expect(convertOefPropertyValue('  hi ', prop({ name: 'a', type: 'string' }))).toEqual({
      ok: true,
      value: 'hi',
    })
  })

  it('string: empty after trim → skip (not fail)', () => {
    expect(convertOefPropertyValue('  ', prop({ name: 'a', type: 'string' }))).toEqual({
      ok: 'skip',
    })
  })

  it('number: parses finite', () => {
    expect(convertOefPropertyValue(' 42.5 ', prop({ name: 'n', type: 'number' }))).toEqual({
      ok: true,
      value: 42.5,
    })
  })

  it('number: rejects non-numeric', () => {
    expect(convertOefPropertyValue('abc', prop({ name: 'n', type: 'number' }))).toEqual({
      ok: false,
      reason: 'invalidNumber',
    })
  })

  it('boolean: accepts true/1/yes and false/0/no case-insensitive', () => {
    const p = prop({ name: 'b', type: 'boolean' })
    expect(convertOefPropertyValue('YES', p)).toEqual({ ok: true, value: true })
    expect(convertOefPropertyValue('0', p)).toEqual({ ok: true, value: false })
  })

  it('boolean: rejects unknown', () => {
    expect(convertOefPropertyValue('maybe', prop({ name: 'b', type: 'boolean' }))).toEqual({
      ok: false,
      reason: 'invalidBoolean',
    })
  })

  it('enum: exact match against enumValues', () => {
    const p = prop({ name: 'e', type: 'enum', enumValues: ['Draft', 'Done'] })
    expect(convertOefPropertyValue('Draft', p)).toEqual({ ok: true, value: 'Draft' })
    expect(convertOefPropertyValue('draft', p)).toEqual({ ok: false, reason: 'invalidEnum' })
  })
})

describe('mergeOefPropertiesIntoBuckets', () => {
  it('writes into all matching schemas and overrides defaults', () => {
    const result = mergeOefPropertiesIntoBuckets({
      oefProperties: { Owner: 'Team A', Status: 'live' },
      typeDefaults: { Owner: 'Default' },
      componentDefaults: { Status: 'draft' },
      typeSchema: [prop({ name: 'Owner', type: 'string' })],
      componentSchema: [prop({ name: 'Status', type: 'string' })],
      entityId: 'el-1',
      entityKind: 'node',
    })
    expect(result.typeValues.Owner).toBe('Team A')
    expect(result.componentValues.Status).toBe('live')
    expect(result.conversionFailures).toHaveLength(0)
    expect(result.unmatchedNames).toEqual([])
  })

  it('records unmatched names and conversion failures without wiping defaults', () => {
    const result = mergeOefPropertiesIntoBuckets({
      oefProperties: { Owner: 'x', Extra: '1', Count: 'nope' },
      typeDefaults: { Count: 3 },
      componentDefaults: {},
      typeSchema: [
        prop({ name: 'Count', type: 'number' }),
        prop({ name: 'Owner', type: 'string' }),
      ],
      componentSchema: [],
      entityId: 'el-1',
      entityKind: 'node',
    })
    expect(result.typeValues.Count).toBe(3)
    expect(result.typeValues.Owner).toBe('x')
    expect(result.unmatchedNames).toEqual(['Extra'])
    expect(result.conversionFailures).toEqual([
      expect.objectContaining({ propertyName: 'Count', targetType: 'number' }),
    ])
  })

  it('matches names with trim but case-sensitive', () => {
    const result = mergeOefPropertiesIntoBuckets({
      oefProperties: { ' Owner ': 'A', owner: 'B' },
      typeDefaults: {},
      componentDefaults: {},
      typeSchema: [prop({ name: 'Owner', type: 'string' })],
      componentSchema: [],
      entityId: 'el-1',
      entityKind: 'node',
    })
    expect(result.typeValues.Owner).toBe('A')
    expect(result.unmatchedNames).toEqual(['owner'])
  })
})
