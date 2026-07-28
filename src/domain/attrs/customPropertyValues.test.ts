import { describe, expect, it } from 'vitest'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import {
  applyDefaultCustomPropertyValues,
  collectDefaultCustomPropertyValues,
  hasCustomPropertyDefaultValue,
  isCustomPropertyValueFilled,
} from './customPropertyValues'

function prop(overrides: Partial<CustomProperty> & { name: string }): CustomProperty {
  return {
    id: overrides.id ?? overrides.name,
    type: 'string',
    required: false,
    min: null,
    max: null,
    ...overrides,
  }
}

describe('isCustomPropertyValueFilled', () => {
  it('handles string/number/boolean', () => {
    expect(isCustomPropertyValueFilled('x', 'string')).toBe(true)
    expect(isCustomPropertyValueFilled('  ', 'string')).toBe(false)
    expect(isCustomPropertyValueFilled(1, 'number')).toBe(true)
    expect(isCustomPropertyValueFilled(Number.NaN, 'number')).toBe(false)
    expect(isCustomPropertyValueFilled(false, 'boolean')).toBe(true)
    expect(isCustomPropertyValueFilled(null, 'boolean')).toBe(false)
  })
})

describe('hasCustomPropertyDefaultValue', () => {
  it('delegates to filled-check on defaultValue', () => {
    expect(hasCustomPropertyDefaultValue(prop({ name: 'a', defaultValue: 'ok' }))).toBe(true)
    expect(hasCustomPropertyDefaultValue(prop({ name: 'a' }))).toBe(false)
  })
})

describe('applyDefaultCustomPropertyValues', () => {
  it('fills missing defaults and keeps existing keys', () => {
    const target: Record<string, unknown> = { a: 'keep' }
    applyDefaultCustomPropertyValues(target, [
      prop({ name: 'a', defaultValue: 'new' }),
      prop({ name: 'b', defaultValue: 2 }),
      prop({ name: 'c' }),
    ])
    expect(target).toEqual({ a: 'keep', b: 2 })
  })

  it('can skip system properties', () => {
    const target: Record<string, unknown> = {}
    applyDefaultCustomPropertyValues(
      target,
      [
        prop({ name: 'sys', defaultValue: 'x', system: true }),
        prop({ name: 'user', defaultValue: 'y' }),
      ],
      { skipSystem: true },
    )
    expect(target).toEqual({ user: 'y' })
  })
})

describe('collectDefaultCustomPropertyValues', () => {
  it('builds a defaults map skipping system props', () => {
    expect(
      collectDefaultCustomPropertyValues([
        prop({ name: 'sys', defaultValue: 'x', system: true }),
        prop({ name: 'user', defaultValue: 'y' }),
      ]),
    ).toEqual({ user: 'y' })
  })
})
