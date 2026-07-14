import type { CustomProperty } from '@/domain/attrs/notationAttrs'

export function coercePropertyValue(
  property: CustomProperty,
  raw: string,
  checked?: boolean,
): unknown {
  if (property.type === 'boolean') return Boolean(checked)
  if (property.type === 'number') {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return raw
}

export function regexTestProperty(property: CustomProperty, value: string): boolean | null {
  if (property.type !== 'string' || !property.regex?.trim()) return null
  const val = (value ?? '').trim()
  if (val === '') return null
  try {
    return new RegExp(property.regex).test(val)
  } catch {
    return null
  }
}
