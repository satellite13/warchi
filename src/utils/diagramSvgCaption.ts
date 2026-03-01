/**
 * Appends a diagram metadata caption to an SVG string (bottom-right corner).
 * Used for shared preview and export so the image shows diagram name, version, notation and its version.
 */
export interface DiagramCaptionMeta {
  diagramName: string
  diagramVersion: string
  notationName: string
  notationVersion: string
}

function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Injects a caption group before the closing </svg>.
 * Expects SVG with viewBox or width/height on the root element.
 */
export function appendDiagramCaption(svg: string, meta: DiagramCaptionMeta): string {
  const viewBoxMatch = svg.match(/viewBox="0\s+0\s+([\d.]+)\s+([\d.]+)"/)
  const widthMatch = svg.match(/\bwidth="([\d.]+)"/)
  const heightMatch = svg.match(/\bheight="([\d.]+)"/)
  const w = viewBoxMatch ? Number.parseFloat(viewBoxMatch[1] ?? '0') : Number.parseFloat(widthMatch?.[1] ?? '0')
  const h = viewBoxMatch ? Number.parseFloat(viewBoxMatch[2] ?? '0') : Number.parseFloat(heightMatch?.[1] ?? '0')
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return svg
  }

  const padding = 16
  const fontSize = 11
  const x = w - padding
  const y = h - padding
  const line = [
    escapeSvgText(meta.diagramName),
    meta.diagramVersion ? `v${escapeSvgText(meta.diagramVersion)}` : '',
    meta.notationName || meta.notationVersion
      ? ` · ${escapeSvgText(meta.notationName)}${meta.notationVersion ? ` v${escapeSvgText(meta.notationVersion)}` : ''}`
      : '',
  ]
    .filter(Boolean)
    .join(' ')
  if (!line.trim()) {
    return svg
  }

  const caption = `<g id="diagram-caption"><text x="${x}" y="${y}" text-anchor="end" font-size="${fontSize}" font-family="sans-serif" fill="#666666">${line}</text></g>`
  return svg.replace('</svg>', `${caption}</svg>`)
}
