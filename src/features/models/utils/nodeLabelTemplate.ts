import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import { resolveLabelTemplate } from '@/domain/attrs/labelTemplate'

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
  ctx: DiagramNodeLabelTemplateContext,
): string {
  return resolveLabelTemplate(
    template,
    nodeName,
    ctx.componentProperties,
    ctx.typeProperties,
    {
      typeValues: ctx.typeValues,
      componentValues: ctx.componentValues,
    },
  )
}
