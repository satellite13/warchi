import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateId = vi.fn(() => `mock-id-${Math.random().toString(36).slice(2)}`)

vi.mock('@/domain/attrs/notationAttrs', () => ({
  createId: () => mockCreateId(),
  CustomProperty: undefined,
}))

import { parseTagsInput, getTagQuery, copyTypeProperties } from './tagParsers'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'

describe('parseTagsInput', () => {
  it('splits comma-separated tags', () => {
    expect(parseTagsInput('tag1,tag2,tag3')).toEqual(['tag1', 'tag2', 'tag3'])
  })

  it('trims whitespace from each tag', () => {
    expect(parseTagsInput('  tag1  , tag2 ,tag3  ')).toEqual(['tag1', 'tag2', 'tag3'])
  })

  it('filters out empty tags', () => {
    expect(parseTagsInput('tag1,,tag2,,,tag3')).toEqual(['tag1', 'tag2', 'tag3'])
  })

  it('returns empty array for empty string', () => {
    expect(parseTagsInput('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(parseTagsInput('   ')).toEqual([])
  })

  it('returns empty array for commas only', () => {
    expect(parseTagsInput(',,,')).toEqual([])
  })

  it('handles single tag', () => {
    expect(parseTagsInput('single')).toEqual(['single'])
  })

  it('handles single tag with whitespace', () => {
    expect(parseTagsInput('  single  ')).toEqual(['single'])
  })

  it('handles tag with spaces inside', () => {
    expect(parseTagsInput('hello world,foo')).toEqual(['hello world', 'foo'])
  })
})

describe('getTagQuery', () => {
  it('splits prefix and query for comma-separated input', () => {
    const result = getTagQuery('tag1,tag2,current')
    expect(result.prefix).toEqual(['tag1', 'tag2'])
    expect(result.query).toBe('current')
  })

  it('handles single value as query with empty prefix', () => {
    const result = getTagQuery('onlyone')
    expect(result.prefix).toEqual([])
    expect(result.query).toBe('onlyone')
  })

  it('returns empty query for empty string', () => {
    const result = getTagQuery('')
    expect(result.prefix).toEqual([])
    expect(result.query).toBe('')
  })

  it('trims whitespace from prefix and query', () => {
    const result = getTagQuery('  a  ,  b  ,  c  ')
    expect(result.prefix).toEqual(['a', 'b'])
    expect(result.query).toBe('c')
  })

  it('filters empty prefix entries', () => {
    const result = getTagQuery(',tag1,,tag2,query')
    expect(result.prefix).toEqual(['tag1', 'tag2'])
    expect(result.query).toBe('query')
  })

  it('handles trailing comma', () => {
    const result = getTagQuery('tag1,tag2,')
    expect(result.prefix).toEqual(['tag1', 'tag2'])
    expect(result.query).toBe('')
  })

  it('handles leading comma', () => {
    const result = getTagQuery(',query')
    expect(result.prefix).toEqual([])
    expect(result.query).toBe('query')
  })

  it('handles whitespace-only query part', () => {
    const result = getTagQuery('tag1,   ')
    expect(result.prefix).toEqual(['tag1'])
    expect(result.query).toBe('')
  })

  it('handles multiple commas', () => {
    const result = getTagQuery('a,b,c,d,e')
    expect(result.prefix).toEqual(['a', 'b', 'c', 'd'])
    expect(result.query).toBe('e')
  })

  it('handles only whitespace', () => {
    const result = getTagQuery('   ')
    expect(result.prefix).toEqual([])
    expect(result.query).toBe('')
  })
})

describe('copyTypeProperties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeProp(overrides: Partial<CustomProperty> = {}): CustomProperty {
    return {
      id: 'orig-id',
      name: 'TestProp',
      type: 'string',
      required: false,
      min: null,
      max: null,
      ...overrides,
    }
  }

  it('creates deep copy with new IDs', () => {
    const source = [makeProp({ name: 'Prop1' }), makeProp({ name: 'Prop2' })]
    const result = copyTypeProperties(source)

    expect(result).toHaveLength(2)
    expect(result[0].id).not.toBe('orig-id')
    expect(result[1].id).not.toBe('orig-id')
    expect(result[0].id).not.toBe(result[1].id)
    expect(result[0].name).toBe('Prop1')
    expect(result[1].name).toBe('Prop2')
  })

  it('calls createId for each property', () => {
    const source = [makeProp(), makeProp(), makeProp()]
    mockCreateId.mockReturnValueOnce('id-1')
    mockCreateId.mockReturnValueOnce('id-2')
    mockCreateId.mockReturnValueOnce('id-3')

    const result = copyTypeProperties(source)

    expect(mockCreateId).toHaveBeenCalledTimes(3)
    expect(result[0].id).toBe('id-1')
    expect(result[1].id).toBe('id-2')
    expect(result[2].id).toBe('id-3')
  })

  it('sets _fromType flag to true', () => {
    const source = [makeProp()]
    const result = copyTypeProperties(source)
    expect(result[0]._fromType).toBe(true)
  })

  it('deep copies enumValues array', () => {
    const source = [makeProp({ enumValues: ['a', 'b', 'c'] })]
    const result = copyTypeProperties(source)

    expect(result[0].enumValues).toEqual(['a', 'b', 'c'])
    result[0].enumValues!.push('d')
    expect(source[0].enumValues).toEqual(['a', 'b', 'c'])
  })

  it('sets empty array for undefined enumValues', () => {
    const source = [makeProp({ name: 'NoEnum' })]
    const result = copyTypeProperties(source)
    expect(result[0].enumValues).toEqual([])
  })

  it('deep copies empty enumValues array', () => {
    const source = [makeProp({ enumValues: [] })]
    const result = copyTypeProperties(source)
    expect(result[0].enumValues).toEqual([])
    result[0].enumValues!.push('x')
    expect(source[0].enumValues).toEqual([])
  })

  it('preserves all original property fields', () => {
    const source = [
      makeProp({
        name: 'Complex',
        type: 'number',
        required: true,
        system: true,
        regex: '^[0-9]+$',
        min: 0,
        max: 100,
        maxLength: 50,
        defaultValue: 42,
      }),
    ]
    const result = copyTypeProperties(source)

    const copied = result[0]
    expect(copied.name).toBe('Complex')
    expect(copied.type).toBe('number')
    expect(copied.required).toBe(true)
    expect(copied.system).toBe(true)
    expect(copied.regex).toBe('^[0-9]+$')
    expect(copied.min).toBe(0)
    expect(copied.max).toBe(100)
    expect(copied.maxLength).toBe(50)
    expect(copied.defaultValue).toBe(42)
  })

  it('returns empty array for empty source', () => {
    expect(copyTypeProperties([])).toEqual([])
  })

  it('does not mutate source objects', () => {
    const source = [makeProp({ name: 'Immutable' })]
    copyTypeProperties(source)
    expect(source[0].id).toBe('orig-id')
    expect(source[0]._fromType).toBeUndefined()
  })

  it('handles properties with interactive fields', () => {
    const source = [
      makeProp({
        name: 'Interactive',
        interactive: true,
        interactiveKind: 'url',
        interactiveIcon: 'open-in-new',
      }),
    ]
    const result = copyTypeProperties(source)
    expect(result[0].interactive).toBe(true)
    expect(result[0].interactiveKind).toBe('url')
    expect(result[0].interactiveIcon).toBe('open-in-new')
  })
})
