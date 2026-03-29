type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function parseNotationAttrs(raw: string | null | undefined): JsonRecord {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function mergeNotationAttrs(
  raw: string | null | undefined,
  patch: JsonRecord
): string {
  const base = parseNotationAttrs(raw)
  return JSON.stringify({
    ...base,
    ...patch,
  })
}

