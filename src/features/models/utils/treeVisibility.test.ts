import { describe, expect, it } from 'vitest'

import { hiddenNodeTypeIds, isNodeHiddenInTree } from './treeVisibility'

describe('treeVisibility', () => {
  const nodeTypes = [
    { id: 'nt-junction', attrs: JSON.stringify({ hideInTree: true }) },
    { id: 'nt-service', attrs: JSON.stringify({ icon: 'service' }) },
    { id: 'nt-broken', attrs: 'not-json' },
  ]

  it('collects node type ids with hideInTree attr', () => {
    expect(hiddenNodeTypeIds(nodeTypes)).toEqual(new Set(['nt-junction']))
  })

  it('hides nodes with explicit system.hideInTree marker', () => {
    const node = { nodeTypeId: 'nt-service', parsedAttrs: { system: { hideInTree: true } } }
    expect(isNodeHiddenInTree(node, new Set())).toBe(true)
  })

  it('hides nodes of hidden types unless explicitly overridden', () => {
    const hiddenTypes = new Set(['nt-junction'])
    expect(isNodeHiddenInTree({ nodeTypeId: 'nt-junction', parsedAttrs: {} }, hiddenTypes)).toBe(
      true
    )
    expect(
      isNodeHiddenInTree(
        { nodeTypeId: 'nt-junction', parsedAttrs: { system: { hideInTree: false } } },
        hiddenTypes
      )
    ).toBe(false)
  })

  it('shows nodes of visible types without marker', () => {
    expect(
      isNodeHiddenInTree({ nodeTypeId: 'nt-service', parsedAttrs: {} }, new Set(['nt-junction']))
    ).toBe(false)
  })
})
