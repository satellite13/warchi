import { describe, expect, it } from 'vitest'
import { createEmptyModelEditorState } from '@/features/models/types'
import { buildDiagramScriptSnapshot } from './buildDiagramScriptSnapshot'
import type { EditorDiagram, EditorLink, EditorNode } from '@/features/models/types'

function node(partial: Pick<EditorNode, 'id' | 'name' | 'nodeTypeId'>): EditorNode {
  return {
    id: partial.id,
    name: partial.name,
    parentNodeId: null,
    nodeTypeId: partial.nodeTypeId,
    ownerId: 'u1',
    modelId: 'm1',
    createdAt: null,
    updatedAt: null,
    parsedAttrs: {},
  } as EditorNode
}

describe('buildDiagramScriptSnapshot', () => {
  it('includes only the open diagram canvas nodes and instance geometry', () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'm1'
    state.nodes = [
      node({ id: 'on-canvas', name: 'A', nodeTypeId: 'nt1' }),
      node({ id: 'off-canvas', name: 'B', nodeTypeId: 'nt1' }),
      node({ id: 'other', name: 'C', nodeTypeId: 'nt2' }),
    ]
    state.links = [
      {
        id: 'on-canvas-link',
        sourceId: 'on-canvas',
        targetId: 'on-canvas',
        linkTypeId: 'lt1',
        ownerId: 'u1',
        modelId: 'm1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {},
      } as EditorLink,
      {
        id: 'off-canvas-link',
        sourceId: 'off-canvas',
        targetId: 'other',
        linkTypeId: 'lt1',
        ownerId: 'u1',
        modelId: 'm1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {},
      } as EditorLink,
    ]
    state.diagrams = [
      {
        id: 'd1',
        name: 'Open',
        version: '1.0.0',
        notationId: 'not1',
        modelId: 'm1',
        ownerId: 'u1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {
          instances: {
            nodes: [{ id: 'inst1', modelNodeId: 'on-canvas', x: 10, y: 20, width: 80, height: 40 }],
            edges: [
              {
                id: 'e1',
                modelLinkId: 'on-canvas-link',
                sourceInstanceId: 'inst1',
                targetInstanceId: 'inst1',
              },
            ],
          },
        },
      } as EditorDiagram,
      {
        id: 'd2',
        name: 'Closed',
        version: '1.0.0',
        notationId: 'not2',
        modelId: 'm1',
        ownerId: 'u1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {
          instances: {
            nodes: [{ id: 'inst2', modelNodeId: 'other', x: 0, y: 0 }],
            edges: [],
          },
        },
      } as EditorDiagram,
    ]
    state.notations = [
      { id: 'not1', name: 'N', version: '1.0.0', ownerId: 'u1' } as never,
      { id: 'not2', name: 'OtherN', version: '1.0.0', ownerId: 'u1' } as never,
    ]
    state.nodeTypes = [
      { id: 'nt1', name: 'App', ownerId: 'u1' } as never,
      { id: 'nt2', name: 'Loc', ownerId: 'u1' } as never,
    ]
    state.linkTypes = [{ id: 'lt1', name: 'Flow', ownerId: 'u1' } as never]
    state.components = [
      { id: 'c1', name: 'App', notationId: 'not1', nodeTypeId: 'nt1', ownerId: 'u1' } as never,
      { id: 'c2', name: 'Loc', notationId: 'not2', nodeTypeId: 'nt2', ownerId: 'u1' } as never,
    ]

    const { snapshot, openDiagramId } = buildDiagramScriptSnapshot({
      state,
      modelName: 'Model',
      modelVersion: '1.0.0',
      openDiagramId: 'd1',
    })

    expect(openDiagramId).toBe('d1')
    expect(snapshot.model.nodes.map((n) => n.id)).toEqual(['on-canvas'])
    expect(snapshot.model.links.map((l) => l.id)).toEqual(['on-canvas-link'])
    expect(snapshot.model.folders).toEqual([])
    expect(snapshot.model.diagrams).toHaveLength(1)
    expect(snapshot.model.diagrams[0]?.instances).toHaveLength(1)
    expect(snapshot.model.diagrams[0]?.instances?.[0]).toMatchObject({
      id: 'inst1',
      modelNodeId: 'on-canvas',
      x: 10,
      y: 20,
    })
    expect(snapshot.model.diagrams[0]?.edges).toHaveLength(1)
    expect(snapshot.notations.map((n) => n.id)).toEqual(['not1'])
    expect(snapshot.types.nodeTypes.map((t) => t.id)).toEqual(['nt1'])
  })
})
