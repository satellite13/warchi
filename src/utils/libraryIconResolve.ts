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
