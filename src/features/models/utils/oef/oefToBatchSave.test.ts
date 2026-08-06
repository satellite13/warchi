import { describe, expect, it } from 'vitest'

import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from '@/features/models/modelAttrs'
import type { EditorLink, EditorNode } from '@/features/models/types'
import { buildImportDraft } from './oefDraftBuilder'
import { parseOefXml } from './oefParser'
import { buildOefBatchSaveRequest, OEF_ENTITY_NAME_MAX_LENGTH } from './oefToBatchSave'
import type { ImportMappingState } from './mappingState'
import { collectDisallowedOefLinkGroups } from './oefRelationRuleValidation'
import { createDefaultOefReuseSettings } from './reuseSettings'
import type { ImportDraft } from './types'
import mainXml from './__fixtures__/Main.xml?raw'
import containerAssocXml from './__fixtures__/container-assoc-to-flow.xml?raw'
import namedRelationshipXml from './__fixtures__/named-relationship.xml?raw'
import propsXml from './__fixtures__/element-properties.xml?raw'

function editorNode(
  partial: Partial<EditorNode> & Pick<EditorNode, 'id' | 'name' | 'nodeTypeId'>
): EditorNode {
  return {
    modelId: 'm',
    ownerId: 'o',
    createdAt: null,
    updatedAt: '2026-01-01T00:00:00Z',
    attrs: null,
    parentNodeId: 'root',
    parsedAttrs: {
      treeOrder: 0,
      notationComponents: {},
      componentProperties: {},
      typeProperties: {},
    },
    ...partial,
  } as EditorNode
}

function editorLink(
  partial: Partial<EditorLink> & Pick<EditorLink, 'id' | 'sourceId' | 'targetId' | 'linkTypeId'>
): EditorLink {
  return {
    modelId: 'm',
    ownerId: 'o',
    createdAt: null,
    updatedAt: '2026-01-01T00:00:00Z',
    attrs: null,
    parsedAttrs: { notationRelations: {}, relationProperties: {}, typeProperties: {} },
    ...partial,
  } as EditorLink
}

function buildFullMappingState(): ImportMappingState {
  return {
    elementTypeMap: {
      BusinessService: { nodeTypeId: 'nt-business-service', componentId: 'cmp-business-service' },
      BusinessProcess: { nodeTypeId: 'nt-business-process', componentId: 'cmp-business-process' },
      BusinessEvent: { nodeTypeId: 'nt-business-event', componentId: 'cmp-business-event' },
    },
    relationshipTypeMap: {
      Serving: { linkTypeId: 'lt-serving', relationId: 'rel-serving' },
      Triggering: { linkTypeId: 'lt-triggering', relationId: 'rel-triggering' },
    },
  }
}

