import { describe, expect, it } from 'vitest'
import { createEmptyScriptEditorState } from './editorStateContract'
import { buildValidationSnapshot } from './buildValidationSnapshot'

describe('buildValidationSnapshot', () => {
  it('includes diagram membership and open diagram resolution', () => {
    const state = createEmptyScriptEditorState()
    state.modelId = 'm1'
    state.nodes = [
      {
        id: 'n1',
        name: 'A',
        parentNodeId: null,
        nodeTypeId: 'nt1',
        parsedAttrs: {},
      },
    ]
    state.links = [
      {
        id: 'l1',
        sourceId: 'n1',
        targetId: 'n1',
        linkTypeId: 'lt1',
        parsedAttrs: {},
      },
    ]
    state.diagrams = [
      {
        id: 'd1',
        name: 'D',
        version: '1.0.0',
        notationId: 'not1',
        parsedAttrs: {
          instances: {
            nodes: [{ id: 'inst1', modelNodeId: 'n1', x: 0, y: 0 }],
            edges: [
              {
                id: 'e1',
                modelLinkId: 'l1',
                sourceInstanceId: 'inst1',
                targetInstanceId: 'inst1',
              },
            ],
          },
        },
      },
    ]
    state.notations = [{ id: 'not1', name: 'N', version: '1.0.0' }]
    state.nodeTypes = [{ id: 'nt1', name: 'App' }]
    state.linkTypes = [{ id: 'lt1', name: 'Flow' }]
    state.components = [{ id: 'c1', name: 'App', notationId: 'not1', nodeTypeId: 'nt1' }]

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

  it('builds from an explicit detached overlay instead of partial editor arrays', () => {
    const state = createEmptyScriptEditorState()
    state.modelId = 'm1'
    state.nodes = [
      {
        id: 'partial-only',
        name: 'Partial',
        parentNodeId: null,
        nodeTypeId: 'nt1',
        parsedAttrs: {},
      },
    ]
    state.nodeTypes = [{ id: 'nt1', name: 'App' }]

    const { snapshot } = buildValidationSnapshot({
      state: {
        ...state,
        nodes: [
          {
            id: 'detached-n',
            name: 'Detached',
            parentNodeId: null,
            nodeTypeId: 'nt1',
            parsedAttrs: {},
          },
        ],
      },
      modelName: 'Model',
      modelVersion: '1.0.0',
      openDiagramId: null,
    })

    expect(snapshot.model.nodes.map((node) => node.id)).toEqual(['detached-n'])
    expect(state.nodes.map((node) => node.id)).toEqual(['partial-only'])
  })
})
