import { beforeEach, describe, expect, it } from 'vitest'

import { createInitialImportMappingState, loadCachedImportMappingState, mergeImportMappingState, saveCachedImportMappingState } from './mappingState'
import type { ImportMappingSuggestions } from './mappingSuggestions'

describe('mappingState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('auto-selects high-confidence suggestions', () => {
    const suggestions: ImportMappingSuggestions = {
      elementBySourceType: {
        BusinessService: [
          {
            sourceType: 'BusinessService',
            kind: 'element',
            score: 0.95,
            reason: 'exact',
            nodeTypeId: 'nt-service',
            componentId: 'cmp-service',
          },
        ],
      },
      relationshipBySourceType: {
        Serving: [
          {
            sourceType: 'Serving',
            kind: 'relationship',
            score: 0.91,
            reason: 'exact',
            linkTypeId: 'lt-serving',
            relationId: 'rel-serving',
          },
        ],
      },
    }

    const state = createInitialImportMappingState({
      sourceElementTypes: ['BusinessService'],
      sourceRelationshipTypes: ['Serving'],
      suggestions,
    })

    expect(state.elementTypeMap.BusinessService).toEqual({
      nodeTypeId: 'nt-service',
      componentId: 'cmp-service',
      score: 0.95,
    })
    expect(state.relationshipTypeMap.Serving).toEqual({
      linkTypeId: 'lt-serving',
      relationId: 'rel-serving',
      score: 0.91,
    })
  })

  it('persists and loads cached mapping state for notation', () => {
    const notationId = 'notation-1'
    const state = {
      elementTypeMap: { BusinessService: { nodeTypeId: 'nt1', componentId: 'cmp1' } },
      relationshipTypeMap: { Serving: { linkTypeId: 'lt1', relationId: 'rel1' } },
    }

    saveCachedImportMappingState(notationId, state)
    const loaded = loadCachedImportMappingState(notationId)

    expect(loaded).toEqual(state)
  })

  it('merges cached mappings over initial defaults', () => {
    const initial = {
      elementTypeMap: {
        BusinessService: { nodeTypeId: null, componentId: null },
        BusinessProcess: { nodeTypeId: 'nt-process', componentId: 'cmp-process' },
      },
      relationshipTypeMap: {
        Serving: { linkTypeId: null, relationId: null },
      },
    }
    const cached = {
      elementTypeMap: {
        BusinessService: { nodeTypeId: 'nt-service', componentId: 'cmp-service' },
      },
      relationshipTypeMap: {
        Serving: { linkTypeId: 'lt-serving', relationId: 'rel-serving' },
      },
    }

    const merged = mergeImportMappingState(initial, cached)
    expect(merged.elementTypeMap.BusinessService).toEqual({
      nodeTypeId: 'nt-service',
      componentId: 'cmp-service',
    })
    expect(merged.elementTypeMap.BusinessProcess).toEqual({
      nodeTypeId: 'nt-process',
      componentId: 'cmp-process',
    })
    expect(merged.relationshipTypeMap.Serving).toEqual({
      linkTypeId: 'lt-serving',
      relationId: 'rel-serving',
    })
  })
})