describe('oefToBatchSave', () => {
  it('builds create-only batch payload with linked temp ids', () => {
    const draft = buildImportDraft(parseOefXml(mainXml))
    const result = buildOefBatchSaveRequest({
      draft,
      mapping: buildFullMappingState(),
      notationId: 'notation-1',
      parentNodeId: 'root-node-id',
      diagramVersion: '1.0.0',
      nodeTypePropertyDefaultsById: {
        'nt-business-service': { owner: 'Team A' },
      },
      componentPropertyDefaultsById: {
        'cmp-business-service': { status: 'draft' },
      },
      relationPropertyDefaultsById: {
        'rel-serving': { confidence: 'high' },
      },
    })

    expect(result.request.nodes.update).toHaveLength(0)
    expect(result.request.links.update).toHaveLength(0)
    expect(result.request.diagrams.update).toHaveLength(0)
    expect(result.request.nodes.create).toHaveLength(6)
    expect(result.request.links.create).toHaveLength(5)
    expect(result.request.diagrams.create).toHaveLength(1)
    expect(result.warnings).toHaveLength(0)

    const nodeIds = new Set(result.request.nodes.create.map(item => item.tempId))
    const linkIds = new Set(result.request.links.create.map(item => item.tempId))
    for (const link of result.request.links.create) {
      expect(nodeIds.has(link.sourceId)).toBe(true)
      expect(nodeIds.has(link.targetId)).toBe(true)
    }

    const diagram = result.request.diagrams.create[0]!
    expect(diagram.nodeId).toBe('root-node-id')
    const attrs = parseDiagramAttrs(diagram.attrs)
    expect(attrs.instances.nodes).toHaveLength(7)
    expect(attrs.instances.edges).toHaveLength(6)
    for (const instance of attrs.instances.nodes) {
      if (instance.attrs?.isNote === true) {
        expect(instance.modelNodeId.startsWith('__diagram-note__:')).toBe(true)
        expect(instance.attrs.noteText).toBe('Test note')
        expect(instance.width).toBe(185)
        expect(instance.height).toBe(80)
      } else {
        expect(nodeIds.has(instance.modelNodeId)).toBe(true)
      }
    }
    for (const edge of attrs.instances.edges) {
      if (edge.attrs?.isDiagramOnly === true) {
        expect(edge.modelLinkId.startsWith('__diagram-note-edge__:')).toBe(true)
      } else {
        expect(linkIds.has(edge.modelLinkId)).toBe(true)
      }
    }

    const serviceNode = result.request.nodes.create.find(item => item.nodeTypeId === 'nt-business-service')
    expect(serviceNode).toBeTruthy()
    const serviceNodeAttrs = parseNodeAttrs(serviceNode!.attrs)
    expect(serviceNodeAttrs.typeProperties.owner).toBe('Team A')
    expect(serviceNodeAttrs.componentProperties['notation-1']?.['cmp-business-service']?.status).toBe('draft')

    const servingLink = result.request.links.create.find(item => item.linkTypeId === 'lt-serving')
    expect(servingLink).toBeTruthy()
    const servingLinkAttrs = parseLinkAttrs(servingLink!.attrs)
    expect(servingLinkAttrs.relationProperties['notation-1']?.['rel-serving']?.confidence).toBe('high')
  })

  it('imports Container and Association-to-Flow as diagram-only with edge anchor', () => {
    const draft = buildImportDraft(parseOefXml(containerAssocXml))
    const result = buildOefBatchSaveRequest({
      draft,
      mapping: {
        elementTypeMap: {
          BusinessProcess: { nodeTypeId: 'nt-process', componentId: 'cmp-process' },
          DataObject: { nodeTypeId: 'nt-data', componentId: 'cmp-data' },
        },
        relationshipTypeMap: {
          Flow: { linkTypeId: 'lt-flow', relationId: 'rel-flow' },
          Association: { linkTypeId: 'lt-assoc', relationId: 'rel-assoc' },
        },
      },
      notationId: 'notation-1',
    })

    expect(result.request.nodes.create).toHaveLength(3)
    expect(result.request.links.create).toHaveLength(1)
    expect(result.request.links.create[0]?.linkTypeId).toBe('lt-flow')

    const attrs = parseDiagramAttrs(result.request.diagrams.create[0]!.attrs)
    const containers = attrs.instances.nodes.filter(node => node.attrs?.isContainer === true)
    const anchors = attrs.instances.nodes.filter(node => node.attrs?.isEdgeAnchor === true)
    const diagramOnlyEdges = attrs.instances.edges.filter(edge => edge.attrs?.isDiagramOnly === true)
    const modelEdges = attrs.instances.edges.filter(edge => edge.attrs?.isDiagramOnly !== true)

    expect(containers).toHaveLength(1)
    expect(containers[0]?.attrs?.containerLabel).toBe('Group')
    const containerStyle = containers[0]?.attrs?.diagramStyle as
      | { labelAlign?: string; labelVerticalAlign?: string }
      | undefined
    expect(containerStyle?.labelVerticalAlign).toBe('top')
    expect(containerStyle?.labelAlign).toBe('left')
    expect(anchors).toHaveLength(1)
    expect(typeof anchors[0]?.attrs?.hostEdgeInstanceId).toBe('string')
    expect(modelEdges).toHaveLength(1)
    expect(diagramOnlyEdges).toHaveLength(1)
    expect(
      diagramOnlyEdges.some(
        edge =>
          edge.sourceInstanceId === anchors[0]?.id || edge.targetInstanceId === anchors[0]?.id
      )
    ).toBe(true)
  })

  it('copies OEF relationship name onto diagram edge label', () => {
    const draft = buildImportDraft(parseOefXml(namedRelationshipXml))
    expect(draft.links[0]?.name).toBe('Payload flow')

    const result = buildOefBatchSaveRequest({
      draft,
      mapping: {
        elementTypeMap: {
          BusinessProcess: { nodeTypeId: 'nt-process', componentId: 'cmp-process' },
        },
        relationshipTypeMap: {
          Flow: { linkTypeId: 'lt-flow', relationId: 'rel-flow' },
        },
      },
      notationId: 'notation-1',
    })

    const attrs = parseDiagramAttrs(result.request.diagrams.create[0]!.attrs)
    expect(attrs.instances.edges).toHaveLength(1)
    expect(attrs.instances.edges[0]?.attrs?.label).toBe('Payload flow')
  })

  it('skips unmapped entities and reports warnings', () => {
    const draft = buildImportDraft(parseOefXml(mainXml))
    const mapping: ImportMappingState = {
      elementTypeMap: {
        BusinessService: { nodeTypeId: 'nt-business-service', componentId: 'cmp-business-service' },
        BusinessProcess: { nodeTypeId: null, componentId: null },
        BusinessEvent: { nodeTypeId: null, componentId: null },
      },
      relationshipTypeMap: {
        Serving: { linkTypeId: 'lt-serving', relationId: 'rel-serving' },
        Triggering: { linkTypeId: null, relationId: null },
      },
    }
    const result = buildOefBatchSaveRequest({
      draft,
      mapping,
      notationId: 'notation-1',
    })

    expect(result.request.nodes.create.length).toBeGreaterThan(0)
    expect(result.request.nodes.create.length).toBeLessThan(draft.nodes.length)
    expect(result.warnings.some(item => item.code === 'nodeTypeNotMapped')).toBe(true)
    expect(result.warnings.some(item => item.code === 'linkTypeNotMapped')).toBe(true)
  })

  it('places elements and diagrams under organization directories', () => {
    const draft = buildImportDraft(parseOefXml(mainXml))
    draft.organizations = [
      {
        label: 'Business',
        children: draft.nodes.map(node => ({
          refId: node.sourceElementId,
          refKind: 'element' as const,
        })),
      },
      {
        label: 'Views',
        children: draft.diagrams.map(diagram => ({
          refId: diagram.sourceViewId,
          refKind: 'view' as const,
        })),
      },
    ]

    const result = buildOefBatchSaveRequest({
      draft,
      mapping: buildFullMappingState(),
      notationId: 'notation-1',
      directoryNodeTypeId: 'nt-directory',
      parentNodeId: 'root-node-id',
    })

    const directories = result.request.nodes.create.filter(item => item.nodeTypeId === 'nt-directory')
    expect(directories).toHaveLength(2)
    expect(directories[0]!.parentNodeId).toBe('root-node-id')
    const businessTempId = directories[0]!.tempId
    const viewsTempId = directories[1]!.tempId
    expect(result.request.nodes.create.some(item => item.parentNodeId === businessTempId)).toBe(true)
    expect(result.request.diagrams.create[0]!.nodeId).toBe(viewsTempId)
  })

  it('truncates node and diagram names to API max length', () => {
    const draft = buildImportDraft(parseOefXml(mainXml))
    const longName = 'N'.repeat(OEF_ENTITY_NAME_MAX_LENGTH + 40)
    draft.nodes[0]!.name = longName
    draft.diagrams[0]!.name = longName

    const result = buildOefBatchSaveRequest({
      draft,
      mapping: buildFullMappingState(),
      notationId: 'notation-1',
    })

    expect(result.request.nodes.create[0]!.name).toHaveLength(OEF_ENTITY_NAME_MAX_LENGTH)
    expect(result.request.diagrams.create[0]!.name).toHaveLength(OEF_ENTITY_NAME_MAX_LENGTH)
    expect(result.warnings.filter(item => item.code === 'nameTruncated')).toHaveLength(2)
  })

  it('deduplicates duplicate diagram names within one import', () => {
    const draft = buildImportDraft(parseOefXml(mainXml))
    draft.diagrams.push({
      ...structuredClone(draft.diagrams[0]!),
      sourceViewId: 'view-duplicate-2',
      name: draft.diagrams[0]!.name,
    })
    draft.diagrams.push({
      ...structuredClone(draft.diagrams[0]!),
      sourceViewId: 'view-duplicate-3',
      name: draft.diagrams[0]!.name,
    })

    const result = buildOefBatchSaveRequest({
      draft,
      mapping: buildFullMappingState(),
      notationId: 'notation-1',
    })

    const names = result.request.diagrams.create.map(item => item.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.filter(name => name === draft.diagrams[0]!.name)).toHaveLength(1)
    expect(names.some(name => name.endsWith(' (2)'))).toBe(true)
    expect(names.some(name => name.endsWith(' (3)'))).toBe(true)
    expect(result.warnings.filter(item => item.code === 'nameDeduplicated')).toHaveLength(2)
  })

  it('skips links disallowed by empty relation rules when decisions are skip', () => {
    const draft = buildImportDraft(parseOefXml(mainXml))
    const mapping = buildFullMappingState()
    const groups = collectDisallowedOefLinkGroups({
      draft,
      mapping,
      relationRules: [],
    })
    const ruleDecisions = Object.fromEntries(groups.map(group => [group.key, 'skip' as const]))

    const result = buildOefBatchSaveRequest({
      draft,
      mapping,
      notationId: 'notation-1',
      relationRules: [],
      ruleDecisions,
    })

    expect(result.request.links.create).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.every(item => item.code === 'linkNotAllowedByRelationRules')).toBe(true)
    expect(result.warnings.some(item => item.code === 'diagramConnectionMissingModelLink')).toBe(
      false
    )
  })

  it('imports links disallowed by empty relation rules when decisions are import', () => {
    const draft = buildImportDraft(parseOefXml(mainXml))
    const mapping = buildFullMappingState()
    const groups = collectDisallowedOefLinkGroups({
      draft,
      mapping,
      relationRules: [],
    })
    const ruleDecisions = Object.fromEntries(groups.map(group => [group.key, 'import' as const]))

    const result = buildOefBatchSaveRequest({
      draft,
      mapping,
      notationId: 'notation-1',
      relationRules: [],
      ruleDecisions,
    })

    expect(result.request.links.create).toHaveLength(5)
    expect(result.warnings.filter(item => item.code === 'linkImportedAgainstRelationRules')).toHaveLength(
      5
    )
  })

  it('merges OEF properties into type and component values by name', () => {
    const draft = buildImportDraft(parseOefXml(propsXml))
    const result = buildOefBatchSaveRequest({
      draft,
      mapping: {
        elementTypeMap: {
          BusinessService: { nodeTypeId: 'nt-1', componentId: 'cmp-1' },
        },
        relationshipTypeMap: {
          Association: { linkTypeId: 'lt-1', relationId: 'rel-1' },
        },
      },
      notationId: 'notation-1',
      nodeTypePropertyDefaultsById: { 'nt-1': { Owner: 'Default', Count: 1 } },
      componentPropertyDefaultsById: { 'cmp-1': {} },
      relationPropertyDefaultsById: { 'rel-1': {} },
      nodeTypeCustomPropertiesById: {
        'nt-1': [
          { id: '1', name: 'Owner', type: 'string', required: false, min: null, max: null },
          { id: '2', name: 'Count', type: 'number', required: false, min: null, max: null },
        ],
      },
      componentCustomPropertiesById: {
        'cmp-1': [
          { id: '3', name: 'Owner', type: 'string', required: false, min: null, max: null },
        ],
      },
      relationCustomPropertiesById: {
        'rel-1': [
          { id: '4', name: 'Owner', type: 'string', required: false, min: null, max: null },
        ],
      },
    })

    const nodeAttrs = parseNodeAttrs(result.request.nodes.create[0]!.attrs)
    expect(nodeAttrs.typeProperties.Owner).toBe('Team A')
    expect(nodeAttrs.typeProperties.Count).toBe(7)
    expect(nodeAttrs.componentProperties['notation-1']?.['cmp-1']?.Owner).toBe('Team A')

    const linkAttrs = parseLinkAttrs(result.request.links.create[0]!.attrs)
    expect(linkAttrs.relationProperties['notation-1']?.['rel-1']?.Owner).toBe('Link Owner')

    expect(
      result.warnings.some(w => w.code === 'propertyUnmatched' && w.message.includes('OrphanProp'))
    ).toBe(true)
  })

  it('reuses matching existing nodes by id without create', () => {
    const draft: ImportDraft = {
      sourceModelId: 'src',
      sourceModelName: 'S',
      sourceElementTypes: ['BusinessService', 'BusinessProcess'],
      sourceRelationshipTypes: ['Serving'],
      nodes: [
        { sourceElementId: 'e1', sourceType: 'BusinessService', name: 'Alpha' },
        { sourceElementId: 'e2', sourceType: 'BusinessProcess', name: 'Beta' },
      ],
      links: [],
      diagrams: [],
      organizations: [],
    }
    const mapping: ImportMappingState = {
      elementTypeMap: {
        BusinessService: { nodeTypeId: 'nt-svc', componentId: 'cmp-svc' },
        BusinessProcess: { nodeTypeId: 'nt-proc', componentId: 'cmp-proc' },
      },
      relationshipTypeMap: {},
    }
    const result = buildOefBatchSaveRequest({
      draft,
      mapping,
      notationId: 'notation-1',
      existingNodes: [
        editorNode({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' }),
        editorNode({ id: 'n-beta', name: 'Beta', nodeTypeId: 'nt-proc' }),
      ],
      reuseSettings: {
        ...createDefaultOefReuseSettings(),
        nodesMode: 'reuseMatching',
      },
    })

    expect(result.request.nodes.create).toHaveLength(0)
    expect(result.request.nodes.update).toHaveLength(0)
    expect(result.reuseCounts.nodesReused).toBe(2)
  })

  it('updates existing node properties and keeps parent', () => {
    const draft: ImportDraft = {
      sourceModelId: 'src',
      sourceModelName: 'S',
      sourceElementTypes: ['BusinessService', 'BusinessProcess'],
      sourceRelationshipTypes: ['Serving'],
      nodes: [
        {
          sourceElementId: 'e1',
          sourceType: 'BusinessService',
          name: 'Alpha',
          properties: { Owner: 'New' },
        },
      ],
      links: [],
      diagrams: [],
      organizations: [],
    }
    const result = buildOefBatchSaveRequest({
      draft,
      mapping: {
        elementTypeMap: {
          BusinessService: { nodeTypeId: 'nt-svc', componentId: 'cmp-svc' },
        },
        relationshipTypeMap: {},
      },
      notationId: 'notation-1',
      existingNodes: [
        editorNode({
          id: 'n-alpha',
          name: 'Alpha',
          nodeTypeId: 'nt-svc',
          parentNodeId: 'keep-parent',
          parsedAttrs: {
            treeOrder: 3,
            notationComponents: { 'notation-1': { componentId: 'cmp-svc' } },
            componentProperties: {},
            typeProperties: { Owner: 'Old' },
          },
        }),
      ],
      nodeTypeCustomPropertiesById: {
        'nt-svc': [
          { id: '1', name: 'Owner', type: 'string', required: false, min: null, max: null },
        ],
      },
      componentCustomPropertiesById: { 'cmp-svc': [] },
      reuseSettings: {
        ...createDefaultOefReuseSettings(),
        nodesMode: 'reuseMatching',
        onNodeMatch: 'updateFromOef',
      },
    })

    expect(result.request.nodes.create).toHaveLength(0)
    expect(result.request.nodes.update).toHaveLength(1)
    expect(result.request.nodes.update[0]!.parentNodeId).toBe('keep-parent')
    expect(parseNodeAttrs(result.request.nodes.update[0]!.attrs).typeProperties.Owner).toBe('New')
    expect(parseNodeAttrs(result.request.nodes.update[0]!.attrs).treeOrder).toBe(3)
    expect(result.reuseCounts.nodesUpdated).toBe(1)
  })

  it('reuses link when both endpoints are reused', () => {
    const draft: ImportDraft = {
      sourceModelId: 'src',
      sourceModelName: 'S',
      sourceElementTypes: ['BusinessService', 'BusinessProcess'],
      sourceRelationshipTypes: ['Serving'],
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
    const mapping: ImportMappingState = {
      elementTypeMap: {
        BusinessService: { nodeTypeId: 'nt-svc', componentId: 'cmp-svc' },
        BusinessProcess: { nodeTypeId: 'nt-proc', componentId: 'cmp-proc' },
      },
      relationshipTypeMap: {
        Serving: { linkTypeId: 'lt-serving', relationId: 'rel-serving' },
      },
    }
    const result = buildOefBatchSaveRequest({
      draft,
      mapping,
      notationId: 'notation-1',
      existingNodes: [
        editorNode({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' }),
        editorNode({ id: 'n-beta', name: 'Beta', nodeTypeId: 'nt-proc' }),
      ],
      existingLinks: [
        editorLink({
          id: 'l-1',
          sourceId: 'n-alpha',
          targetId: 'n-beta',
          linkTypeId: 'lt-serving',
        }),
      ],
      reuseSettings: {
        ...createDefaultOefReuseSettings(),
        nodesMode: 'reuseMatching',
        linksMode: 'reuseMatching',
      },
    })

    expect(result.request.links.create).toHaveLength(0)
    expect(result.reuseCounts.linksReused).toBe(1)
    expect(result.reuseCounts.nodesReused).toBe(2)
  })
})
