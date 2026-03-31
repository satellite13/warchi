import { createId, type CustomProperty } from '../notationAttrs'

export const parseTagsInput = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

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
