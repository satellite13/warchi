import { describe, expect, it } from 'vitest'
import { canvasModelNodeIds, orphanedUntypedNodeIds } from './orphanedDiagramOnlyNodes'

describe('orphanedUntypedNodeIds', () => {
  it('returns untyped nodes that lived only on the deleted diagram', () => {
    expect(
      orphanedUntypedNodeIds({
        deletedCanvasNodeIds: ['note-1', 'actor-1'],
        remainingCanvasNodeIds: ['actor-1'],
        untypedNodeTypeIds: new Set(['untyped']),
        nodes: [
          { id: 'note-1', nodeTypeId: 'untyped' },
          { id: 'actor-1', nodeTypeId: 'actor' },
          { id: 'folder-1', nodeTypeId: 'dir' },
        ],
      }),
    ).toEqual(['note-1'])
  })

  it('keeps an untyped node still placed on another diagram', () => {
    expect(
      orphanedUntypedNodeIds({
        deletedCanvasNodeIds: ['note-1'],
        remainingCanvasNodeIds: ['note-1'],
        untypedNodeTypeIds: new Set(['untyped']),
        nodes: [{ id: 'note-1', nodeTypeId: 'untyped' }],
      }),
    ).toEqual([])
  })
})

describe('canvasModelNodeIds', () => {
  it('collects modelNodeId values', () => {
    expect(
      canvasModelNodeIds({
        nodes: [{ modelNodeId: 'a' }, { modelNodeId: '' }, {}],
      }),
    ).toEqual(['a'])
  })
})
