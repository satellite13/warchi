import { normalizeIconName } from '@/utils/libraryIconResolve'

const NAME_KEYS = new Set(['iconName', 'paletteMaterialIcon', 'icon', 'interactiveIcon'])

export function collectIconNames(...values: unknown[]): string[] {
  const names = new Set<string>()
  for (const value of values) walk(value, names)
  return [...names]
}

function walk(value: unknown, names: Set<string>): void {
  if (value == null) return
  if (typeof value === 'string') {
    addFromSource(value, names)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, names)
    return
  }
  if (typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (NAME_KEYS.has(key) && typeof child === 'string') {
      addName(child, names)
    } else if (key === 'source' && typeof child === 'string') {
      addFromSource(child, names)
    } else {
      walk(child, names)
    }
  }
}

function addFromSource(raw: string, names: Set<string>): void {
  const match = raw.trim().match(/(?:^|\/)icons\/([^/]+?)\.svg$/i)
  if (match?.[1]) addName(match[1], names)
}

function addName(raw: string, names: Set<string>): void {
  const name = normalizeIconName(raw)
  if (name) names.add(name)
}
