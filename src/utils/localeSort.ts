/**
 * Locale tag for entity name sorting in list-detail sidebars.
 * App locales are `ru` / `en`; anything else falls back to `en`.
 */
export function localeTagFromAppLocale(locale: string): string {
  return locale === 'ru' ? 'ru' : 'en'
}

const NAME_COMPARE_OPTIONS: Intl.CollatorOptions = {
  sensitivity: 'base',
  numeric: true,
}

export function compareLocalizedEntityNames(
  aName: string | null | undefined,
  bName: string | null | undefined,
  locale: string
): number {
  const a = (aName ?? '').trim()
  const b = (bName ?? '').trim()
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b, localeTagFromAppLocale(locale), NAME_COMPARE_OPTIONS)
}
