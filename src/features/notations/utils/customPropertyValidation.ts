import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import { hasCustomPropertyDefaultValue as hasDefaultValue } from '@/domain/attrs/customPropertyValues'

export type TranslateFn = (key: string) => string

export function hasCustomPropertyDefaultValue(property: CustomProperty): boolean {
  return hasDefaultValue(property)
}

export function customPropertyValidationErrors(
  property: CustomProperty,
  t: TranslateFn
): string[] {
  const errors: string[] = []

  if (!property.name.trim()) {
    errors.push(t('types.validationNameRequired'))
  }

  if (property.regex) {
    try {
      new RegExp(property.regex)
    } catch {
      errors.push(t('types.validationRegexInvalid'))
    }
  }

  if (
    property.type === 'number' &&
    property.min !== null &&
    property.max !== null &&
    property.min > property.max
  ) {
    errors.push(t('types.validationMinGtMax'))
  }

  if (property.type === 'enum' && (!property.enumValues || !property.enumValues.length)) {
    errors.push(t('types.validationEnumEmpty'))
  }

  if (property.required && !hasCustomPropertyDefaultValue(property)) {
    errors.push(t('types.validationRequiredDefault'))
  }

  return errors
}
