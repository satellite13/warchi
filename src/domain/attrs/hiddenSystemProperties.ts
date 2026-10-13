/**
 * Имена системных свойств схем (типов нод/связей, компонентов нотации), которые
 * никогда не показываются и не редактируются вручную в UI: маркеры sync-воркера
 * (`auto-created`/`autoCreated`, обе формы имени) и служебные флаги редактора/админ-guards.
 */
const HIDDEN_SYSTEM_PROPERTY_NAMES = new Set([
  'auto-created',
  'autoCreated',
  'group',
  'boundary',
  'locked',
  'noDiagrams',
])

/** Единый предикат скрытых системных свойств (по имени из схемы CustomProperty). */
export function isHiddenSystemProperty(name: string): boolean {
  return HIDDEN_SYSTEM_PROPERTY_NAMES.has(name)
}
