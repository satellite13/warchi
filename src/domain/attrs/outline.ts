import type { OutlineSegment } from '@/domain/attrs/notationAttrs'

/** Parse outline JSON; null when missing, empty, or invalid. */
export function parseOutlineSegments(raw: string | null | undefined): OutlineSegment[] | null {
  if (raw == null || raw.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed as OutlineSegment[]
  } catch {
    return null
  }
}

export function parseOutlineSegmentsOrEmpty(raw: string | null | undefined): OutlineSegment[] {
  return parseOutlineSegments(raw) ?? []
}
