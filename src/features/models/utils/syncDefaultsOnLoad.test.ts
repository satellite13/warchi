import { describe, expect, it } from 'vitest'
import { createEmptyModelEditorState, type EditorLink, type EditorNode } from '../types'
import { syncDefaultsOnLoadChunked } from './syncDefaultsOnLoad'

function makeNode(partial: Partial<EditorNode> & Pick<EditorNode, 'id'>): EditorNode {
  return {
    id: partial.id,
    name: partial.name ?? 'Node',
    modelId: partial.modelId ?? 'model-1',
    ownerId: partial.ownerId ?? 'owner-1',
    nodeTypeId: partial.nodeTypeId ?? 'nt-1',
    parentNodeId: partial.parentNodeId ?? null,
    parsedAttrs: partial.parsedAttrs ?? {
      treeOrder: 0,
      typeProperties: {},
      notationComponents: {},
      componentProperties: {},
    },
    _isDirty: partial._isDirty,
    _isDeleted: partial._isDeleted,
  }
}

function makeLink(partial: Partial<EditorLink> & Pick<EditorLink, 'id'>): EditorLink {
  return {
    id: partial.id,
    sourceId: partial.sourceId ?? 'n1',
    targetId: partial.targetId ?? 'n2',
    modelId: partial.modelId ?? 'model-1',
    ownerId: partial.ownerId ?? 'owner-1',
    linkTypeId: partial.linkTypeId ?? 'lt-1',
    parsedAttrs: partial.parsedAttrs ?? {
      notationRelations: {},
      relationProperties: {},
      typeProperties: {},
    },
    _isDirty: partial._isDirty,
    _isDeleted: partial._isDeleted,
  }
}

describe('syncDefaultsOnLoadChunked', () => {
  it('fills missing component/relation defaults without marking dirty', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.components = [
      {
        id: 'comp-1',
        name: 'C',
        version: '1.0.0',
        notationId: 'not-1',
        ownerId: 'owner-1',
        nodeTypeId: 'nt-1',
        attrs: JSON.stringify({
          customProperties: [
            { id: 'p1', name: 'status', type: 'string', required: false, defaultValue: 'draft' },
          ],
        }),
      },
    ]
    state.relations = [
      {
        id: 'rel-1',
        name: 'R',
        version: '1.0.0',
        notationId: 'not-1',
        ownerId: 'owner-1',
        linkTypeId: 'lt-1',
        attrs: JSON.stringify({
          customProperties: [
            { id: 'p2', name: 'weight', type: 'number', required: false, defaultValue: 1 },
          ],
        }),
      },
    ]
    state.nodes = [
      makeNode({
        id: 'n1',
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          notationComponents: { 'not-1': { componentId: 'comp-1' } },
          componentProperties: {},
        },
      }),
    ]
    state.links = [
      makeLink({
        id: 'l1',
        parsedAttrs: {
          notationRelations: { 'not-1': { relationId: 'rel-1' } },
          relationProperties: {},
          typeProperties: {},
        },
      }),
    ]

    await syncDefaultsOnLoadChunked(state)

    expect(state.nodes[0]?.parsedAttrs.componentProperties['not-1']?.['comp-1']).toEqual({
      status: 'draft',
    })
    expect(state.links[0]?.parsedAttrs.relationProperties['not-1']?.['rel-1']).toEqual({
      weight: 1,
    })
    expect(state.nodes[0]?._isDirty).toBeUndefined()
    expect(state.links[0]?._isDirty).toBeUndefined()
  })

  it('does not overwrite existing property values', async () => {
    const state = createEmptyModelEditorState()
    state.components = [
      {
        id: 'comp-1',
        name: 'C',
        version: '1.0.0',
        notationId: 'not-1',
        ownerId: 'owner-1',
        nodeTypeId: 'nt-1',
        attrs: JSON.stringify({
          customProperties: [
            { id: 'p1', name: 'status', type: 'string', required: false, defaultValue: 'draft' },
          ],
        }),
      },
    ]
    state.nodes = [
      makeNode({
        id: 'n1',
        parsedAttrs: {
          treeOrder: 0,
          typeProperties: {},
          notationComponents: { 'not-1': { componentId: 'comp-1' } },
          componentProperties: { 'not-1': { 'comp-1': { status: 'done' } } },
        },
      }),
    ]

    await syncDefaultsOnLoadChunked(state)

    expect(state.nodes[0]?.parsedAttrs.componentProperties['not-1']?.['comp-1']).toEqual({
      status: 'done',
    })
  })

  it('fills missing link-type typeProperties defaults without marking dirty', async () => {
    const state = createEmptyModelEditorState()
    state.linkTypes = [
      {
        id: 'lt-1',
        name: 'Serving',
        ownerId: 'owner-1',
        attrs: JSON.stringify({
          customProperties: [
            { id: 'p1', name: 'code', type: 'string', required: false, defaultValue: 'L1' },
          ],
        }),
      },
    ]
    state.links = [
      makeLink({
        id: 'l1',
        parsedAttrs: {
          notationRelations: {},
          relationProperties: {},
          typeProperties: {},
        },
      }),
    ]

    await syncDefaultsOnLoadChunked(state)

    expect(state.links[0]?.parsedAttrs.typeProperties).toEqual({ code: 'L1' })
    expect(state.links[0]?._isDirty).toBeUndefined()
  })
})
