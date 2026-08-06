import { describe, expect, it } from 'vitest'
import { createEmptyModelEditorState } from '../types'
import {
  applyDiagramGarbageSanitizeToState,
  sanitizeDiagramInstancesForModel,
} from './sanitizeDiagramInstances'

const emptyParsed = {
  treeOrder: 0,
  typeProperties: {},
  componentProperties: {},
  notationComponents: {},
}

describe('sanitizeDiagramInstancesForModel', () => {
  it('keeps instances when model node is absent from state (e.g. still loading)', () => {
    const attrs = {
      instances: {
        nodes: [
          { id: 'i1', modelNodeId: 'n1', x: 0, y: 0, width: 1, height: 1 },
          { id: 'i2', modelNodeId: 'ghost', x: 0, y: 0, width: 1, height: 1 },
        ],
        edges: [],
      },
    }
    const nodes = [
      {
        id: 'n1',
        name: 'A',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: emptyParsed,
      },
    ]
    const { nextAttrs, changed, removedNodes } = sanitizeDiagramInstancesForModel(attrs, nodes, [])
    expect(changed).toBe(false)
    expect(removedNodes).toBe(0)
    expect(nextAttrs.instances.nodes).toHaveLength(2)
  })

  it('removes instances whose model node is explicitly deleted', () => {
    const attrs = {
      instances: {
        nodes: [
          { id: 'i1', modelNodeId: 'n1', x: 0, y: 0, width: 1, height: 1 },
          { id: 'i2', modelNodeId: 'n2', x: 0, y: 0, width: 1, height: 1 },
        ],
        edges: [],
      },
    }
    const nodes = [
      {
        id: 'n1',
        name: 'A',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: emptyParsed,
      },
      {
        id: 'n2',
        name: 'B',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: emptyParsed,
        _isDeleted: true,
      },
    ]
    const { nextAttrs, changed, removedNodes } = sanitizeDiagramInstancesForModel(attrs, nodes, [])
    expect(changed).toBe(true)
    expect(removedNodes).toBe(1)
    expect(nextAttrs.instances.nodes).toHaveLength(1)
    expect(nextAttrs.instances.nodes[0]?.modelNodeId).toBe('n1')
  })

  it('keeps sticky note instances without a model node', () => {
    const attrs = {
      instances: {
        nodes: [
          {
            id: 'in',
            modelNodeId: '__diagram-note__:x',
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            attrs: { isNote: true },
          },
        ],
        edges: [],
      },
    }
    const { changed, removedNodes } = sanitizeDiagramInstancesForModel(attrs, [], [])
    expect(changed).toBe(false)
    expect(removedNodes).toBe(0)
  })

  it('keeps container and edge-anchor diagram-only instances', () => {
    const attrs = {
      instances: {
        nodes: [
          {
            id: 'ic',
            modelNodeId: '__diagram-container__:c',
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            attrs: { isContainer: true },
          },
          {
            id: 'ia',
            modelNodeId: '__diagram-edge-anchor__:a',
            x: 1,
            y: 1,
            width: 8,
            height: 8,
            attrs: { isEdgeAnchor: true, hostEdgeInstanceId: 'e1' },
          },
        ],
        edges: [],
      },
    }
    const { changed, removedNodes } = sanitizeDiagramInstancesForModel(attrs, [], [])
    expect(changed).toBe(false)
    expect(removedNodes).toBe(0)
  })

  it('keeps edges with missing link id and removes only explicitly deleted links', () => {
    const attrs = {
      instances: {
        nodes: [
          { id: 'i1', modelNodeId: 'n1', x: 0, y: 0, width: 1, height: 1 },
          { id: 'i2', modelNodeId: 'n2', x: 1, y: 0, width: 1, height: 1 },
        ],
        edges: [
          { id: 'e1', modelLinkId: 'L-gone', sourceInstanceId: 'i1', targetInstanceId: 'i2' },
          { id: 'e2', modelLinkId: 'L-del', sourceInstanceId: 'i1', targetInstanceId: 'i2' },
        ],
      },
    }
    const nodes = [
      {
        id: 'n1',
        name: 'A',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: emptyParsed,
      },
      {
        id: 'n2',
        name: 'B',
        modelId: 'm',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: emptyParsed,
      },
    ]
    const links = [
      {
        id: 'L-del',
        sourceId: 'n1',
        targetId: 'n2',
        modelId: 'm',
        ownerId: 'o',
        linkTypeId: 'lt',
        parsedAttrs: { notationRelations: {}, relationProperties: {}, typeProperties: {} },
        _isDeleted: true,
      },
    ]
    const { changed, removedEdges, nextAttrs } = sanitizeDiagramInstancesForModel(attrs, nodes, links)
    expect(changed).toBe(true)
    expect(removedEdges).toBe(1)
    expect(nextAttrs.instances.edges).toHaveLength(1)
    expect(nextAttrs.instances.edges[0]?.modelLinkId).toBe('L-gone')
  })

  it('applyDiagramGarbageSanitizeToState marks persisted diagram dirty when it changed', () => {
    const st = createEmptyModelEditorState()
    st.nodes.push({
      id: 'n1',
      name: 'A',
      modelId: 'm',
      ownerId: 'o',
      nodeTypeId: 't',
      parentNodeId: null,
      parsedAttrs: emptyParsed,
      _isDeleted: true,
    })
    st.diagrams.push({
      id: 'd1',
      name: 'D',
      version: '1.0.0',
      ownerId: 'o',
      modelId: 'm',
      notationId: 'n1',
      nodeId: null,
      parsedAttrs: {
        instances: {
          nodes: [{ id: 'i1', modelNodeId: 'n1', x: 0, y: 0, width: 1, height: 1 }],
          edges: [],
        },
      },
    })
    applyDiagramGarbageSanitizeToState(st)
    const d = st.diagrams[0]
    expect(d?.parsedAttrs.instances.nodes).toHaveLength(0)
    expect(d?._isDirty).toBe(true)
  })
})
