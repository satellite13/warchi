import { describe, it, expect } from 'vitest'
import { parseNotationAttrs, mergeNotationAttrs } from './notationAttrsJson'

describe('parseNotationAttrs', () => {
  it('returns empty object for null input', () => {
    expect(parseNotationAttrs(null)).toEqual({})
  })

  it('returns empty object for undefined input', () => {
    expect(parseNotationAttrs(undefined)).toEqual({})
  })

  it('returns empty object for empty string', () => {
    expect(parseNotationAttrs('')).toEqual({})
  })

  it('parses valid JSON object', () => {
    expect(parseNotationAttrs('{"key": "value", "num": 42}')).toEqual({ key: 'value', num: 42 })
  })

  it('parses nested JSON object', () => {
    const input = JSON.stringify({ style: { color: 'red', nested: { deep: true } } })
    const result = parseNotationAttrs(input)
    expect(result).toEqual({ style: { color: 'red', nested: { deep: true } } })
  })

  it('returns empty object for JSON array', () => {
    expect(parseNotationAttrs('[1, 2, 3]')).toEqual({})
  })

  it('returns empty object for JSON string primitive', () => {
    expect(parseNotationAttrs('"just a string"')).toEqual({})
  })

  it('returns empty object for JSON number primitive', () => {
    expect(parseNotationAttrs('42')).toEqual({})
  })

  it('returns empty object for JSON boolean primitive', () => {
    expect(parseNotationAttrs('true')).toEqual({})
  })

  it('returns empty object for JSON null', () => {
    expect(parseNotationAttrs('null')).toEqual({})
  })

  it('returns empty object for malformed JSON', () => {
    expect(parseNotationAttrs('{ invalid json')).toEqual({})
  })

  it('returns empty object for random string', () => {
    expect(parseNotationAttrs('not json at all')).toEqual({})
  })

  it('parses empty JSON object', () => {
    expect(parseNotationAttrs('{}')).toEqual({})
  })

  it('returns independent copy for each call', () => {
    const input = '{"a": 1}'
    const a = parseNotationAttrs(input)
    const b = parseNotationAttrs(input)
    a.a = 99
    expect(b.a).toBe(1)
  })
})

describe('mergeNotationAttrs', () => {
  it('merges patch into existing attrs and returns JSON string', () => {
    const base = '{"key": "original", "num": 1}'
    const result = mergeNotationAttrs(base, { key: 'updated', newKey: true })
    expect(result).toBe('{"key":"updated","num":1,"newKey":true}')
  })

  it('creates JSON from patch when base is null', () => {
    const result = mergeNotationAttrs(null, { key: 'value' })
    expect(result).toBe('{"key":"value"}')
  })

  it('creates JSON from patch when base is undefined', () => {
    const result = mergeNotationAttrs(undefined, { key: 'value' })
    expect(result).toBe('{"key":"value"}')
  })

  it('creates JSON from patch when base is empty string', () => {
    const result = mergeNotationAttrs('', { key: 'value' })
    expect(result).toBe('{"key":"value"}')
  })

  it('creates JSON from patch when base is invalid JSON', () => {
    const result = mergeNotationAttrs('not json', { key: 'value' })
    expect(result).toBe('{"key":"value"}')
  })

  it('creates JSON from patch when base is a JSON array', () => {
    const result = mergeNotationAttrs('[1,2]', { key: 'value' })
    expect(result).toBe('{"key":"value"}')
  })

  it('preserves base fields not in patch', () => {
    const base = '{"a": 1, "b": 2, "c": 3}'
    const result = mergeNotationAttrs(base, { b: 20 })
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({ a: 1, b: 20, c: 3 })
  })

  it('overwrites base fields with patch values', () => {
    const base = '{"a": "old", "b": "old"}'
    const result = mergeNotationAttrs(base, { a: 'new', b: 'new' })
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({ a: 'new', b: 'new' })
  })

  it('handles deeply nested patch', () => {
    const base = '{"style": {"color": "red"}}'
    const result = mergeNotationAttrs(base, { style: { color: 'blue', size: 10 } })
    const parsed = JSON.parse(result)
    expect(parsed.style).toEqual({ color: 'blue', size: 10 })
  })

  it('handles empty patch', () => {
    const base = '{"a": 1}'
    const result = mergeNotationAttrs(base, {})
    expect(result).toBe('{"a":1}')
  })

  it('returns valid JSON that round-trips', () => {
    const base = '{"key": "value"}'
    const merged = mergeNotationAttrs(base, { added: true })
    expect(() => JSON.parse(merged)).not.toThrow()
    const parsed = JSON.parse(merged)
    expect(parsed.key).toBe('value')
    expect(parsed.added).toBe(true)
  })

  it('handles patch with null values', () => {
    const base = '{"a": 1}'
    const result = mergeNotationAttrs(base, { b: null })
    const parsed = JSON.parse(result)
    expect(parsed.b).toBe(null)
  })

  it('handles patch with array values', () => {
    const base = '{}'
    const result = mergeNotationAttrs(base, { items: [1, 2, 3] })
    const parsed = JSON.parse(result)
    expect(parsed.items).toEqual([1, 2, 3])
  })
})
