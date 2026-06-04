import { describe, expect, it } from 'vitest'

import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from '@/features/models/modelAttrs'
import { buildImportDraft } from './oefDraftBuilder'
import { parseOefXml } from './oefParser'
import { buildOefBatchSaveRequest } from './oefToBatchSave'
import type { ImportMappingState } from './mappingState'
import mainXml from './__fixtures__/Main.xml?raw'

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
})
