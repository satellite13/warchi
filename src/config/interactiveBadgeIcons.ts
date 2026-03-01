/**
 * Material Symbols Outlined icon names for interactive property badges on diagram.
 * Used in CustomPropertiesPanel (notation editor) and for building badge icon URLs.
 * List is generated from @material-design-icons/svg/outlined (run npm run generate:badge-icon-names).
 */
import { MATERIAL_SYMBOLS_OUTLINED_NAMES } from './materialSymbolsOutlinedNames.generated'

function iconLabel(name: string): string {
  return name.replace(/_/g, ' ')
}

export const INTERACTIVE_BADGE_ICONS: { id: string; label: string }[] =
  MATERIAL_SYMBOLS_OUTLINED_NAMES.map((id) => ({ id, label: iconLabel(id) }))

export const DEFAULT_INTERACTIVE_BADGE_ICON = 'link'

export function getInteractiveBadgeIconIds(): string[] {
  return INTERACTIVE_BADGE_ICONS.map((item) => item.id)
}
