import { describe, expect, it } from 'vitest'
import { collectIconNames } from './collectIconNames'

describe('collectIconNames', () => {
  it('walks attrs and composite source', () => {
    expect(
      collectIconNames({
        icon: 'folder',
        diagramStyle: {
          iconName: 'acme-app',
          compositeContent: { type: 'icon', source: '/icons/bound.svg' },
        },
      }),
    ).toEqual(expect.arrayContaining(['folder', 'acme-app', 'bound']))
  })
})
