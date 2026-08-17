import { describe, expect, it } from 'vitest'
import {
  catalogIconUrl,
  normalizeIconName,
  resolveIconMarkup,
  resolveIconSrc,
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
})
