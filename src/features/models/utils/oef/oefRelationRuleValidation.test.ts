import { describe, expect, it } from 'vitest'

import type { ImportMappingState } from './mappingState'
import type { ImportDraft } from './types'
import {
  buildDisallowedOefLinkGroupKey,
  collectDisallowedOefLinkGroups,
  isOefLinkAllowedByRelationRules,
} from './oefRelationRuleValidation'

describe('isOefLinkAllowedByRelationRules', () => {
  it('returns true when a matching rule exists', () => {
    expect(
      isOefLinkAllowedByRelationRules({
        fromComponentId: 'c-from',
        toComponentId: 'c-to',
        relationId: 'rel-1',
        relationRules: [
          { relationId: 'rel-1', fromComponentId: 'c-from', toComponentId: 'c-to' },
        ],
      })
    ).toBe(true)
  })

  it('returns false when no matching rule exists', () => {
    expect(
      isOefLinkAllowedByRelationRules({
        fromComponentId: 'c-from',
        toComponentId: 'c-to',
        relationId: 'rel-1',
        relationRules: [
          { relationId: 'rel-1', fromComponentId: 'other', toComponentId: 'c-to' },
        ],
      })
    ).toBe(false)
  })
})

describe('collectDisallowedOefLinkGroups', () => {
  const draft: ImportDraft = {
    sourceModelId: 'm1',
    sourceModelName: 'M',
    nodes: [
      { sourceElementId: 'e1', sourceType: 'BusinessService', name: 'A' },
      { sourceElementId: 'e2', sourceType: 'BusinessProcess', name: 'B' },
      { sourceElementId: 'e3', sourceType: 'BusinessProcess', name: 'C' },
    ],
    links: [
      {
        sourceRelationshipId: 'r1',
        sourceType: 'Serving',
        sourceElementId: 'e1',
        targetElementId: 'e2',
      },
      {
        sourceRelationshipId: 'r2',
        sourceType: 'Serving',
        sourceElementId: 'e1',
        targetElementId: 'e3',
      },
      {
        sourceRelationshipId: 'r3',
        sourceType: 'Triggering',
        sourceElementId: 'e2',
        targetElementId: 'e3',
      },
    ],
    diagrams: [],
    organizations: [],
    sourceElementTypes: ['BusinessService', 'BusinessProcess'],
    sourceRelationshipTypes: ['Serving', 'Triggering'],
  }

  const mapping: ImportMappingState = {
    elementTypeMap: {
      BusinessService: { nodeTypeId: 'nt-s', componentId: 'cmp-s' },
      BusinessProcess: { nodeTypeId: 'nt-p', componentId: 'cmp-p' },
    },
    relationshipTypeMap: {
      Serving: { linkTypeId: 'lt-s', relationId: 'rel-serving' },
      Triggering: { linkTypeId: 'lt-t', relationId: 'rel-triggering' },
    },
  }

  it('groups disallowed links by stable key and skips allowed ones', () => {
    const groups = collectDisallowedOefLinkGroups({
      draft,
      mapping,
      relationRules: [
        {
          relationId: 'rel-triggering',
          fromComponentId: 'cmp-p',
          toComponentId: 'cmp-p',
        },
      ],
    })
    expect(groups).toHaveLength(1)
    expect(groups[0]!.count).toBe(2)
    expect(groups[0]!.sourceRelationshipIds).toEqual(['r1', 'r2'])
    expect(groups[0]!.key).toBe(
      buildDisallowedOefLinkGroupKey({
        sourceElementType: 'BusinessService',
        targetElementType: 'BusinessProcess',
        relationshipType: 'Serving',
        relationId: 'rel-serving',
        fromComponentId: 'cmp-s',
        toComponentId: 'cmp-p',
      })
    )
    expect(groups[0]!.relationshipType).toBe('Serving')
    expect(groups[0]!.sourceElementType).toBe('BusinessService')
    expect(groups[0]!.targetElementType).toBe('BusinessProcess')
    expect(groups[0]!.relationId).toBe('rel-serving')
  })

  it('skips links without full mapping', () => {
    const groups = collectDisallowedOefLinkGroups({
      draft,
      mapping: {
        elementTypeMap: {
          BusinessService: { nodeTypeId: 'nt-s', componentId: 'cmp-s' },
          BusinessProcess: { nodeTypeId: null, componentId: null },
        },
        relationshipTypeMap: {
          Serving: { linkTypeId: 'lt-s', relationId: 'rel-serving' },
          Triggering: { linkTypeId: null, relationId: null },
        },
      },
      relationRules: [],
    })
    expect(groups).toHaveLength(0)
  })

  it('skips rel→rel endpoints (relationship id as source/target)', () => {
    const withRelEndpoint: ImportDraft = {
      ...draft,
      links: [
        {
          sourceRelationshipId: 'r1',
          sourceType: 'Serving',
          sourceElementId: 'e1',
          targetElementId: 'e2',
        },
        {
          sourceRelationshipId: 'r-assoc',
          sourceType: 'Association',
          sourceElementId: 'r1',
          targetElementId: 'e2',
        },
      ],
    }
    const groups = collectDisallowedOefLinkGroups({
      draft: withRelEndpoint,
      mapping: {
        ...mapping,
        relationshipTypeMap: {
          ...mapping.relationshipTypeMap,
          Association: { linkTypeId: 'lt-a', relationId: 'rel-a' },
        },
      },
      relationRules: [
        {
          relationId: 'rel-serving',
          fromComponentId: 'cmp-s',
          toComponentId: 'cmp-p',
        },
      ],
    })
    expect(groups).toHaveLength(0)
  })
})
