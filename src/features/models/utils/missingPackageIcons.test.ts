import { describe, expect, it } from 'vitest'
import { missingIconsFromImportedEntities } from './missingPackageIcons'

describe('missingIconsFromImportedEntities', () => {
  it('finds custom names in JSON attrs and ignores catalog icons', () => {
    expect(
      missingIconsFromImportedEntities(
        [
          { attrs: JSON.stringify({ diagramStyle: { iconName: 'acme-app' } }) },
          { attrs: JSON.stringify({ diagramStyle: { iconName: 'widgets' } }) },
        ],
        [],
      ),
    ).toEqual(['acme-app'])
  })

  it('treats library names as present', () => {
    expect(
      missingIconsFromImportedEntities(
        [{ attrs: JSON.stringify({ iconName: 'acme-app' }) }],
        ['acme-app'],
      ),
    ).toEqual([])
  })
})
