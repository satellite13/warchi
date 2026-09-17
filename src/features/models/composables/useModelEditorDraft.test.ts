import { beforeEach, describe, expect, it } from 'vitest'
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import type { EditorDiagram, EditorLink, EditorNode, ModelEditorState } from '../types'
import type { ModelData } from '@/types/entities'
import {
  clearModelEditorDraft,
  createModelEditorDraftSnapshot,
  hasModelEditorDraft,
  loadModelEditorDraft,
  restoreModelEditorDraft,
  saveModelEditorDraft,
} from './useModelEditorDraft'

const MODEL_ID = 'model-1'

const model = { id: MODEL_ID, name: 'Model', version: '1.0.0', ownerId: 'owner-1' } as ModelData

function node(overrides: Partial<EditorNode> = {}): EditorNode {
  return {
    id: 'n-1',
    name: 'Node',
    modelId: MODEL_ID,
    ownerId: 'owner-1',
    nodeTypeId: 'nt-1',
    parentNodeId: null,
    parsedAttrs: parseNodeAttrs(null),
    ...overrides,
  }
}

function link(overrides: Partial<EditorLink> = {}): EditorLink {
  return {
    id: 'l-1',
    modelId: MODEL_ID,
    ownerId: 'owner-1',
    sourceId: 'n-1',
    targetId: 'n-2',
    linkTypeId: 'lt-1',
    parsedAttrs: parseLinkAttrs(null),
    ...overrides,
  }
}

function diagram(overrides: Partial<EditorDiagram> = {}): EditorDiagram {
  return {
    id: 'd-1',
    name: 'Diagram',
    version: '1.0.0',
    modelId: MODEL_ID,
    ownerId: 'owner-1',
    notationId: 'not-1',
    nodeId: null,
    parsedAttrs: parseDiagramAttrs(null),
    ...overrides,
  }
}

function state(): ModelEditorState {
  return {
    modelId: MODEL_ID,
    ownerId: 'owner-1',
    nodes: [node({ id: 'n-1', _isDirty: true })],
    links: [link({ id: 'l-1', _isNew: true })],
    diagrams: [
      diagram({
        id: 'd-1',
        _isDirty: true,
        parsedAttrs: parseDiagramAttrs(
          JSON.stringify({
            instances: {
              nodes: [{ id: 'i-1', modelNodeId: 'n-1', x: 0, y: 0 }],
              edges: [],
            },
          })
        ),
      }),
    ],
    notations: [],
    nodeTypes: [],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
  }
}

describe('useModelEditorDraft', () => {
  beforeEach(() => {
    clearModelEditorDraft(MODEL_ID)
    localStorage.clear()
  })

  it('round-trips a snapshot for the same model', () => {
    const snapshot = createModelEditorDraftSnapshot(state(), model)
    saveModelEditorDraft(MODEL_ID, snapshot)

    expect(hasModelEditorDraft(MODEL_ID)).toBe(true)
    const loaded = loadModelEditorDraft(MODEL_ID)
    expect(loaded).not.toBeNull()
    expect(loaded!.model.id).toBe(MODEL_ID)
    expect(loaded!.nodes).toHaveLength(1)
    expect(loaded!.nodes[0]!._isDirty).toBe(true)
    expect(loaded!.diagrams[0]!.parsedAttrs.instances.nodes).toHaveLength(1)
  })

  it('is not readable for a different model id', () => {
    saveModelEditorDraft(MODEL_ID, createModelEditorDraftSnapshot(state(), model))
    expect(loadModelEditorDraft('other-model')).toBeNull()
  })

  it('clears the draft', () => {
    saveModelEditorDraft(MODEL_ID, createModelEditorDraftSnapshot(state(), model))
    clearModelEditorDraft(MODEL_ID)
    expect(hasModelEditorDraft(MODEL_ID)).toBe(false)
    expect(loadModelEditorDraft(MODEL_ID)).toBeNull()
  })

  it('restores editor entities preserving flags and parsedAttrs', () => {
    const snapshot = createModelEditorDraftSnapshot(state(), model)
    const restored = restoreModelEditorDraft(snapshot!)

    expect(restored.nodes).toHaveLength(1)
    expect(restored.nodes[0]!._isDirty).toBe(true)
    expect(restored.links[0]!._isNew).toBe(true)
    expect(restored.diagrams[0]!._isDirty).toBe(true)
    expect(restored.diagrams[0]!.parsedAttrs.instances.nodes[0]).toMatchObject({
      id: 'i-1',
      modelNodeId: 'n-1',
    })
  })
})
