export type IconPlacement =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export const ICON_PLACEMENT_OPTIONS: readonly IconPlacement[] = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]

export type InsetSides = { top: number; right: number; bottom: number; left: number }
export type InsetInput = number | { top?: number; right?: number; bottom?: number; left?: number }

export type TextLabelWithSpacing = {
  inset?: InsetInput
}

export function normalizeIconPlacement(
  value: unknown,
  fallback: IconPlacement = 'top-left',
): IconPlacement {
  if (typeof value !== 'string') return fallback
  return (ICON_PLACEMENT_OPTIONS as readonly string[]).includes(value)
    ? (value as IconPlacement)
    : fallback
}

export function toInsetSides(value: unknown, fallback = 0): InsetSides {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { top: value, right: value, bottom: value, left: value }
  }
  if (value && typeof value === 'object') {
    const raw = value as { top?: unknown; right?: unknown; bottom?: unknown; left?: unknown }
    const top = typeof raw.top === 'number' && Number.isFinite(raw.top) ? raw.top : fallback
    const right =
      typeof raw.right === 'number' && Number.isFinite(raw.right) ? raw.right : fallback
    const bottom =
      typeof raw.bottom === 'number' && Number.isFinite(raw.bottom) ? raw.bottom : fallback
    const left = typeof raw.left === 'number' && Number.isFinite(raw.left) ? raw.left : fallback
    return { top, right, bottom, left }
  }
  return { top: fallback, right: fallback, bottom: fallback, left: fallback }
}

export function toInsetNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object') {
    const raw = value as { top?: unknown; right?: unknown; bottom?: unknown; left?: unknown }
    if (typeof raw.top === 'number' && Number.isFinite(raw.top)) return raw.top
    if (typeof raw.right === 'number' && Number.isFinite(raw.right)) return raw.right
    if (typeof raw.bottom === 'number' && Number.isFinite(raw.bottom)) return raw.bottom
    if (typeof raw.left === 'number' && Number.isFinite(raw.left)) return raw.left
  }
  return fallback
}

export function insetToPlain(value: InsetSides): InsetInput {
  return { top: value.top, right: value.right, bottom: value.bottom, left: value.left }
}

export function getLabelSpacing(label: unknown): TextLabelWithSpacing {
  return label && typeof label === 'object' ? (label as TextLabelWithSpacing) : {}
}

export function setLabelSpacing(label: unknown, spacing: { inset?: InsetInput }) {
  if (!label || typeof label !== 'object') return
  const target = label as TextLabelWithSpacing
  if (spacing.inset != null) target.inset = spacing.inset
}
