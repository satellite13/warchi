import { describe, expect, it } from 'vitest'
import type { EditorDiagram, EditorLink, EditorNode } from '../../types'
import type { ImportMappingState } from './mappingState'
import { createDefaultOefReuseSettings } from './reuseSettings'
import { effectiveLinkLabel, resolveOefEntityMatches } from './oefEntityReuse'
import type { ImportDraft } from './types'

function node(
  partial: Partial<EditorNode> & Pick<EditorNode, 'id' | 'name' | 'nodeTypeId'>
): EditorNode {
  return {
    modelId: 'm',
    ownerId: 'o',
    createdAt: null,
    updatedAt: null,
    attrs: null,
    parentNodeId: null,
    parsedAttrs: {
      treeOrder: 0,
      notationComponents: {},
      componentProperties: {},
      typeProperties: {},
    },
    ...partial,
  } as EditorNode
}

function link(
  partial: Partial<EditorLink> & Pick<EditorLink, 'id' | 'sourceId' | 'targetId' | 'linkTypeId'>
): EditorLink {
  return {
    modelId: 'm',
    ownerId: 'o',
    createdAt: null,
    updatedAt: null,
    attrs: null,
    parsedAttrs: { notationRelations: {}, relationProperties: {} },
    ...partial,
  } as EditorLink
}

function diagramWithEdge(modelLinkId: string, label: string): EditorDiagram {
  return {
    id: 'd1',
    name: 'D',
    version: '1.0.0',
    modelId: 'm',
    ownerId: 'o',
    notationId: 'n1',
    nodeId: null,
    createdAt: null,
    updatedAt: null,
    attrs: null,
    parsedAttrs: {
      instances: {
        nodes: [],
        edges: [
          {
            id: 'e1',
            modelLinkId,
            sourceInstanceId: 'a',
            targetInstanceId: 'b',
            attrs: label ? { label } : {},
          },
        ],
      },
    },
  } as EditorDiagram
}

const mapping: ImportMappingState = {
  elementTypeMap: {
    BusinessService: { nodeTypeId: 'nt-svc', componentId: 'cmp-svc' },
    BusinessProcess: { nodeTypeId: 'nt-proc', componentId: 'cmp-proc' },
  },
  relationshipTypeMap: {
    Serving: { linkTypeId: 'lt-serving', relationId: 'rel-serving' },
  },
}

const draft: ImportDraft = {
  sourceModelId: 'src',
  sourceModelName: 'S',
  nodes: [
    { sourceElementId: 'e1', sourceType: 'BusinessService', name: 'Alpha' },
    { sourceElementId: 'e2', sourceType: 'BusinessProcess', name: 'Beta' },
  ],
  links: [
    {
      sourceRelationshipId: 'r1',
      sourceType: 'Serving',
      sourceElementId: 'e1',
      targetElementId: 'e2',
      name: '',
    },
  ],
  diagrams: [],
  organizations: [],
}

describe('effectiveLinkLabel', () => {
  it('returns empty when no labels', () => {
    expect(effectiveLinkLabel('l-1', [diagramWithEdge('l-1', '')])).toEqual({
      label: '',
      conflict: false,
      samples: [],
    })
  })

  it('detects conflicting labels', () => {
    const d1 = diagramWithEdge('l-1', 'A')
    const d2 = {
      ...diagramWithEdge('l-1', 'B'),
      id: 'd2',
    } as EditorDiagram
    const result = effectiveLinkLabel('l-1', [d1, d2])
    expect(result.conflict).toBe(true)
    expect(result.label).toBeNull()
  })
})

