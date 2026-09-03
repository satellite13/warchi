import { parseOutlineSegments, parseOutlineSegmentsOrEmpty } from '@/domain/attrs/outline'

export { parseOutlineSegmentsOrEmpty }

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
