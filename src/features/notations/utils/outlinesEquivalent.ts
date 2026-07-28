import type { OutlineSegment } from '@/domain/attrs/notationAttrs'

function parseOutlineSegments(raw: string | null | undefined): OutlineSegment[] | null {
  if (raw == null || raw.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed as OutlineSegment[]
  } catch {
    return null
  }
}

/** Stable geometry compare: parse JSON outlines and deep-compare segments. */
export function outlinesEquivalent(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = parseOutlineSegments(a)
  const right = parseOutlineSegments(b)
  if (!left || !right) return false
  return JSON.stringify(left) === JSON.stringify(right)
}

export function parseOutlineSegmentsOrEmpty(raw: string | null | undefined): OutlineSegment[] {
  return parseOutlineSegments(raw) ?? []
}