describe('resolveOefEntityMatches', () => {
  it('alwaysCreate ignores existing nodes', () => {
    const result = resolveOefEntityMatches({
      draft,
      mapping,
      notationId: 'n1',
      existingNodes: [node({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' })],
      existingLinks: [],
      existingDiagrams: [],
      settings: createDefaultOefReuseSettings(),
    })
    expect(result.nodes.e1?.action).toBe('create')
  })

  it('reuses node by name+type; ambiguous picks lowest id', () => {
    const settings = { ...createDefaultOefReuseSettings(), nodesMode: 'reuseMatching' as const }
    const result = resolveOefEntityMatches({
      draft,
      mapping,
      notationId: 'n1',
      existingNodes: [
        node({ id: 'n-b', name: 'Alpha', nodeTypeId: 'nt-svc' }),
        node({ id: 'n-a', name: 'Alpha', nodeTypeId: 'nt-svc' }),
      ],
      existingLinks: [],
      existingDiagrams: [],
      settings,
    })
    expect(result.nodes.e1).toEqual({ action: 'reuse', id: 'n-a' })
    expect(result.warnings.some(w => w.code === 'nodeMatchAmbiguous')).toBe(true)
  })

  it('requires componentId when candidate has notation binding', () => {
    const settings = { ...createDefaultOefReuseSettings(), nodesMode: 'reuseMatching' as const }
    const result = resolveOefEntityMatches({
      draft,
      mapping,
      notationId: 'n1',
      existingNodes: [
        node({
          id: 'n-1',
          name: 'Alpha',
          nodeTypeId: 'nt-svc',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: { n1: { componentId: 'other-cmp' } },
            componentProperties: {},
            typeProperties: {},
          },
        }),
      ],
      existingLinks: [],
      existingDiagrams: [],
      settings,
    })
    expect(result.nodes.e1?.action).toBe('create')
  })

  it('reuses link only when both endpoints resolve to existing ids', () => {
    const settings = {
      ...createDefaultOefReuseSettings(),
      nodesMode: 'reuseMatching' as const,
      linksMode: 'reuseMatching' as const,
    }
    const result = resolveOefEntityMatches({
      draft,
      mapping,
      notationId: 'n1',
      existingNodes: [
        node({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' }),
        node({ id: 'n-beta', name: 'Beta', nodeTypeId: 'nt-proc' }),
      ],
      existingLinks: [
        link({ id: 'l-1', sourceId: 'n-alpha', targetId: 'n-beta', linkTypeId: 'lt-serving' }),
      ],
      existingDiagrams: [],
      settings,
    })
    expect(result.links.r1).toEqual({ action: 'reuse', id: 'l-1' })
  })

  it('endpointsTypeAndLabel matches OEF name against diagram edge attrs.label', () => {
    const settings = {
      ...createDefaultOefReuseSettings(),
      nodesMode: 'reuseMatching' as const,
      linksMode: 'reuseMatching' as const,
      linkMatchCriterion: 'endpointsTypeAndLabel' as const,
    }
    const namedDraft: ImportDraft = {
      ...draft,
      links: [{ ...draft.links[0]!, name: 'Flow' }],
    }
    const result = resolveOefEntityMatches({
      draft: namedDraft,
      mapping,
      notationId: 'n1',
      existingNodes: [
        node({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' }),
        node({ id: 'n-beta', name: 'Beta', nodeTypeId: 'nt-proc' }),
      ],
      existingLinks: [
        link({ id: 'l-1', sourceId: 'n-alpha', targetId: 'n-beta', linkTypeId: 'lt-serving' }),
      ],
      existingDiagrams: [diagramWithEdge('l-1', 'Flow')],
      settings,
    })
    expect(result.links.r1).toEqual({ action: 'reuse', id: 'l-1' })
  })

  it('endpointsTypeAndLabel does not match when edge label differs from OEF name', () => {
    const settings = {
      ...createDefaultOefReuseSettings(),
      nodesMode: 'reuseMatching' as const,
      linksMode: 'reuseMatching' as const,
      linkMatchCriterion: 'endpointsTypeAndLabel' as const,
    }
    const namedDraft: ImportDraft = {
      ...draft,
      links: [{ ...draft.links[0]!, name: 'Flow' }],
    }
    const result = resolveOefEntityMatches({
      draft: namedDraft,
      mapping,
      notationId: 'n1',
      existingNodes: [
        node({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' }),
        node({ id: 'n-beta', name: 'Beta', nodeTypeId: 'nt-proc' }),
      ],
      existingLinks: [
        link({ id: 'l-1', sourceId: 'n-alpha', targetId: 'n-beta', linkTypeId: 'lt-serving' }),
      ],
      existingDiagrams: [diagramWithEdge('l-1', 'Other')],
      settings,
    })
    expect(result.links.r1?.action).toBe('create')
  })

  it('updateFromOef marks action update', () => {
    const settings = {
      ...createDefaultOefReuseSettings(),
      nodesMode: 'reuseMatching' as const,
      onNodeMatch: 'updateFromOef' as const,
    }
    const result = resolveOefEntityMatches({
      draft,
      mapping,
      notationId: 'n1',
      existingNodes: [node({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' })],
      existingLinks: [],
      existingDiagrams: [],
      settings,
    })
    expect(result.nodes.e1).toEqual({ action: 'update', id: 'n-alpha' })
  })
})
