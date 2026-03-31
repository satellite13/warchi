import { createId } from '../notationAttrs'
import type { TypeParsedAttrs } from '../types'

interface BaseEditorType {
  id: string
  name: string
  ownerId: string
  parsedAttrs: TypeParsedAttrs
  _isNew?: boolean
}

export function addType<T extends BaseEditorType>(
  list: T[],
  name: string,
  ownerId: string,
  extraDefaults?: Partial<Omit<T, 'id' | 'name' | 'ownerId' | 'parsedAttrs' | '_isNew'>>,
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const existing = list.find((item) => item.name.toLowerCase() === trimmed.toLowerCase())
  if (existing) return existing.id
  const newType = {
    id: createId(),
    name: trimmed,
    ownerId,
    parsedAttrs: {},
    _isNew: true,
    ...extraDefaults,
  } as T
  list.push(newType)
  return newType.id
}
