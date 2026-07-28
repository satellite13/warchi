import { createId } from '@/utils/createId'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'

export function createEmptyCustomProperty(
  overrides: Partial<CustomProperty> = {},
): CustomProperty {
  return {
    id: createId(),
    name: '',
    type: 'string',
    required: false,
    system: false,
    regex: '',
    min: null,
    max: null,
    enumValues: [],
    defaultValue: undefined,
    ...overrides,
  }
}
