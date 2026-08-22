import { isReactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { toEditorDiagram, toEditorLink, toEditorNode } from './modelEditorMappers'

describe('model editor mappers', () => {
  it('keeps high-volume nodes and attrs outside deep Vue reactivity', () => {
    const node = toEditorNode({
      id: 'node-1',
      name: 'Node',
      modelId: 'model-1',
      ownerId: 'owner-1',
      nodeTypeId: 'type-1',
      parentNodeId: null,
      attrs: null,
    })

    expect(isReactive(node)).toBe(false)
    expect(isReactive(node.parsedAttrs)).toBe(false)
  })

  it('keeps high-volume links and attrs outside deep Vue reactivity', () => {
    const link = toEditorLink({
      id: 'link-1',
      modelId: 'model-1',
      ownerId: 'owner-1',
      linkTypeId: 'type-1',
      sourceId: 'node-1',
      targetId: 'node-2',
      attrs: null,
    })

    expect(isReactive(link)).toBe(false)
    expect(isReactive(link.parsedAttrs)).toBe(false)
  })

  it('maps rows without treating Array.map indexes as defaults catalogs', () => {
    const rows = [
      {
        id: 'node-1',
        name: 'First',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: null,
        attrs: null,
      },
      {
        id: 'node-2',
        name: 'Second',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: null,
        attrs: null,
      },
    ]

    expect(rows.map(toEditorNode).map(row => row.id)).toEqual(['node-1', 'node-2'])
  })

  it('keeps diagrams reactive for canvas deep watchers', () => {
    const diagram = toEditorDiagram({
      id: 'diagram-1',
      name: 'Diagram',
      version: '1.0.0',
      notationId: 'notation-1',
      modelId: 'model-1',
      ownerId: 'owner-1',
      nodeId: null,
      attrs: null,
    })

    expect(isReactive(diagram)).toBe(true)
    expect(isReactive(diagram.parsedAttrs)).toBe(true)
  })
})
