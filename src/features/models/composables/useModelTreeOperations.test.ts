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

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function setup(
  completeScopeKeys: string[],
  ensureChildrenScopeComplete = vi.fn(async (_scope: TreeParentScope) => {})
) {
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
  const markNodeDirty = vi.fn()
  const operations = useModelTreeOperations({
    state,
    model: ref({ attrs: JSON.stringify({ treeRootNodeId: 'hidden-root' }) }),
    selectedDiagramId: ref(null),
    t: key => key,
    setUiError,
    clearUiError: vi.fn(),
    markNodeDirty,
    markDiagramDirty: vi.fn(),
    isChildrenScopeComplete: (scope: TreeParentScope) =>
      complete.has(scope.kind === 'root' ? 'root' : `node:${scope.nodeId}`),
    ensureChildrenScopeComplete,
    reconcileMaterializedRows,
  })
  return {
    state,
    operations,
    setUiError,
    markNodeDirty,
    reconcileMaterializedRows,
    ensureChildrenScopeComplete,
    complete,
  }
}

describe('useModelTreeOperations partial scope safety', () => {
  it('ensures the explicit root scope before creating a node', async () => {
    const ensureChildrenScopeComplete = vi.fn(async (_scope: TreeParentScope) => {
      complete.add('root')
    })
    const { state, operations, setUiError, complete } = setup([], ensureChildrenScopeComplete)

    operations.openCreateRegularNode(null)
    operations.newNodeName.value = 'Created'
    await operations.createNode()

    expect(ensureChildrenScopeComplete).toHaveBeenCalledWith({ kind: 'root' })
    expect(state.value.nodes).toHaveLength(1)
    expect(state.value.nodes[0]?.parentNodeId).toBe('hidden-root')
    expect(setUiError).not.toHaveBeenCalled()
  })

  it('does not create when sibling loading fails', async () => {
    const ensureChildrenScopeComplete = vi.fn(async () => {
      throw new Error('load failed')
    })
    const { state, operations, setUiError } = setup(['root'], ensureChildrenScopeComplete)
    state.value.nodes = [makeNode('folder-a', 'hidden-root', 'directory')]

    operations.openCreateFolder('folder-a')
    operations.newNodeName.value = 'Nested'
    await operations.createNode()

    expect(state.value.nodes.map(node => node.id)).toEqual(['folder-a'])
    expect(setUiError).toHaveBeenCalledWith('models.treeScopeIncompleteMutation')
  })

  it('allows first child creation without loading when persisted folder has no children', async () => {
    const ensureChildrenScopeComplete = vi.fn(async () => {})
    const { state, operations, setUiError } = setup(['root'], ensureChildrenScopeComplete)
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
    await operations.createNode()
    expect(state.value.nodes.find(node => node.id === 'empty-folder')?.hasChildren).toBe(true)
    expect(ensureChildrenScopeComplete).not.toHaveBeenCalled()
  })

  it('creates only one node while sibling scope loading is pending', async () => {
    const pendingScope = deferred()
    const ensureChildrenScopeComplete = vi.fn(async () => {
      await pendingScope.promise
      complete.add('root')
    })
    const { state, operations, complete } = setup([], ensureChildrenScopeComplete)
    operations.openCreateRegularNode(null)
    operations.newNodeName.value = 'Created once'

    const firstCreate = operations.createNode()
    const duplicateCreate = operations.createNode()

    expect(operations.createNodePending.value).toBe(true)
    expect(ensureChildrenScopeComplete).toHaveBeenCalledTimes(1)
    pendingScope.resolve()
    await Promise.all([firstCreate, duplicateCreate])

    expect(state.value.nodes.map(node => node.name)).toEqual(['Created once'])
    expect(operations.createNodePending.value).toBe(false)
  })

  it('does not move when either source or destination sibling loading fails', async () => {
    const ensureChildrenScopeComplete = vi.fn(async (scope: TreeParentScope) => {
      if (scope.kind === 'node' && scope.nodeId === 'target-parent') throw new Error('load failed')
    })
    const { state, operations, setUiError } = setup(
      ['node:source-parent'],
      ensureChildrenScopeComplete
    )
    state.value.nodes = [
      makeNode('moving', 'source-parent', 'regular', 0),
      makeNode('target-parent', 'hidden-root', 'directory', 0),
    ]

    await operations.handleMoveNode('moving', 'target-parent', 'inside')

    expect(state.value.nodes.find(node => node.id === 'moving')?.parentNodeId).toBe('source-parent')
    expect(ensureChildrenScopeComplete).toHaveBeenCalledWith({
      kind: 'node',
      nodeId: 'target-parent',
    })
    expect(setUiError).toHaveBeenCalledWith('models.treeScopeIncompleteMutation')
  })

  it('does not dirty or reorder local siblings when destination loading is cancelled', async () => {
    const { state, operations, markNodeDirty } = setup(
      ['node:source-parent'],
      vi.fn(async () => {})
    )
    state.value.nodes = [
      makeNode('moving', 'source-parent', 'regular', 4),
      makeNode('source-sibling', 'source-parent', 'regular', 9),
      makeNode('target-parent', 'hidden-root', 'directory', 0),
      makeNode('target-sibling', 'target-parent', 'regular', 7),
    ]
    const before = state.value.nodes.map(node => ({
      id: node.id,
      parentNodeId: node.parentNodeId,
      treeOrder: node.parsedAttrs.treeOrder,
    }))

    await operations.handleMoveNode('moving', 'target-parent', 'inside')

    expect(
      state.value.nodes.map(node => ({
        id: node.id,
        parentNodeId: node.parentNodeId,
        treeOrder: node.parsedAttrs.treeOrder,
      }))
    ).toEqual(before)
    expect(markNodeDirty).not.toHaveBeenCalled()
  })

  it('ignores a stale overlapping move and indexes only the winning scopes', async () => {
    const firstTargetLoad = deferred()
    const ensureChildrenScopeComplete = vi.fn(async (scope: TreeParentScope) => {
      if (scope.kind === 'node' && scope.nodeId === 'target-a') {
        await firstTargetLoad.promise
        complete.add('node:target-a')
      }
      if (scope.kind === 'node' && scope.nodeId === 'target-b') {
        complete.add('node:target-b')
      }
    })
    const { state, operations, reconcileMaterializedRows, complete } = setup(
      ['node:source-parent'],
      ensureChildrenScopeComplete
    )
    state.value.nodes = [
      makeNode('moving', 'source-parent', 'regular', 0),
      makeNode('source-sibling', 'source-parent', 'regular', 1),
      makeNode('target-a', 'hidden-root', 'directory', 0),
      makeNode('target-b', 'hidden-root', 'directory', 1),
    ]

    const staleMove = operations.handleMoveNode('moving', 'target-a', 'inside')
    const winningMove = operations.handleMoveNode('moving', 'target-b', 'inside')
    await winningMove
    firstTargetLoad.resolve()
    await staleMove

    expect(state.value.nodes.find(node => node.id === 'moving')?.parentNodeId).toBe('target-b')
    expect(reconcileMaterializedRows).toHaveBeenCalledTimes(1)
    expect(reconcileMaterializedRows).toHaveBeenCalledWith([
      { kind: 'node', nodeId: 'source-parent' },
      { kind: 'node', nodeId: 'target-b' },
    ])
  })

  it('ensures one sibling scope once before reordering inside it', async () => {
    const ensureChildrenScopeComplete = vi.fn(async (_scope: TreeParentScope) => {
      complete.add('node:parent-a')
    })
    const { state, operations, complete } = setup([], ensureChildrenScopeComplete)
    state.value.nodes = [
      makeNode('first', 'parent-a', 'regular', 0),
      makeNode('second', 'parent-a', 'regular', 1),
    ]

    await operations.handleMoveNode('second', 'first', 'above')

    expect(ensureChildrenScopeComplete).toHaveBeenCalledTimes(1)
    expect(ensureChildrenScopeComplete).toHaveBeenCalledWith({ kind: 'node', nodeId: 'parent-a' })
    expect(state.value.nodes.map(node => node.id)).toEqual(['second', 'first'])
    expect(state.value.nodes.map(node => node.parsedAttrs.treeOrder)).toEqual([0, 1])
  })

  it('reconciles the store after a permitted create mutation', async () => {
    const { state, operations, reconcileMaterializedRows } = setup(['root'])
    operations.openCreateRegularNode(null)
    operations.newNodeName.value = 'Created'

    await operations.createNode()

    expect(state.value.nodes).toHaveLength(1)
    expect(state.value.nodes[0]?.parentNodeId).toBe('hidden-root')
    expect(reconcileMaterializedRows).toHaveBeenCalledWith([{ kind: 'root' }])
  })

  it('reconciles the store after a permitted move mutation', async () => {
    const { state, operations, reconcileMaterializedRows } = setup([
      'node:source-parent',
      'node:target-parent',
    ])
    state.value.nodes = [
      makeNode('moving', 'source-parent'),
      makeNode('target-parent', 'hidden-root', 'directory'),
      makeNode('unloaded-sibling', 'incomplete-parent', 'regular', 10),
    ]

    await operations.handleMoveNode('moving', 'target-parent', 'inside')

    expect(state.value.nodes.find(node => node.id === 'moving')?.parentNodeId).toBe('target-parent')
    expect(
      state.value.nodes.find(node => node.id === 'unloaded-sibling')?.parsedAttrs.treeOrder
    ).toBe(10)
    expect(reconcileMaterializedRows).toHaveBeenCalledWith([
      { kind: 'node', nodeId: 'source-parent' },
      { kind: 'node', nodeId: 'target-parent' },
    ])
  })

  it('reindexes configured root siblings without touching another parent', async () => {
    const { state, operations, markNodeDirty } = setup(['root'])
    state.value.nodes = [
      makeNode('root-first', 'hidden-root', 'regular', 3),
      makeNode('other-child', 'other-parent', 'regular', 12),
      makeNode('root-second', 'hidden-root', 'regular', 8),
    ]

    await operations.handleMoveNode('root-second', 'root-first', 'above')

    expect(
      state.value.nodes
        .filter(node => node.parentNodeId === 'hidden-root')
        .map(node => [node.id, node.parsedAttrs.treeOrder])
    ).toEqual([
      ['root-second', 0],
      ['root-first', 1],
    ])
    expect(state.value.nodes.find(node => node.id === 'other-child')?.parsedAttrs.treeOrder).toBe(12)
    expect(markNodeDirty).not.toHaveBeenCalledWith('other-child')
  })

  it('ensures existing directory scopes before creating a missing path segment', async () => {
    const ensureChildrenScopeComplete = vi.fn(async (scope: TreeParentScope) => {
      if (scope.kind === 'root') complete.add('root')
      else complete.add(`node:${scope.nodeId}`)
    })
    const { state, operations, complete } = setup([], ensureChildrenScopeComplete)
    state.value.nodes = [makeNode('existing', 'hidden-root', 'directory')]
    state.value.nodes[0]!.name = 'Existing'

    const result = await operations.ensureDirectoryPath('Existing/New')

    expect(ensureChildrenScopeComplete.mock.calls.map(([scope]) => scope)).toEqual([
      { kind: 'root' },
      { kind: 'node', nodeId: 'existing' },
    ])
    expect(result.createdDirectoryIds).toHaveLength(1)
    expect(state.value.nodes.find(node => node.name === 'New')?.parentNodeId).toBe('existing')
  })

  it('leaves the directory path unchanged when a required scope fails to load', async () => {
    const ensureChildrenScopeComplete = vi.fn(async (scope: TreeParentScope) => {
      if (scope.kind === 'root') complete.add('root')
      else throw new Error('load failed')
    })
    const { state, operations, setUiError, complete } = setup([], ensureChildrenScopeComplete)
    state.value.nodes = [makeNode('existing', 'hidden-root', 'directory')]
    state.value.nodes[0]!.name = 'Existing'

    const result = await operations.ensureDirectoryPath('Existing/New')

    expect(result).toEqual({ parentNodeId: null, createdDirectoryIds: [] })
    expect(state.value.nodes.map(node => node.id)).toEqual(['existing'])
    expect(setUiError).toHaveBeenCalledWith('models.treeScopeIncompleteMutation')
  })

  it('ensures the final existing directory before returning it as a create parent', async () => {
    const ensureChildrenScopeComplete = vi.fn(async (scope: TreeParentScope) => {
      if (scope.kind === 'root') complete.add('root')
      else complete.add(`node:${scope.nodeId}`)
    })
    const { state, operations, complete } = setup([], ensureChildrenScopeComplete)
    state.value.nodes = [makeNode('existing', 'hidden-root', 'directory')]
    state.value.nodes[0]!.name = 'Existing'

    await operations.ensureDirectoryPath('Existing')

    expect(ensureChildrenScopeComplete).toHaveBeenLastCalledWith({
      kind: 'node',
      nodeId: 'existing',
    })
  })
})
