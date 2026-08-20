import type { CustomProperty } from './notationAttrs'

/** True when a boolean custom property is named `name` and defaults to true (editor system flag). */
export function hasSystemBooleanDefault(
  properties: CustomProperty[] | undefined,
  name: string,
): boolean {
  return (properties ?? []).some(
    property => property.name === name && property.type === 'boolean' && property.defaultValue === true,
  )
}
