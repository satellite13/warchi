import { describe, expect, it } from 'vitest'
import { isPairAllowedByNotationRules } from './isPairAllowedByNotationRules'

const components = [
  { id: 'c-a', notationId: 'n1', nodeTypeId: 't-a' },
  { id: 'c-b', notationId: 'n1', nodeTypeId: 't-b' },
  { id: 'c-a2', notationId: 'n1', nodeTypeId: 't-a' },
]
const relations = [
  { id: 'r-flow', notationId: 'n1', linkTypeId: 'lt-flow' },
  { id: 'r-other', notationId: 'n1', linkTypeId: 'lt-other' },
]
const rules = [
  { relationId: 'r-flow', fromComponentId: 'c-a', toComponentId: 'c-b' },
]

describe('isPairAllowedByNotationRules', () => {
  it('returns true when any component pair + relation of link type has a rule', () => {
    expect(
      isPairAllowedByNotationRules({
        notationId: 'n1',
        fromNodeTypeId: 't-a',
        toNodeTypeId: 't-b',
        linkTypeId: 'lt-flow',
        components,
        relations,
        relationRules: rules,
      })
    ).toBe(true)
  })

  it('returns false when link type has no matching rule', () => {
    expect(
      isPairAllowedByNotationRules({
        notationId: 'n1',
        fromNodeTypeId: 't-a',
        toNodeTypeId: 't-b',
        linkTypeId: 'lt-other',
        components,
        relations,
        relationRules: rules,
      })
    ).toBe(false)
  })

  it('allows A→A when rule uses same component twice', () => {
    expect(
      isPairAllowedByNotationRules({
        notationId: 'n1',
        fromNodeTypeId: 't-a',
        toNodeTypeId: 't-a',
        linkTypeId: 'lt-flow',
        components,
        relations,
        relationRules: [{ relationId: 'r-flow', fromComponentId: 'c-a', toComponentId: 'c-a' }],
      })
    ).toBe(true)
  })

  it('ignores components/relations of other notations', () => {
    expect(
      isPairAllowedByNotationRules({
        notationId: 'n1',
        fromNodeTypeId: 't-a',
        toNodeTypeId: 't-b',
        linkTypeId: 'lt-flow',
        components: [...components, { id: 'c-x', notationId: 'n2', nodeTypeId: 't-a' }],
        relations,
        relationRules: [{ relationId: 'r-flow', fromComponentId: 'c-x', toComponentId: 'c-b' }],
      })
    ).toBe(false)
  })
})
