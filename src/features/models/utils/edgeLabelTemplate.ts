import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import { resolveLabelTemplate } from '@/domain/attrs/labelTemplate'

export type DiagramEdgeLabelTemplateContext = {
  typeProperties: CustomProperty[]
  typeValues: Record<string, unknown>
  relationProperties: CustomProperty[]
  relationValues: Record<string, unknown>
}

/**
 * Шаблон подписи связи на модельной диаграмме:
 * - `#{prop}` — кастомное свойство **типа связи** (`attrs.typeProperties`);
 * - `${prop}` — кастомное свойство **отношения нотации** (scoped на диаграмме);
 * - `${name}` — имя отношения (зарезервировано, не из свойств отношения).
 */
export function resolveDiagramEdgeLabelTemplate(
  template: string,
  relationName: string,
  ctx: DiagramEdgeLabelTemplateContext,
): string {
  return resolveLabelTemplate(
    template,
    relationName,
    ctx.relationProperties,
    ctx.typeProperties,
    {
      typeValues: ctx.typeValues,
      componentValues: ctx.relationValues,
    },
  )
}
