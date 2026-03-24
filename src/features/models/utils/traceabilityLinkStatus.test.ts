import { describe, expect, it, vi } from 'vitest'
import type { RelationResponse } from '@/types/api'
import { parseDiagramAttrs, parseLinkAttrs } from '../modelAttrs'
import type { EditorDiagram, EditorLink } from '../types'
import { computeTraceabilityLinkStatus } from './traceabilityLinkStatus'

function createLink(overrides: Partial<EditorLink> = {}): EditorLink {
  return {
    id: 'link-1',
    sourceId: 'node-1',
    targetId: 'node-2',
    modelId: 'model-1',
    ownerId: 'owner-1',
    linkTypeId: 'lt-1',
    createdAt: null,
    updatedAt: null,
    parsedAttrs: parseLinkAttrs(null),
    ...overrides,
  }
}

function createDiagram(overrides?: Partial<EditorDiagram>): EditorDiagram {
  return {
    id: 'diagram-1',
    name: 'Diagram',
    version: '1.0.0',
    ownerId: 'owner-1',
    modelId: 'model-1',
    notationId: 'notation-1',
    createdAt: null,
    updatedAt: null,
    parsedAttrs: parseDiagramAttrs(
      JSON.stringify({
        instances: {
          nodes: [
            { id: 'inst-node-1', modelNodeId: 'node-1', x: 10, y: 10 },
            { id: 'inst-node-2', modelNodeId: 'node-2', x: 30, y: 30 },
          ],
          edges: [],
        },
      })
    ),
    ...overrides,
  }
}

function createRelation(overrides: Partial<RelationResponse> = {}): RelationResponse {
  return {
    id: 'rel-1',
    name: 'Relation',
    version: '1.0.0',
    notationId: 'notation-1',
    ownerId: 'owner-1',
    linkTypeId: 'lt-1',
    attrs: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

describe('computeTraceabilityLinkStatus', () => {
  it('returns noActiveDiagram when diagram is not selected', () => {
    const result = computeTraceabilityLinkStatus({
      link: createLink(),
      activeDiagram: null,
      activeNotationId: null,
      isDiagramReadOnly: false,
      relations: [],
      canConnect: () => true,
    })

    expect(result).toEqual({
      hasActiveDiagram: false,
      onDiagram: false,
      draggable: false,
      reason: 'noActiveDiagram',
    })
  })

  it('returns alreadyOnDiagram when edge with same modelLinkId exists', () => {
    const diagram = createDiagram()
    diagram.parsedAttrs.instances.edges.push({
      id: 'edge-1',
      modelLinkId: 'link-1',
      sourceInstanceId: 'inst-node-1',
      targetInstanceId: 'inst-node-2',
    })
    const canConnect = vi.fn(() => true)

    const result = computeTraceabilityLinkStatus({
      link: createLink(),
      activeDiagram: diagram,
      activeNotationId: 'notation-1',
      isDiagramReadOnly: false,
      relations: [createRelation()],
      canConnect,
    })

    expect(result.reason).toBe('alreadyOnDiagram')
    expect(result.draggable).toBe(false)
    expect(canConnect).not.toHaveBeenCalled()
  })

  it('returns missingEndpointInstances when source or target instance is absent', () => {
    const diagram = createDiagram()
    const result = computeTraceabilityLinkStatus({
      link: createLink({ targetId: 'node-missing' }),
      activeDiagram: diagram,
      activeNotationId: 'notation-1',
      isDiagramReadOnly: false,
      relations: [createRelation()],
      canConnect: () => true,
    })

    expect(result.reason).toBe('missingEndpointInstances')
  })

  it('returns missingRelation when notation relation does not exist for link type', () => {
    const diagram = createDiagram()
    const result = computeTraceabilityLinkStatus({
      link: createLink({ linkTypeId: 'lt-2' }),
      activeDiagram: diagram,
      activeNotationId: 'notation-1',
      isDiagramReadOnly: false,
      relations: [createRelation({ linkTypeId: 'lt-1' })],
      canConnect: () => true,
    })

    expect(result.reason).toBe('missingRelation')
  })

  it('returns connectNotAllowed when canConnect denies the link', () => {
    const diagram = createDiagram()
    const result = computeTraceabilityLinkStatus({
      link: createLink(),
      activeDiagram: diagram,
      activeNotationId: 'notation-1',
      isDiagramReadOnly: false,
      relations: [createRelation()],
      canConnect: () => false,
    })

    expect(result.reason).toBe('connectNotAllowed')
  })

  it('returns draggable=true when all constraints are satisfied', () => {
    const diagram = createDiagram()
    const result = computeTraceabilityLinkStatus({
      link: createLink(),
      activeDiagram: diagram,
      activeNotationId: 'notation-1',
      isDiagramReadOnly: false,
      relations: [createRelation()],
      canConnect: () => true,
    })

    expect(result).toEqual({
      hasActiveDiagram: true,
      onDiagram: false,
      draggable: true,
    })
  })

  it('ignores diagram-only edge ids through predicate', () => {
    const diagram = createDiagram()
    diagram.parsedAttrs.instances.edges.push({
      id: 'edge-note-1',
      modelLinkId: 'link-1',
      sourceInstanceId: 'inst-node-1',
      targetInstanceId: 'inst-node-2',
    })

    const result = computeTraceabilityLinkStatus({
      link: createLink(),
      activeDiagram: diagram,
      activeNotationId: 'notation-1',
      isDiagramReadOnly: false,
      relations: [createRelation()],
      canConnect: () => true,
      isDiagramOnlyEdgeModelLinkId: () => true,
    })

    expect(result.draggable).toBe(true)
    expect(result.onDiagram).toBe(false)
  })
})

