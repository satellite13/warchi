import { describe, expect, it, vi } from 'vitest'
import { createEmptyModelEditorState } from '../types'
import type { EditorDiagram, EditorNode } from '../types'
import { prepareValidationScriptRun } from './prepareValidationScriptRun'

describe('prepareValidationScriptRun', () => {
  it('fails when no diagram is open and does not load a detached overlay', async () => {
    const loadOverlayed = vi.fn()
    const state = createEmptyModelEditorState()
    state.modelId = 'm1'
    state.nodes = [
      {
        id: 'off-canvas',
        name: 'Off',
        parentNodeId: null,
        nodeTypeId: 'nt1',
        ownerId: 'u1',
        modelId: 'm1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {},
      } as EditorNode,
    ]

    const result = await prepareValidationScriptRun({
      state,
      modelName: 'Model',
      modelVersion: '1.0.0',
      openDiagramId: null,
    })

    expect(result.ok).toBe(false)
    expect(loadOverlayed).not.toHaveBeenCalled()
  })

  it('builds a diagram-scoped snapshot from the current editor state', async () => {
    const loadOverlayed = vi.fn()
    const state = createEmptyModelEditorState()
    state.modelId = 'm1'
    state.nodes = [
      {
        id: 'on-canvas',
        name: 'On',
        parentNodeId: null,
        nodeTypeId: 'nt1',
        ownerId: 'u1',
        modelId: 'm1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {},
      } as EditorNode,
      {
        id: 'off-canvas',
        name: 'Off',
        parentNodeId: null,
        nodeTypeId: 'nt1',
        ownerId: 'u1',
        modelId: 'm1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {},
      } as EditorNode,
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
            nodes: [{ id: 'inst1', modelNodeId: 'on-canvas', x: 4, y: 8 }],
            edges: [],
          },
        },
      } as EditorDiagram,
    ]
    state.nodeTypes = [{ id: 'nt1', name: 'App', ownerId: 'u1' } as never]

    const result = await prepareValidationScriptRun({
      state,
      modelName: 'Model',
      modelVersion: '1.0.0',
      openDiagramId: 'd1',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.openDiagramId).toBe('d1')
      expect(result.payload.snapshot.model.nodes.map((n) => n.id)).toEqual(['on-canvas'])
      expect(result.payload.snapshot.model.diagrams[0]?.instances).toHaveLength(1)
    }
    expect(loadOverlayed).not.toHaveBeenCalled()
  })
})
