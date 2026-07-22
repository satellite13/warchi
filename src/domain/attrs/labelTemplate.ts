import type { CustomProperty } from '@/domain/attrs/notationAttrs'

export type LabelTemplateValues = {
  typeValues?: Record<string, unknown>
  componentValues?: Record<string, unknown>
}

/**
 * Shared label template engine for notation preview and model diagrams:
 * - `#{prop}` — node-type custom property
 * - `${prop}` — notation-component custom property
 * - `${name}` — element/node name
 *
 * When runtime values are omitted, falls back to property defaultValue (notation preview).
 */
export function resolveLabelTemplate(
  template: string,
  name: string,
  componentProperties: CustomProperty[],
  typeProperties: CustomProperty[] = [],
  values?: LabelTemplateValues,
): string {
  let out = template
  out = out.replace(/#\{(\w+)\}/g, (_m, key: string) => {
    const prop = typeProperties.find(p => p.name === key)
    if (!prop) return ''
    const val = values?.typeValues?.[key] ?? prop.defaultValue
    return val != null ? String(val) : ''
  })
  out = out.replace(/\$\{(\w+)\}/g, (_m, key: string) => {
    if (key === 'name') return name
    const prop = componentProperties.find(p => p.name === key)
    if (!prop) return ''
    const val = values?.componentValues?.[key] ?? prop.defaultValue
    return val != null ? String(val) : ''
  })
  return out.replace(/\\n/g, '\n')
}
