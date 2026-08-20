export type LibraryIconRecord = {
  id: string
  name: string
  svg: string
}

export function normalizeIconName(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const fromPath = trimmed.match(/(?:^|\/)icons\/([^/]+?)\.svg$/i)
  const name = (fromPath?.[1] ?? trimmed).replace(/\.svg$/i, '')
  return name.trim().toLowerCase()
}

export function catalogIconUrl(name: string): string {
  const id = normalizeIconName(name)
  if (!id) return ''
  return `/icons/${id}.svg`
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function librarySvg(
  id: string,
  libraryByName?: ReadonlyMap<string, string> | Record<string, string> | null,
): string | undefined {
  if (!libraryByName) return undefined
  if ('get' in libraryByName && typeof libraryByName.get === 'function') {
    return libraryByName.get(id)
  }
  return (libraryByName as Record<string, string>)[id]
}

export function resolveIconSrc(
  name: string,
  libraryByName?: ReadonlyMap<string, string> | Record<string, string> | null,
): string {
  const id = normalizeIconName(name)
  if (!id) return ''
  const svg = librarySvg(id, libraryByName)
  if (svg) return svgToDataUrl(svg)
  return catalogIconUrl(id)
}

export function resolveIconMarkup(
  name: string,
  libraryByName?: ReadonlyMap<string, string> | Record<string, string> | null,
): string {
  const id = normalizeIconName(name)
  if (!id) return ''
  const svg = librarySvg(id, libraryByName)
  if (svg) return svg
  return catalogIconUrl(id)
}

/** Icon name from a catalog path or bare id. Empty for inline SVG / data URLs. */
export function iconNameFromSource(source: string): string {
  const trimmed = source.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('<') || /^data:/i.test(trimmed)) return ''
  return normalizeIconName(trimmed)
}

/**
 * Name to show in the icon select: path/id from the node source, or the
 * persisted diagramStyle.iconName when the canvas stores resolved SVG markup.
 */
export function resolveStoredIconName(
  source: string | undefined,
  styleIconName?: string,
): string {
  if (!source?.trim()) return ''
  return iconNameFromSource(source) || styleIconName?.trim() || ''
}

export function matchIconOptionId(
  value: string,
  options: ReadonlyArray<{ id: string }>,
): string {
  if (!value) return ''
  if (options.some((option) => option.id === value)) return value
  const norm = normalizeIconName(value)
  return options.find((option) => normalizeIconName(option.id) === norm)?.id ?? value
}

export function libraryNameMap(
  icons: ReadonlyArray<{ name: string; svg: string }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const icon of icons) {
    const name = normalizeIconName(icon.name)
    if (name) map.set(name, icon.svg)
  }
  return map
}
