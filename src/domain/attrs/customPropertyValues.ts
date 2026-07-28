import {
  parseEntityAttrs,
  type CustomProperty,
} from '@/domain/attrs/notationAttrs'

/**
 * Whether a runtime/default value counts as filled for the property type.
 */
export function isCustomPropertyValueFilled(value: unknown, type: string): boolean {
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (typeof value === 'string') return value.trim().length > 0
  return value !== null && value !== undefined
}

export function hasCustomPropertyDefaultValue(property: CustomProperty): boolean {
  return isCustomPropertyValueFilled(property.defaultValue, property.type)
}

export type ApplyDefaultCustomPropertyValuesOptions = {
  /** Skip properties marked `system` (used when syncing notation schemas onto model state). */
  skipSystem?: boolean
}

/**
 * Fill missing keys in `target` from property defaultValue (does not overwrite existing keys).
 */
export function applyDefaultCustomPropertyValues(
  target: Record<string, unknown>,
  customProperties: CustomProperty[],
  options?: ApplyDefaultCustomPropertyValuesOptions,
): void {
  for (const property of customProperties) {
    if (options?.skipSystem && property.system) continue
    if (!property.name) continue
    if (property.defaultValue === undefined) continue
    if (Object.prototype.hasOwnProperty.call(target, property.name)) continue
    target[property.name] = property.defaultValue
  }
}

export function applyDefaultCustomPropertyValuesFromAttrs(
  target: Record<string, unknown>,
  attrsRaw: string | null | undefined,
  options?: ApplyDefaultCustomPropertyValuesOptions,
): void {
  applyDefaultCustomPropertyValues(
    target,
    parseEntityAttrs(attrsRaw ?? null).customProperties,
    options,
  )
}

export function collectDefaultCustomPropertyValues(
  customProperties: CustomProperty[],
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  applyDefaultCustomPropertyValues(defaults, customProperties, { skipSystem: true })
  return defaults
}
