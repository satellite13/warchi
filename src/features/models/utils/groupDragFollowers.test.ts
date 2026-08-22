import { describe, expect, it } from 'vitest'

import { collectNestedGroupFollowers } from './groupDragFollowers'

describe('collectNestedGroupFollowers', () => {
  const bounds = {
    outer: { x: 0, y: 0, width: 400, height: 300 },
    inner: { x: 20, y: 20, width: 240, height: 200 },
    a: { x: 40, y: 50, width: 60, height: 40 },
    b: { x: 160, y: 50, width: 60, height: 40 },
    outside: { x: 500, y: 40, width: 50, height: 40 },
  }

  it('includes the inner group and components nested inside it when dragging the outer group', () => {
    const followers = collectNestedGroupFollowers({
      leaderId: 'outer',
      ids: Object.keys(bounds),
      boundsOf: id => bounds[id as keyof typeof bounds] ?? null,
      isGroupingEnabled: id => id === 'outer' || id === 'inner',
    })

    expect(followers.sort()).toEqual(['a', 'b', 'inner'])
  })

  it('walks an overflowing inner group so nested components stay followers', () => {
    const overflow = {
      ...bounds,
      inner: { x: 10, y: 10, width: 420, height: 220 },
      b: { x: 395, y: 40, width: 30, height: 30 },
    }

    const followers = collectNestedGroupFollowers({
      leaderId: 'outer',
      ids: Object.keys(overflow),
      boundsOf: id => overflow[id as keyof typeof overflow] ?? null,
      isGroupingEnabled: id => id === 'outer' || id === 'inner',
    })

    expect(followers).toContain('inner')
    expect(followers).toContain('a')
    expect(followers).toContain('b')
  })
})
