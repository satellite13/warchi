import { describe, expect, it } from 'vitest'
import { parseNodeAttrs } from '../modelAttrs'
import { createEmptyModelEditorState } from '../types'
import {
  collectModelSaveValidationCandidates,
  prepareModelSaveValidation,
} from './prepareModelSaveValidation'

describe('prepareModelSaveValidation', () => {
  it('selects dirty entities and entities represented in dirty diagrams', () => {
    const state = createEmptyModelEditorState()
    state.nodes = [
      {
        id: 'clean-node',
        name: 'Clean',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: null,
        parsedAttrs: parseNodeAttrs(null),
      },
      {
        id: 'dirty-node',
        name: 'Dirty',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: null,
        parsedAttrs: { ...parseNodeAttrs(null), typeProperties: { code: 'APP-1' } },
        _isDirty: true,
      },
      {
        id: 'deleted-node',
        name: 'Deleted',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: null,
        parsedAttrs: parseNodeAttrs(null),
        _isDeleted: true,
      },
    ]
    state.links = [
      {
        id: 'diagram-link',
        modelId: 'model-1',
        ownerId: 'owner-1',
        sourceId: 'clean-node',
        targetId: 'dirty-node',
        linkTypeId: 'type-1',
        parsedAttrs: { notationRelations: {}, relationProperties: {}, typeProperties: {} },
      },
    ]
    state.diagrams = [
      {
        id: 'dirty-diagram',
        name: 'Diagram',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        version: '1.0.0',
        parsedAttrs: {
          instances: {
            nodes: [{ id: 'i1', modelNodeId: 'clean-node', x: 0, y: 0 }],
            edges: [
              {
                id: 'e1',
                modelLinkId: 'diagram-link',
                sourceInstanceId: 'i1',
                targetInstanceId: 'i1',
              },
            ],
          },
        },
        _isDirty: true,
      },
    ]

    const candidates = collectModelSaveValidationCandidates(state)

    expect(candidates.nodes.map(node => node.id)).toEqual(['dirty-node', 'clean-node'])
    expect(candidates.links.map(link => link.id)).toEqual(['diagram-link'])
  })

  it('validates changed local entities without loading the full model', async () => {
    const state = createEmptyModelEditorState()
    state.nodes = [
      {
        id: 'n1',
        name: 'Local',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: null,
        parsedAttrs: { ...parseNodeAttrs(null), typeProperties: { code: 'APP-1' } },
        _isDirty: true,
      },
    ]
    state.nodeTypes = [
      {
        id: 'type-1',
        name: 'App',
        ownerId: 'owner-1',
        attrs: JSON.stringify({
          customProperties: [{ name: 'code', type: 'string', required: true, system: false }],
        }),
      } as never,
    ]

    const result = await prepareModelSaveValidation({ state, activeDiagram: null })

    expect(result).toEqual({ ok: true })
  })
})
