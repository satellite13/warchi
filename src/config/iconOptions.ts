/**
 * Combined icon list (Archimate + Material) — все лежат в public/icons/ как SVG.
 * Use COMBINED_ICON_OPTIONS everywhere we select icons.
 */
import { ARCHIMATE_ICON_OPTIONS } from './availableIcons'
import { INTERACTIVE_BADGE_ICONS } from './interactiveBadgeIcons'

export type IconOption = { id: string; label: string }

export function sanitizeIconOptions(options: IconOption[]): IconOption[] {
  const seen = new Set<string>()
  return options.flatMap((option) => {
    const id = option.id.trim()
    if (!id || seen.has(id)) return []
    seen.add(id)
    return [{ id, label: option.label }]
  })
}

/**
 * Архимейт-иконки идут первыми и имеют приоритет при совпадении id.
 */
export const COMBINED_ICON_OPTIONS: IconOption[] = sanitizeIconOptions([
  ...ARCHIMATE_ICON_OPTIONS.map(({ id, label }) => ({ id, label })),
  ...INTERACTIVE_BADGE_ICONS,
])

/** Иконки по умолчанию для сущностей. */
export const DEFAULT_ENTITY_ICONS = {
  /** Модель (каталог, главная, навигация). */
  model: 'schema',
  /** Нотация (каталог, главная, навигация). */
  notation: 'account_tree',
  /** Тип узла (редактор типов: список, форма, использование). */
  nodeType: 'category',
  /** Компонент нотации (список элементов, кнопка «добавить компонент»). */
  component: 'widgets',
  /** Узел в дереве модели, общий «узел» где не различаем тип/компонент. */
  node: 'category',
  /** Тип связи, отношение, элемент списка типов (связь). */
  link: 'cable',
  /** Папка в дереве модели. */
  folder: 'folder',
} as const
