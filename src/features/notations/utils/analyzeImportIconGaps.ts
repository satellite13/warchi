import { COMBINED_ICON_OPTIONS } from '@/config/iconOptions'
import { collectIconNames } from '@/utils/collectIconNames'
import { normalizeIconName } from '@/utils/libraryIconResolve'

const CATALOG_IDS = new Set(COMBINED_ICON_OPTIONS.map((option) => option.id))

export function analyzeImportIconGaps(
  raw: unknown,
  libraryNames: Iterable<string>,
): string[] {
  const library = new Set(
    [...libraryNames].map((name) => normalizeIconName(name)).filter(Boolean),
  )
  const names = collectIconNames(raw)
  return names.filter((name) => !CATALOG_IDS.has(name) && !library.has(name))
}

export function remapIconNamesInValue(
  value: unknown,
  remap: ReadonlyMap<string, string>,
): unknown {
  if (remap.size === 0) return value
  return rewrite(value, remap)
}

function rewrite(value: unknown, remap: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') {
    const name = normalizeIconName(value)
    const next = name ? remap.get(name) : undefined
    if (!next) return value
    if (/(?:^|\/)icons\/[^/]+?\.svg$/i.test(value.trim())) {
      return `/icons/${next}.svg`
    }
    return next
  }
  if (Array.isArray(value)) return value.map((item) => rewrite(item, remap))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = rewrite(child, remap)
    }
    return out
  }
  return value
}
