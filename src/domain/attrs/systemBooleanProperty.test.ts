import { describe, expect, it } from 'vitest'
import type { CustomProperty } from './notationAttrs'
import { hasSystemBooleanDefault } from './systemBooleanProperty'

const boolProp = (name: string, defaultValue: boolean): CustomProperty => ({
  id: name,
  name,
  type: 'boolean',
  required: false,
  defaultValue,
  min: null,
  max: null,
})

describe('hasSystemBooleanDefault', () => {
  it('matches name + boolean + default true', () => {
    expect(hasSystemBooleanDefault([boolProp('boundary', true)], 'boundary')).toBe(true)
  })

  it('rejects default false or other names', () => {
    expect(hasSystemBooleanDefault([boolProp('boundary', false)], 'boundary')).toBe(false)
    expect(hasSystemBooleanDefault([boolProp('group', true)], 'boundary')).toBe(false)
  })

  it('treats missing list as empty', () => {
    expect(hasSystemBooleanDefault(undefined, 'group')).toBe(false)
  })
})
