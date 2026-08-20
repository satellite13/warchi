import { describe, expect, it } from 'vitest'
import {
  catalogIconUrl,
  iconNameFromSource,
  matchIconOptionId,
  normalizeIconName,
  resolveIconMarkup,
  resolveIconSrc,
  resolveStoredIconName,
  svgToDataUrl,
} from './libraryIconResolve'

describe('libraryIconResolve', () => {
  it('normalizes path and extension', () => {
    expect(normalizeIconName('/icons/Acme.svg')).toBe('acme')
    expect(catalogIconUrl('server')).toBe('/icons/server.svg')
  })

  it('prefers library svg', () => {
    const map = new Map([['acme-app', '<svg></svg>']])
    expect(resolveIconSrc('acme-app', map)).toBe(svgToDataUrl('<svg></svg>'))
    expect(resolveIconMarkup('acme-app', map)).toBe('<svg></svg>')
    expect(resolveIconMarkup('server', map)).toBe('/icons/server.svg')
  })

  it('does not treat inline SVG as an icon name', () => {
    expect(iconNameFromSource('<svg viewBox="0 0 8 8"></svg>')).toBe('')
    expect(iconNameFromSource(svgToDataUrl('<svg></svg>'))).toBe('')
    expect(iconNameFromSource('/icons/Acme.svg')).toBe('acme')
  })

  it('keeps diagramStyle.iconName when the canvas stores library SVG markup', () => {
    expect(resolveStoredIconName('<svg></svg>', 'Acme_App')).toBe('Acme_App')
    expect(resolveStoredIconName('/icons/server.svg', 'ignored')).toBe('server')
    expect(resolveStoredIconName(undefined, 'Acme_App')).toBe('')
  })

  it('matches icon option ids case-insensitively', () => {
    const options = [{ id: 'Acme_App' }, { id: 'server' }]
    expect(matchIconOptionId('acme_app', options)).toBe('Acme_App')
    expect(matchIconOptionId('server', options)).toBe('server')
  })
})
