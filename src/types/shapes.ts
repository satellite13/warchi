// Custom node shape outline (normalized coordinates 0–1)
export type OutlineSegmentLine = {
  type: "line"
  points: [[number, number], [number, number]]
}
export type OutlineSegmentBezier = {
  type: "bezier"
  points: [[number, number], [number, number], [number, number], [number, number]]
}
export type OutlineSegment = OutlineSegmentLine | OutlineSegmentBezier

/** 9-slice insets in pixels relative to refWidth × refHeight template size. */
export type ScaleSlice = {
  left: number
  right: number
  top: number
  bottom: number
  refWidth: number
  refHeight: number
}

export const DEFAULT_SCALE_SLICE_REF_WIDTH = 180
export const DEFAULT_SCALE_SLICE_REF_HEIGHT = 120

export function createDefaultScaleSlice(
  partial?: Partial<ScaleSlice>
): ScaleSlice {
  return {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    refWidth: DEFAULT_SCALE_SLICE_REF_WIDTH,
    refHeight: DEFAULT_SCALE_SLICE_REF_HEIGHT,
    ...partial,
  }
}

export function hasEffectiveScaleSlice(slice: ScaleSlice | null | undefined): boolean {
  if (!slice) return false
  return slice.left > 0 || slice.right > 0 || slice.top > 0 || slice.bottom > 0
}

export function normalizeScaleSlice(value: unknown): ScaleSlice | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback
  const slice: ScaleSlice = {
    left: num(raw.left, 0),
    right: num(raw.right, 0),
    top: num(raw.top, 0),
    bottom: num(raw.bottom, 0),
    refWidth: Math.max(1, num(raw.refWidth, DEFAULT_SCALE_SLICE_REF_WIDTH)),
    refHeight: Math.max(1, num(raw.refHeight, DEFAULT_SCALE_SLICE_REF_HEIGHT)),
  }
  return hasEffectiveScaleSlice(slice) ? slice : undefined
}

export function parseScaleSliceFromAttrs(attrs: string | null | undefined): ScaleSlice | undefined {
  if (!attrs) return undefined
  try {
    const parsed = JSON.parse(attrs) as Record<string, unknown>
    return normalizeScaleSlice(parsed.scaleSlice)
  } catch {
    return undefined
  }
}

/** Merge scaleSlice into attrs JSON, preserving other keys (e.g. documentFileId). */
export function mergeScaleSliceIntoAttrs(
  attrs: string | null | undefined,
  slice: ScaleSlice | null | undefined
): string {
  let parsed: Record<string, unknown> = {}
  if (attrs) {
    try {
      const raw = JSON.parse(attrs) as unknown
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        parsed = { ...(raw as Record<string, unknown>) }
      }
    } catch {
      parsed = {}
    }
  }
  if (slice && hasEffectiveScaleSlice(slice)) {
    parsed.scaleSlice = {
      left: slice.left,
      right: slice.right,
      top: slice.top,
      bottom: slice.bottom,
      refWidth: slice.refWidth,
      refHeight: slice.refHeight,
    }
  } else {
    delete parsed.scaleSlice
  }
  return JSON.stringify(parsed)
}
