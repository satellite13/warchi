import { describe, expect, it } from 'vitest'
import { createEmptyModelEditorState } from '@/features/models/types'
import { buildValidationSnapshot } from './buildValidationSnapshot'

describe('buildValidationSnapshot', () => {
  it('includes diagram membership and open diagram resolution', () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'm1'
    state.nodes = [
      {
        id: 'n1',
        name: 'A',
        parentNodeId: null,
        nodeTypeId: 'nt1',
        ownerId: 'u1',
        modelId: 'm1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {},
      } as never,
    ]
    state.links = [
      {
        id: 'l1',
        sourceId: 'n1',
        targetId: 'n1',
        linkTypeId: 'lt1',
        ownerId: 'u1',
        modelId: 'm1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {},
      } as never,
    ]
    state.diagrams = [
      {
        id: 'd1',
        name: 'D',
        version: '1.0.0',
        notationId: 'not1',
        modelId: 'm1',
        ownerId: 'u1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {
          instances: {
            nodes: [{ id: 'inst1', modelNodeId: 'n1' }],
            edges: [{ id: 'e1', modelLinkId: 'l1' }],
          },
        },
      } as never,
    ]
    state.notations = [{ id: 'not1', name: 'N', version: '1.0.0', ownerId: 'u1' } as never]
    state.nodeTypes = [{ id: 'nt1', name: 'App', ownerId: 'u1' } as never]
    state.linkTypes = [{ id: 'lt1', name: 'Flow', ownerId: 'u1' } as never]
    state.components = [
      { id: 'c1', name: 'App', notationId: 'not1', nodeTypeId: 'nt1', ownerId: 'u1' } as never,
    ]

    const { snapshot, openDiagramId } = buildValidationSnapshot({
      state,
      modelName: 'Model',
      modelVersion: '1.0.0',
      openDiagramId: 'd1',
    })

    expect(openDiagramId).toBe('d1')
    expect(snapshot.model.diagrams[0]?.nodeIds).toEqual(['n1'])
    expect(snapshot.model.diagrams[0]?.linkIds).toEqual(['l1'])
    expect(snapshot.notations).toHaveLength(1)
    expect(snapshot.types.nodeTypes.map((t) => t.id)).toEqual(['nt1'])
  })
})
