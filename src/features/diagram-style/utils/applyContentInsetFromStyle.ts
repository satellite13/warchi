import type { DiagramStyle, InsetScaleSides } from '@/domain/attrs/notationAttrs'

type ContentInsetRuntime = {
  contentInset?: unknown
  contentInsetScale?: InsetScaleSides
  contentInsetBaseSize?: { width: number; height: number }
}

function resolveBaseSize(
  baseStyle: DiagramStyle | null | undefined
): { width: number; height: number } | undefined {
  const width = baseStyle?.width
  const height = baseStyle?.height
  if (
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === 'number' &&
    Number.isFinite(height) &&
    height > 0
  ) {
    return { width, height }
  }
  return undefined
}

/**
 * Apply diagramStyle contentInset (+ optional proportional scale/base) to a papirus node.
 *
 * @param baseStyle - size reference for proportional sides (notation component defaults).
 *   When omitted, uses `ds.width` / `ds.height`.
 */
export function applyContentInsetFromStyle(
  node: ContentInsetRuntime,
  ds: DiagramStyle | null | undefined,
  baseStyle?: DiagramStyle | null
): void {
  node.contentInset = (ds?.contentInset ?? 0) as ContentInsetRuntime['contentInset']
  const scale = ds?.contentInsetScale
  node.contentInsetScale =
    scale && (scale.top || scale.right || scale.bottom || scale.left) ? { ...scale } : undefined
  node.contentInsetBaseSize = resolveBaseSize(baseStyle ?? ds)
}
