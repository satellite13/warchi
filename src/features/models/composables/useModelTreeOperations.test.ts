import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { parseNodeAttrs } from '../modelAttrs'
import { createEmptyModelEditorState, type EditorNode, type TreeParentScope } from '../types'
import { useModelTreeOperations } from './useModelTreeOperations'

const makeNode = (
  id: string,
  parentNodeId: string | null,
  nodeTypeId = 'regular',
  treeOrder = 0
): EditorNode => ({
  id,
  name: id,
  modelId: 'model-1',
  ownerId: 'owner-1',
  nodeTypeId,
  parentNodeId,
  parsedAttrs: { ...parseNodeAttrs(null), treeOrder },
})

function setup(completeScopeKeys: string[]) {
  const state = ref(createEmptyModelEditorState())
  state.value.modelId = 'model-1'
  state.value.ownerId = 'owner-1'
  state.value.nodeTypes = [
    { id: 'directory', name: 'Directory', ownerId: 'owner-1' },
    { id: 'regular', name: 'Application', ownerId: 'owner-1' },
  ]
  const complete = new Set(completeScopeKeys)
  const setUiError = vi.fn()
  const reconcileMaterializedRows = vi.fn()
  const operations = useModelTreeOperations({
    state,
    model: ref({ attrs: JSON.stringify({ treeRootNodeId: 'hidden-root' }) }),
    selectedDiagramId: ref(null),
    t: key => key,
    setUiError,
    clearUiError: vi.fn(),
    markNodeDirty: vi.fn(),
    markDiagramDirty: vi.fn(),
    isChildrenScopeComplete: (scope: TreeParentScope) =>
      complete.has(scope.kind === 'root' ? 'root' : `node:${scope.nodeId}`),
    reconcileMaterializedRows,
  })
  return { state, operations, setUiError, reconcileMaterializedRows }
}

describe('useModelTreeOperations partial scope safety', () => {
  it('blocks create for an incomplete explicit root scope', () => {
    const { operations, setUiError } = setup([])

    operations.openCreateRegularNode(null)

    expect(operations.showCreateNodeModal.value).toBe(false)
    expect(operations.getNextTreeOrderForParent('hidden-root')).toBeNull()
    expect(setUiError).toHaveBeenCalledWith('models.treeScopeIncompleteMutation')
  })

  it('blocks create for an incomplete child scope', () => {
    const { state, operations, setUiError } = setup(['root'])
    state.value.nodes = [makeNode('folder-a', 'hidden-root', 'directory')]

    operations.openCreateFolder('folder-a')

    expect(operations.showCreateNodeModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.treeScopeIncompleteMutation')
  })

  it('allows first child creation when persisted folder authoritatively has no children', () => {
    const { state, operations, setUiError } = setup(['root'])
    state.value.nodes = [
      {
        ...makeNode('empty-folder', 'hidden-root', 'directory'),
        hasChildren: false,
      },
    ]

    operations.openCreateRegularNode('empty-folder')

    expect(operations.showCreateNodeModal.value).toBe(true)
    expect(setUiError).not.toHaveBeenCalledWith('models.treeScopeIncompleteMutation')
    operations.newNodeName.value = 'First child'
    operations.createNode()
    expect(state.value.nodes.find(node => node.id === 'empty-folder')?.hasChildren).toBe(true)
  })

  it('blocks move when either source or destination sibling scope is incomplete', () => {
    const { state, operations, setUiError } = setup(['node:source-parent'])
    state.value.nodes = [
      makeNode('moving', 'source-parent', 'regular', 0),
      makeNode('target-parent', 'hidden-root', 'directory', 0),
    ]

    operations.handleMoveNode('moving', 'target-parent', 'inside')

    expect(state.value.nodes.find(node => node.id === 'moving')?.parentNodeId).toBe('source-parent')
    expect(setUiError).toHaveBeenCalledWith('models.treeScopeIncompleteMutation')
  })

  it('blocks reorder inside an incomplete sibling scope', () => {
    const { state, operations, setUiError } = setup([])
    state.value.nodes = [
      makeNode('first', 'parent-a', 'regular', 0),
      makeNode('second', 'parent-a', 'regular', 1),
    ]

    operations.handleMoveNode('second', 'first', 'above')

    expect(state.value.nodes.map(node => node.id)).toEqual(['first', 'second'])
    expect(state.value.nodes.map(node => node.parsedAttrs.treeOrder)).toEqual([0, 1])
    expect(setUiError).toHaveBeenCalledWith('models.treeScopeIncompleteMutation')
  })

  it('reconciles the store after a permitted create mutation', () => {
    const { state, operations, reconcileMaterializedRows } = setup(['root'])
    operations.openCreateRegularNode(null)
    operations.newNodeName.value = 'Created'

    operations.createNode()

    expect(state.value.nodes).toHaveLength(1)
    expect(state.value.nodes[0]?.parentNodeId).toBe('hidden-root')
    expect(reconcileMaterializedRows).toHaveBeenCalledWith([{ kind: 'root' }])
  })

  it('reconciles the store after a permitted move mutation', () => {
    const { state, operations, reconcileMaterializedRows } = setup([
      'node:source-parent',
      'node:target-parent',
    ])
    state.value.nodes = [
      makeNode('moving', 'source-parent'),
      makeNode('target-parent', 'hidden-root', 'directory'),
      makeNode('unloaded-sibling', 'incomplete-parent', 'regular', 10),
    ]

    operations.handleMoveNode('moving', 'target-parent', 'inside')

    expect(state.value.nodes.find(node => node.id === 'moving')?.parentNodeId).toBe('target-parent')
    expect(
      state.value.nodes.find(node => node.id === 'unloaded-sibling')?.parsedAttrs.treeOrder
    ).toBe(10)
    expect(reconcileMaterializedRows).toHaveBeenCalledWith([
      { kind: 'node', nodeId: 'source-parent' },
      { kind: 'node', nodeId: 'target-parent' },
    ])
  })
})
