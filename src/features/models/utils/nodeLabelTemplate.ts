import type { CustomProperty } from '@/domain/attrs/notationAttrs'

export type DiagramNodeLabelTemplateContext = {
  typeProperties: CustomProperty[]
  typeValues: Record<string, unknown>
  componentProperties: CustomProperty[]
  componentValues: Record<string, unknown>
}

/**
 * Шаблон подписи на модельной диаграмме:
 * - `#{prop}` — кастомное свойство **типа ноды** (`attrs.typeProperties`);
 * - `${prop}` — кастомное свойство **компонента нотации** (scoped на диаграмме);
 * - `${name}` — имя ноды (зарезервировано, не из свойств компонента).
 */
export function resolveDiagramNodeLabelTemplate(
  template: string,
  nodeName: string,
  ctx: DiagramNodeLabelTemplateContext
): string {
  let out = template
  out = out.replace(/#\{(\w+)\}/g, (_m, key: string) => {
    const prop = ctx.typeProperties.find(p => p.name === key)
    if (!prop) return ''
    const val = ctx.typeValues[key] ?? prop.defaultValue
    return val != null ? String(val) : ''
  })
  out = out.replace(/\$\{(\w+)\}/g, (_m, key: string) => {
    if (key === 'name') return nodeName
    const prop = ctx.componentProperties.find(p => p.name === key)
    if (!prop) return ''
    const val = ctx.componentValues[key] ?? prop.defaultValue
    return val != null ? String(val) : ''
  })
  return out.replace(/\\n/g, '\n')
}
