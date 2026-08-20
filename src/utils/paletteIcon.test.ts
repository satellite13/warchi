import { describe, it, expect } from 'vitest'
import { resolvePaletteIconName } from './paletteIcon'

describe('resolvePaletteIconName', () => {
  it('prefers the palette override over the figure icon', () => {
    expect(
      resolvePaletteIconName({
        diagramStyle: { iconName: 'database' },
        paletteMaterialIcon: 'apps',
      }),
    ).toBe('apps')
  })

  it('falls back to the figure icon when no override is set', () => {
    expect(resolvePaletteIconName({ diagramStyle: { iconName: 'database' } })).toBe('database')
  })

  it('uses the fallback when nothing is set', () => {
    expect(resolvePaletteIconName({}, 'component')).toBe('component')
  })
})
