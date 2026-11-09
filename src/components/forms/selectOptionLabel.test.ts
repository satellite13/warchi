import { describe, expect, it } from 'vitest'
import { selectMenuContentWidth, splitSelectLabelTail } from './selectOptionLabel'

describe('splitSelectLabelTail', () => {
  it('keeps the version separate so two diagrams with the same name stay distinct', () => {
    expect(splitSelectLabelTail('Компонентная диаграмма 1.0.0')).toEqual({
      head: 'Компонентная диаграмма',
      tail: '1.0.0',
    })
    expect(splitSelectLabelTail('Компонентная диаграмма 1.1.0').tail).toBe('1.1.0')
  })

  it('keeps a parenthesized version at the end', () => {
    expect(splitSelectLabelTail('Архитектурный репозиторий (1.2.0)')).toEqual({
      head: 'Архитектурный репозиторий',
      tail: '(1.2.0)',
    })
  })

  it('does not split a label that has no version', () => {
    expect(splitSelectLabelTail('Просто имя')).toEqual({ head: 'Просто имя', tail: '' })
  })
})

describe('selectMenuContentWidth', () => {
  it('sizes the menu from the longest label', () => {
    const width = selectMenuContentWidth(
      ['Компонентная диаграмма 1.0.0', 'Use Case 1.0.0'],
      label => label.length * 8,
      30
    )
    expect(width).toBe('Компонентная диаграмма 1.0.0'.length * 8 + 30)
  })
})
