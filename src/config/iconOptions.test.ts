import { describe, expect, it } from 'vitest'
import { MATERIAL_SYMBOLS_OUTLINED_NAMES } from './materialSymbolsOutlinedNames.generated'
import { sanitizeIconOptions, type IconOption } from './iconOptions'

describe('sanitizeIconOptions', () => {
  it('removes empty ids and trims surrounding spaces', () => {
    const input: IconOption[] = [
      { id: '  event  ', label: 'event' },
      { id: '', label: 'empty' },
      { id: '   ', label: 'spaces' },
    ]

    const result = sanitizeIconOptions(input)

    expect(result).toEqual([{ id: 'event', label: 'event' }])
  })

  it('keeps first option for duplicate id (archimate priority by order)', () => {
    const input: IconOption[] = [
      { id: 'event', label: 'archimate event' },
      { id: 'circle', label: 'archimate circle' },
      { id: 'event', label: 'material event' },
    ]

    const result = sanitizeIconOptions(input)

    expect(result).toEqual([
      { id: 'event', label: 'archimate event' },
      { id: 'circle', label: 'archimate circle' },
    ])
  })
})

describe('MATERIAL_SYMBOLS_OUTLINED_NAMES', () => {
  it('includes icons from Material Symbols that were missing in Material Icons', () => {
    expect(MATERIAL_SYMBOLS_OUTLINED_NAMES).toContain('database')
  })
})
