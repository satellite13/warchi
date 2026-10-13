import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { parseNodeAttrs } from '../modelAttrs'
import { createEmptyModelEditorState, type EditorNode, type TreeParentScope } from '../types'
import { useModelTreeOperations } from './useModelTreeOperations'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

const grantsState = vi.hoisted(() => ({ keys: null as Set<string> | null }))

vi.mock('@/composables/useFeatureGrants', () => ({
  useFeatureGrants: () => ({
    hasGrant: (key: string) => !grantsState.keys || grantsState.keys.has(key),
  }),
}))

const authState = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }))

vi.mock('@/composables/useAuth', async () => {
  const { computed } = await import('vue')
  return {
    useAuth: () => ({
      currentUser: computed(() => authState.user),
      isAdmin: computed(() => authState.user?.role === 'admin'),
    }),
  }
})

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
  ensureChildrenScopeComplete = vi.fn(async (_scope: TreeParentScope) => {}),
  modelAttrs: Record<string, unknown> = { treeRootNodeId: 'hidden-root' }
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
    model: ref({ attrs: JSON.stringify(modelAttrs) }),
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
  it('applies catalog defaults when creating a local node', async () => {
    const { state, operations } = setup(['root'])
    state.value.nodeTypes = [
      {
        id: 'regular',
        name: 'Application',
        ownerId: 'owner-1',
        attrs: JSON.stringify({
          customProperties: [
            { id: 'p0', name: 'tier', type: 'string', required: false, defaultValue: 'app' },
          ],
        }),
      },
    ]

    operations.openCreateRegularNode(null)
    operations.newNodeName.value = 'Created'
    await operations.createNode()

    const created = state.value.nodes.find(node => node.name === 'Created')
    expect(created?.parsedAttrs.typeProperties).toEqual({ tier: 'app' })
    expect(created?._isNew).toBe(true)
    expect(created?._isDirty).toBeUndefined()
  })

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
    expect(state.value.nodes.find(node => node.id === 'other-child')?.parsedAttrs.treeOrder).toBe(
      12
    )
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

  it('warns when creating a diagram that reuses a locally deleted name and version', async () => {
    const { state, operations } = setup(['root'])
    state.value.notations = [
      { id: 'notation-1', name: 'Arch', version: '1.0.0', ownerId: 'owner-1' },
    ]
    state.value.diagrams = [
      {
        id: 'old-diagram',
        name: 'Sales Price Calculator',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        parsedAttrs: { instances: { nodes: [], edges: [] } },
        createdAt: null,
        updatedAt: null,
        _isDeleted: true,
        _isNew: false,
      },
    ]
    operations.openCreateDiagram(null)
    operations.newDiagramName.value = 'Sales Price Calculator'
    operations.newDiagramVersion.value = '1.0.0'
    operations.newDiagramNotationId.value = 'notation-1'
    await nextTick()

    await operations.createDiagram()

    expect(operations.diagramTrashConflict.value).toMatchObject({
      error: 'DIAGRAM_NAME_VERSION_IN_TRASH',
      deletedDiagramId: 'old-diagram',
      suggestedVersion: '1.1.0',
    })
    expect(state.value.diagrams.filter(d => d._isNew)).toHaveLength(0)

    operations.createDiagramWithBumpedVersion()
    const created = state.value.diagrams.find(d => d._isNew)
    expect(created?.version).toBe('1.1.0')
    expect(created?._replaceDeletedId).toBeUndefined()
  })

  it('creates a replacement diagram that permanently takes the trash key', async () => {
    const { state, operations } = setup(['root'])
    state.value.notations = [
      { id: 'notation-1', name: 'Arch', version: '1.0.0', ownerId: 'owner-1' },
    ]
    state.value.diagrams = [
      {
        id: 'old-diagram',
        name: 'Sales Price Calculator',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        parsedAttrs: { instances: { nodes: [], edges: [] } },
        createdAt: null,
        updatedAt: null,
        _isDeleted: true,
        _isNew: false,
      },
    ]
    operations.openCreateDiagram(null)
    operations.newDiagramName.value = 'Sales Price Calculator'
    operations.newDiagramVersion.value = '1.0.0'
    operations.newDiagramNotationId.value = 'notation-1'
    await nextTick()
    await operations.createDiagram()

    operations.createDiagramReplacingDeleted()
    const created = state.value.diagrams.find(d => d._isNew)
    expect(created?.version).toBe('1.0.0')
    expect(created?._replaceDeletedId).toBe('old-diagram')
    expect(state.value.diagrams.find(d => d.id === 'old-diagram')?._isDeleted).toBe(true)
  })
})

