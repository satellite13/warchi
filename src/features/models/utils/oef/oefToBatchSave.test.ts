import { describe, expect, it } from 'vitest'

import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from '@/features/models/modelAttrs'
import { buildImportDraft } from './oefDraftBuilder'
import { parseOefXml } from './oefParser'
import { buildOefBatchSaveRequest, OEF_ENTITY_NAME_MAX_LENGTH } from './oefToBatchSave'
import type { ImportMappingState } from './mappingState'
import mainXml from './__fixtures__/Main.xml?raw'
import containerAssocXml from './__fixtures__/container-assoc-to-flow.xml?raw'

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
})
