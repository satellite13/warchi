import { describe, expect, it } from 'vitest'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import { customPropertyValidationErrors } from './customPropertyValidation'

const t = (key: string) => key

function property(overrides: Partial<CustomProperty> = {}): CustomProperty {
  return {
    id: 'prop-1',
    name: 'Property',
    type: 'string',
    required: false,
    min: null,
    max: null,
    enumValues: [],
    ...overrides,
  }
}

describe('customPropertyValidationErrors', () => {
  it('reports empty names', () => {
    expect(customPropertyValidationErrors(property({ name: '   ' }), t)).toContain(
      'types.validationNameRequired'
    )
  })

  it('reports invalid regular expressions', () => {
    expect(customPropertyValidationErrors(property({ regex: '[' }), t)).toContain(
      'types.validationRegexInvalid'
    )
  })

  it('reports number ranges where min is greater than max', () => {
    expect(
      customPropertyValidationErrors(property({ type: 'number', min: 10, max: 2 }), t)
    ).toContain('types.validationMinGtMax')
  })

  it('reports enum properties without values', () => {
    expect(customPropertyValidationErrors(property({ type: 'enum', enumValues: [] }), t)).toContain(
      'types.validationEnumEmpty'
    )
  })

  it('reports required properties without default values', () => {
    expect(customPropertyValidationErrors(property({ required: true, defaultValue: '' }), t)).toContain(
      'types.validationRequiredDefault'
    )
  })
})
