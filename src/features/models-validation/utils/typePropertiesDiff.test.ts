import { describe, expect, it } from 'vitest'
import { buildTypePropertyDiff, collectTypeProperties } from './typePropertiesDiff'

describe('buildTypePropertyDiff', () => {
  it('builds rows and default picks keep when values differ', () => {
    const rows = buildTypePropertyDiff({ a: 1, shared: 'x' }, { b: 2, shared: 'x' })
    expect(rows.filter(r => r.same).map(r => r.key)).toEqual(['shared'])
    expect(rows.find(r => r.key === 'a')?.choice).toBe('keep')
  })

  it('skips documentFileId and treats missing keys as different', () => {
    const rows = buildTypePropertyDiff(
      { owner: 'keep', shared: 'x', documentFileId: 'keep-doc' },
      { owner: 'drop', extra: 2, shared: 'x', documentFileId: 'drop-doc' }
    )

    expect(rows.map(r => r.key)).toEqual(['extra', 'owner', 'shared'])
    expect(rows.find(r => r.key === 'shared')).toMatchObject({
      same: true,
      choice: 'keep',
      keepValue: 'x',
      dropValue: 'x',
    })
    expect(rows.find(r => r.key === 'owner')).toMatchObject({
      same: false,
      choice: 'keep',
      keepValue: 'keep',
      dropValue: 'drop',
    })
    expect(rows.find(r => r.key === 'extra')).toMatchObject({
      same: false,
      choice: 'keep',
      keepValue: undefined,
      dropValue: 2,
    })
  })

  it('compares nested values by JSON equality', () => {
    const rows = buildTypePropertyDiff({ nested: { n: 1 } }, { nested: { n: 1 } })
    expect(rows).toEqual([
      {
        key: 'nested',
        keepValue: { n: 1 },
        dropValue: { n: 1 },
        same: true,
        choice: 'keep',
      },
    ])
  })
})

describe('collectTypeProperties', () => {
  it('uses keep for same rows and the chosen side otherwise', () => {
    const rows = buildTypePropertyDiff(
      { owner: 'keep', shared: 'x', documentFileId: 'keep-doc' },
      { owner: 'drop', extra: 2, shared: 'x', documentFileId: 'drop-doc' }
    )
    const owner = rows.find(r => r.key === 'owner')
    const extra = rows.find(r => r.key === 'extra')
    if (owner) owner.choice = 'drop'
    if (extra) extra.choice = 'drop'

    expect(collectTypeProperties(rows)).toEqual({ owner: 'drop', extra: 2, shared: 'x' })
  })

  it('does not include documentFileId even if a row sneaks in', () => {
    expect(
      collectTypeProperties([
        {
          key: 'documentFileId',
          keepValue: 'keep-doc',
          dropValue: 'drop-doc',
          same: false,
          choice: 'drop',
        },
        {
          key: 'owner',
          keepValue: 'keep',
          dropValue: 'drop',
          same: false,
          choice: 'keep',
        },
      ])
    ).toEqual({ owner: 'keep' })
  })
})
