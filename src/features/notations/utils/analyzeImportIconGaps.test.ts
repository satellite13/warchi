import { describe, expect, it } from 'vitest'
import { analyzeImportIconGaps, remapIconNamesInValue } from './analyzeImportIconGaps'

describe('analyzeImportIconGaps', () => {
  it('reports names missing from catalog and library', () => {
    const raw = {
      state: {
        components: [{ parsedAttrs: { diagramStyle: { iconName: 'acme-app' } } }],
      },
    }
    expect(analyzeImportIconGaps(raw, [])).toEqual(['acme-app'])
    expect(analyzeImportIconGaps(raw, ['acme-app'])).toEqual([])
    expect(analyzeImportIconGaps({ diagramStyle: { iconName: 'widgets' } }, [])).toEqual([])
  })

  it('remaps icon names and composite sources', () => {
    const remap = new Map([['acme-app', 'widgets']])
    const next = remapIconNamesInValue(
      { diagramStyle: { iconName: 'acme-app' }, source: '/icons/acme-app.svg' },
      remap,
    ) as { diagramStyle: { iconName: string }; source: string }
    expect(next.diagramStyle.iconName).toBe('widgets')
    expect(next.source).toBe('/icons/widgets.svg')
  })
})