describe('locked folder guards', () => {
  const lockedNode = (
    id: string,
    parentNodeId: string | null,
    flags: Record<string, boolean>,
    nodeTypeId = 'directory'
  ): EditorNode => ({
    ...makeNode(id, parentNodeId, nodeTypeId),
    parsedAttrs: { ...parseNodeAttrs(null), typeProperties: flags },
  })

  it('refuses to open the folder create modal for a locked parent', () => {
    const { state, operations, setUiError } = setup(['root'])
    state.value.nodes = [makeNode('folder-a', 'hidden-root', 'directory')]
    state.value.nodes[0]!.parsedAttrs.typeProperties = { locked: true }

    operations.openCreateFolder('folder-a')

    expect(operations.showCreateNodeModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.folderLocked')
  })

  it('refuses to open the node create modal for a locked parent', () => {
    const { state, operations, setUiError } = setup(['root'])
    state.value.nodes = [makeNode('folder-a', 'hidden-root', 'directory')]
    state.value.nodes[0]!.parsedAttrs.typeProperties = { locked: true }

    operations.openCreateRegularNode('folder-a')

    expect(operations.showCreateNodeModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.folderLocked')
  })

  it('refuses to open the diagram create modal for a noDiagrams folder', () => {
    const { state, operations, setUiError } = setup(['root'])
    state.value.nodes = [makeNode('folder-a', 'hidden-root', 'directory')]
    state.value.nodes[0]!.parsedAttrs.typeProperties = { noDiagrams: true }

    operations.openCreateDiagram('folder-a')

    expect(operations.showCreateDiagramModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.folderNoDiagrams')
  })

  it('refuses to move a locked folder or drop into it', async () => {
    const { state, operations, markNodeDirty, setUiError } = setup(['root'])
    state.value.nodes = [
      lockedNode('locked-a', 'hidden-root', { locked: true }),
      lockedNode('locked-b', 'hidden-root', { locked: true }),
      makeNode('plain-a', 'hidden-root'),
    ]

    await operations.handleMoveNode('locked-a', 'locked-b', 'inside')
    expect(state.value.nodes.find(n => n.id === 'locked-a')?.parentNodeId).toBe('hidden-root')
    expect(markNodeDirty).not.toHaveBeenCalled()
    expect(setUiError).toHaveBeenCalledWith('models.folderLocked')

    await operations.handleMoveNode('plain-a', 'locked-b', 'inside')
    expect(state.value.nodes.find(n => n.id === 'plain-a')?.parentNodeId).toBe('hidden-root')
    expect(setUiError).toHaveBeenCalledWith('models.folderLocked')

    // Reordering around a locked folder (no parent change into it) stays allowed
    await operations.handleMoveNode('plain-a', 'locked-a', 'above')
    expect(state.value.nodes.find(n => n.id === 'plain-a')?.parentNodeId).toBe('hidden-root')
  })

  it('refuses to rename a locked folder', () => {
    const { state, operations } = setup(['root'])
    state.value.nodes = [lockedNode('locked-a', 'hidden-root', { locked: true })]

    operations.handleRenameNode('locked-a', 'renamed')

    expect(state.value.nodes.find(n => n.id === 'locked-a')?.name).toBe('locked-a')
  })

  it('refuses to move an auto-created element between folders', async () => {
    const { state, operations, markNodeDirty, setUiError } = setup(['root'])
    const autoElement: EditorNode = {
      ...makeNode('auto-el', 'folder-a'),
      parsedAttrs: {
        ...parseNodeAttrs(null),
        dpc: { kind: 'appProduct', id: '123', autoCreated: true },
      },
    }
    state.value.nodes = [
      makeNode('folder-a', 'hidden-root', 'directory'),
      makeNode('folder-b', 'hidden-root', 'directory'),
      autoElement,
    ]

    await operations.handleMoveNode('auto-el', 'folder-b', 'inside')
    expect(state.value.nodes.find(n => n.id === 'auto-el')?.parentNodeId).toBe('folder-a')
    expect(markNodeDirty).not.toHaveBeenCalled()
    expect(setUiError).toHaveBeenCalledWith('models.autoCreatedMoveForbidden')
  })
})

describe('model sync flags (attrs.sync)', () => {
  const makeDiagram = (id: string, ownerId: string, nodeId: string | null) => ({
    id,
    name: id,
    version: '1.0.0',
    ownerId,
    modelId: 'model-1',
    nodeId,
    notationId: 'notation-1',
    createdAt: null,
    updatedAt: null,
    parsedAttrs: { instances: { nodes: [], edges: [] } },
  })

  const syncAttrs = {
    treeRootNodeId: 'hidden-root',
    sync: { autoManaged: true, defaultDiagramNodeId: 'views-branch' },
  }

  const lockedNode = (
    id: string,
    parentNodeId: string | null,
    flags: Record<string, boolean>,
    nodeTypeId = 'directory'
  ): EditorNode => ({
    ...makeNode(id, parentNodeId, nodeTypeId),
    parsedAttrs: { ...parseNodeAttrs(null), typeProperties: flags },
  })

  it('defaults new diagrams to the Views branch in a sync-managed model', () => {
    const { operations } = setup(['root'], undefined, syncAttrs)

    operations.openCreateDiagram(null)

    expect(operations.createDiagramNodeId.value).toBe('views-branch')
  })

  it('refuses to open the child-node modal without the model.tree.createNode grant', () => {
    grantsState.keys = new Set(['model.tree.createRootNode'])
    const { operations } = setup(['root'])

    operations.openCreateRegularNode('folder-a')
    expect(operations.showCreateNodeModal.value).toBe(false)

    // Корневой узел остаётся под грантом createRootNode
    operations.openCreateRegularNode(null)
    expect(operations.showCreateNodeModal.value).toBe(true)

    grantsState.keys = null
  })

  it('refuses root node creation without the model.tree.createRootNode grant', () => {
    grantsState.keys = new Set(['model.tree.createNode'])
    const { operations } = setup(['root'])

    operations.openCreateRegularNode(null)
    expect(operations.showCreateNodeModal.value).toBe(false)

    grantsState.keys = null
  })

  it('refuses node creation everywhere in a sync-managed model', () => {
    const { state, operations, setUiError } = setup(
      ['root', 'node:app-folder'],
      undefined,
      syncAttrs
    )
    state.value.nodes = [
      makeNode('views-branch', 'hidden-root', 'directory'),
      makeNode('app-folder', 'hidden-root', 'directory'),
    ]

    operations.openCreateRegularNode('views-branch')
    expect(operations.showCreateNodeModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.syncNodesForbidden')

    operations.openCreateRegularNode('app-folder')
    expect(operations.showCreateNodeModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.syncNodesForbidden')

    // Папки создавать можно
    operations.openCreateFolder('app-folder')
    expect(operations.showCreateNodeModal.value).toBe(true)
  })

  it('refuses to open the diagram create modal without the model.diagram.create grant', () => {
    grantsState.keys = new Set(['model.tree.createRoot'])
    const { operations } = setup(['root'], undefined, syncAttrs)

    operations.openCreateDiagram(null)
    expect(operations.showCreateDiagramModal.value).toBe(false)

    operations.openCreateDiagram('views-branch')
    expect(operations.showCreateDiagramModal.value).toBe(false)

    grantsState.keys = null
  })

  it('lets the author move a diagram inside the Views branch only', () => {
    authState.user = { id: 'author-1', role: 'architect' }
    const { state, operations } = setup(['root'], undefined, syncAttrs)
    state.value.nodes = [
      makeNode('views-branch', 'hidden-root', 'directory'),
      makeNode('views-sub', 'views-branch', 'directory'),
      makeNode('app-folder', 'hidden-root', 'directory'),
    ]
    state.value.diagrams = [makeDiagram('dg-1', 'author-1', 'views-sub')] as never

    operations.handleMoveDiagram('dg-1', 'views-branch')
    expect(state.value.diagrams[0]?.nodeId).toBe('views-branch')

    operations.handleMoveDiagram('dg-1', 'app-folder')
    expect(state.value.diagrams[0]?.nodeId).toBe('views-branch')
  })

  it('blocks diagram moves for non-author humans in a sync-managed model', () => {
    authState.user = { id: 'other-1', role: 'architect' }
    const { state, operations } = setup(['root'], undefined, syncAttrs)
    state.value.nodes = [makeNode('views-branch', 'hidden-root', 'directory')]
    state.value.diagrams = [makeDiagram('dg-1', 'author-1', null)] as never

    operations.handleMoveDiagram('dg-1', 'views-branch')

    expect(state.value.diagrams[0]?.nodeId).toBeNull()
  })

  it('lets an admin move diagrams anywhere in a sync-managed model', () => {
    authState.user = { id: 'admin-1', role: 'admin' }
    const { state, operations } = setup(['root'], undefined, syncAttrs)
    state.value.nodes = [
      makeNode('views-branch', 'hidden-root', 'directory'),
      makeNode('app-folder', 'hidden-root', 'directory'),
    ]
    state.value.diagrams = [makeDiagram('dg-1', 'author-1', 'views-branch')] as never

    operations.handleMoveDiagram('dg-1', 'app-folder')

    expect(state.value.diagrams[0]?.nodeId).toBe('app-folder')
  })

  it('creates diagrams only inside the Views branch in a sync-managed model', () => {
    const { state, operations, setUiError } = setup(['root'], undefined, syncAttrs)
    state.value.nodes = [
      makeNode('views-branch', 'hidden-root', 'directory'),
      makeNode('app-folder', 'hidden-root', 'directory'),
    ]

    operations.openCreateDiagram('app-folder')
    expect(operations.showCreateDiagramModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.diagramViewsOnly')

    operations.openCreateDiagram('views-branch')
    expect(operations.showCreateDiagramModal.value).toBe(true)
    expect(operations.createDiagramNodeId.value).toBe('views-branch')
  })

  it('still refuses diagram moves into noDiagrams folders', () => {
    authState.user = { id: 'admin-1', role: 'admin' }
    const { state, operations } = setup(['root'], undefined, syncAttrs)
    state.value.nodes = [
      makeNode('views-branch', 'hidden-root', 'directory'),
      makeNode('app-folder', 'hidden-root', 'directory'),
    ]
    state.value.nodes[1]!.parsedAttrs.typeProperties = { noDiagrams: true }
    state.value.diagrams = [makeDiagram('dg-1', 'author-1', 'views-branch')] as never

    operations.handleMoveDiagram('dg-1', 'app-folder')

    expect(state.value.diagrams[0]?.nodeId).toBe('views-branch')
  })

  it('keeps diagram moves unrestricted in a non-sync model', () => {
    authState.user = { id: 'other-1', role: 'architect' }
    const { state, operations } = setup(['root'])
    state.value.nodes = [
      makeNode('folder-a', 'hidden-root', 'directory'),
      makeNode('folder-b', 'hidden-root', 'directory'),
    ]
    state.value.diagrams = [makeDiagram('dg-1', 'author-1', 'folder-a')] as never

    operations.handleMoveDiagram('dg-1', 'folder-b')

    expect(state.value.diagrams[0]?.nodeId).toBe('folder-b')
  })

  it('refuses root-level folder and node creation in a sync-managed model', () => {
    const { operations, setUiError } = setup(['root'], undefined, syncAttrs)

    operations.openCreateFolder(null)
    expect(operations.showCreateNodeModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.syncRootForbidden')

    operations.openCreateRegularNode(null)
    expect(operations.showCreateNodeModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.syncRootForbidden')
  })

  it('allows folder creation inside the locked Views branch but forbids nodes', () => {
    const { state, operations, setUiError } = setup(
      ['root', 'node:views-branch'],
      undefined,
      syncAttrs
    )
    state.value.nodes = [
      lockedNode('views-branch', 'hidden-root', { locked: true }),
      lockedNode('views-sub', 'views-branch', { locked: true }),
    ]

    operations.openCreateFolder('views-branch')
    expect(operations.showCreateNodeModal.value).toBe(true)
    expect(setUiError).not.toHaveBeenCalled()

    operations.openCreateFolder('views-sub')
    expect(operations.showCreateNodeModal.value).toBe(true)

    operations.openCreateRegularNode('views-branch')
    expect(operations.showCreateNodeModal.value).toBe(true) // модалка папки ещё открыта — узел не открылся
    expect(setUiError).toHaveBeenCalledWith('models.syncNodesForbidden')

    operations.openCreateRegularNode('views-sub')
    expect(setUiError).toHaveBeenCalledWith('models.syncNodesForbidden')
  })

  it('keeps locked non-views folders closed for child creation in a sync-managed model', () => {
    const { state, operations, setUiError } = setup(['root'], undefined, syncAttrs)
    state.value.nodes = [lockedNode('app-folder', 'hidden-root', { locked: true })]

    operations.openCreateFolder('app-folder')
    expect(operations.showCreateNodeModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.folderLocked')

    operations.openCreateRegularNode('app-folder')
    expect(operations.showCreateNodeModal.value).toBe(false)
    expect(setUiError).toHaveBeenCalledWith('models.folderLocked')
  })

  it('lets users move their folders into Views but not elements', async () => {
    const { state, operations, markNodeDirty, setUiError } = setup(
      ['root', 'node:views-branch'],
      undefined,
      syncAttrs
    )
    state.value.nodes = [
      lockedNode('views-branch', 'hidden-root', { locked: true }),
      makeNode('plain-a', 'hidden-root'),
      makeNode('folder-a', 'hidden-root', 'directory'),
      makeNode('element-b', 'hidden-root'),
    ]

    await operations.handleMoveNode('folder-a', 'views-branch', 'inside')
    expect(state.value.nodes.find(n => n.id === 'folder-a')?.parentNodeId).toBe('views-branch')
    expect(markNodeDirty).toHaveBeenCalled()

    await operations.handleMoveNode('element-b', 'views-branch', 'inside')
    expect(state.value.nodes.find(n => n.id === 'element-b')?.parentNodeId).toBe('hidden-root')
    expect(setUiError).toHaveBeenCalledWith('models.viewsNodesForbidden')

    // Даже через reorder «below» ребёнка Views-ветки элемент в неё не попадает
    state.value.nodes = [
      lockedNode('views-branch', 'hidden-root', { locked: true }),
      makeNode('views-child', 'views-branch'),
      makeNode('element-b', 'hidden-root'),
    ]
    await operations.handleMoveNode('element-b', 'views-child', 'below')
    expect(state.value.nodes.find(n => n.id === 'element-b')?.parentNodeId).toBe('hidden-root')
    expect(setUiError).toHaveBeenCalledWith('models.viewsNodesForbidden')
  })

  it('refuses moving nodes to the root of a sync-managed model', async () => {
    const { state, operations, markNodeDirty, setUiError } = setup(
      ['root', 'node:views-branch'],
      undefined,
      syncAttrs
    )
    state.value.nodes = [
      makeNode('views-branch', 'hidden-root', 'directory'),
      makeNode('folder-a', 'views-branch', 'directory'),
      makeNode('element-b', 'views-branch'),
    ]

    await operations.handleMoveNode('folder-a', null, 'inside')
    expect(state.value.nodes.find(n => n.id === 'folder-a')?.parentNodeId).toBe('views-branch')

    await operations.handleMoveNode('element-b', null, 'inside')
    expect(state.value.nodes.find(n => n.id === 'element-b')?.parentNodeId).toBe('views-branch')
    expect(markNodeDirty).not.toHaveBeenCalled()
    expect(setUiError).toHaveBeenCalledWith('models.syncRootForbidden')
  })

  it('still refuses dropping into locked non-views folders in a sync-managed model', async () => {
    const { state, operations, setUiError } = setup(['root'], undefined, syncAttrs)
    state.value.nodes = [
      makeNode('views-branch', 'hidden-root', 'directory'),
      lockedNode('app-folder', 'hidden-root', { locked: true }),
      makeNode('folder-a', 'hidden-root', 'directory'),
      makeNode('element-b', 'hidden-root'),
    ]

    await operations.handleMoveNode('folder-a', 'app-folder', 'inside')
    expect(state.value.nodes.find(n => n.id === 'folder-a')?.parentNodeId).toBe('hidden-root')
    expect(setUiError).toHaveBeenCalledWith('models.folderLocked')

    await operations.handleMoveNode('element-b', 'app-folder', 'inside')
    expect(state.value.nodes.find(n => n.id === 'element-b')?.parentNodeId).toBe('hidden-root')
    expect(setUiError).toHaveBeenCalledWith('models.folderLocked')
  })
})

describe('useModelTreeOperations diagram rename ACL', () => {
  it('refuses rename when canEdit is false', () => {
    const state = ref(createEmptyModelEditorState())
    state.value.modelId = 'model-1'
    state.value.diagrams = [
      {
        id: 'dg-1',
        name: 'Overview',
        version: '1.0.0',
        ownerId: 'owner-1',
        modelId: 'model-1',
        nodeId: null,
        notationId: 'notation-1',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: { instances: { nodes: [], edges: [] } },
      },
    ] as never
    const markDiagramDirty = vi.fn()
    const operations = useModelTreeOperations({
      state,
      model: ref({ attrs: null }),
      selectedDiagramId: ref(null),
      t: key => key,
      setUiError: vi.fn(),
      clearUiError: vi.fn(),
      markNodeDirty: vi.fn(),
      markDiagramDirty,
      canEdit: ref(false),
    })

    operations.handleRenameDiagram('dg-1', 'Renamed')

    expect(state.value.diagrams[0]?.name).toBe('Overview')
    expect(markDiagramDirty).not.toHaveBeenCalled()
  })
})
