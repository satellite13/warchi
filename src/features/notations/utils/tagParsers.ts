import { createId, type CustomProperty } from '@/domain/attrs/notationAttrs'

export const parseTagsInput = (
  value: string,
  options?: { unique?: boolean },
): string[] => {
  const tags = value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
  if (!options?.unique) return tags
  const seen = new Set<string>()
  const unique: string[] = []
  for (const tag of tags) {
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(tag)
  }
  return unique
}

export const getTagQuery = (value: string) => {
  const parts = value.split(',')
  const prefix = parts
    .slice(0, -1)
    .map((tag) => tag.trim())
    .filter(Boolean)
  const query = parts[parts.length - 1]?.trim() || ''
  return { prefix, query }
}

export const copyTypeProperties = (source: CustomProperty[]): CustomProperty[] =>
  source.map((p) => ({
    ...p,
    id: createId(),
    enumValues: p.enumValues ? [...p.enumValues] : [],
    _fromType: true,
  }))
