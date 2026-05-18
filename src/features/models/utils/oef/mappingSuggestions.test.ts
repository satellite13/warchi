import { describe, expect, it } from 'vitest'

import type { ComponentResponse, LinkTypeResponse, NodeTypeResponse, RelationResponse } from '@/types/api'
import { buildImportMappingSuggestions } from './mappingSuggestions'

function makeNodeType(id: string, name: string): NodeTypeResponse {
  return { id, name, ownerId: 'owner-1', attrs: null }
}

function makeLinkType(id: string, name: string): LinkTypeResponse {
  return { id, name, ownerId: 'owner-1', attrs: null }
}

function makeComponent(id: string, notationId: string, nodeTypeId: string, name: string): ComponentResponse {
  return {
    id,
    name,
    version: '1.0.0',
    ownerId: 'owner-1',
    notationId,
    nodeTypeId,
    attrs: null,
  }
}

function makeRelation(id: string, notationId: string, linkTypeId: string, name: string): RelationResponse {
  return {
    id,
    name,
    version: '1.0.0',
    ownerId: 'owner-1',
    notationId,
    linkTypeId,
    attrs: null,
  }
}

describe('mappingSuggestions', () => {
  it('suggests best matches for element and relationship types', () => {
    const notationId = 'notation-1'
    const nodeTypes = [
      makeNodeType('nt-business-service', 'Business Service'),
      makeNodeType('nt-business-process', 'Business Process'),
    ]
    const linkTypes = [makeLinkType('lt-serving', 'Serving')]
    const components = [
      makeComponent('cmp-service', notationId, 'nt-business-service', 'Service component'),
      makeComponent('cmp-process', notationId, 'nt-business-process', 'Process component'),
    ]
    const relations = [makeRelation('rel-serving', notationId, 'lt-serving', 'Serving relation')]

    const result = buildImportMappingSuggestions({
      sourceElementTypes: ['BusinessService', 'BusinessProcess'],
      sourceRelationshipTypes: ['Serving'],
      notationId,
      nodeTypes,
      linkTypes,
      components,
      relations,
      minScore: 0.2,
    })

    expect(result.elementBySourceType.BusinessService?.[0]).toMatchObject({
      nodeTypeId: 'nt-business-service',
      componentId: 'cmp-service',
    })
    expect(result.elementBySourceType.BusinessProcess?.[0]).toMatchObject({
      nodeTypeId: 'nt-business-process',
      componentId: 'cmp-process',
    })
    expect(result.relationshipBySourceType.Serving?.[0]).toMatchObject({
      linkTypeId: 'lt-serving',
      relationId: 'rel-serving',
    })
  })
})
