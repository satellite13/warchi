import { effectScope } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeResponse } from '@/types/api'
import type { ModelEditorState } from '../types'
import type { ModelEditorLoadProgressEvent } from '../utils/modelEditorLoadProgress'
import { useModelEditor } from './useModelEditor'
import type { ModelEditorCatalog } from './modelEditorLoadModel'

const { route, loadModelEditorShellMock, loadModelEditorCatalogMock, loadModelEditorLinksMock } =
  vi.hoisted(() => ({
    route: { params: { id: 'model-a' as string | string[] | undefined } },
    loadModelEditorShellMock: vi.fn(),
    loadModelEditorCatalogMock: vi.fn(),
    loadModelEditorLinksMock: vi.fn(),
  }))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('./modelEditorLoadModel', () => ({
  loadModelEditorShell: loadModelEditorShellMock,
  loadModelEditorCatalog: loadModelEditorCatalogMock,
  loadModelEditorLinks: loadModelEditorLinksMock,
}))

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function editorState(modelId: string): ModelEditorState {
  return {
    modelId,
    ownerId: 'owner-1',
    nodes: [],
    links: [],
    diagrams: [],
    notations: [],
    nodeTypes: [],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
  }
}

function shell(modelId: string) {
  return {
    model: {
      id: modelId,
      name: modelId,
      version: '1.0.0',
      ownerId: 'owner-1',
    },
    modelCatalog: [],
    state: editorState(modelId),
    loadedNotationIds: [],
    rootChildrenPage: {
      content: [] as NodeResponse[],
      page: { number: 0, size: 500, totalElements: 0, totalPages: 0 },
    },
  }
}

const emptyCatalog: ModelEditorCatalog = {
  modelCatalog: [],
  notations: [],
  nodeTypes: [],
  linkTypes: [],
  components: [],
  relations: [],
  relationRules: [],
}

describe('useModelEditor load sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.params.id = 'model-a'
  })

  it('never starts the transitional unscoped full-links load during ordinary opening', async () => {
    const catalog = deferred<typeof emptyCatalog>()
    loadModelEditorShellMock.mockResolvedValue(shell('model-a'))
    loadModelEditorCatalogMock.mockReturnValue(catalog.promise)
    loadModelEditorLinksMock.mockResolvedValue([])

    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!
    const loading = editor.loadModel()

    await vi.waitFor(() => {
      expect(editor.initialSnapshotReady.value).toBe(true)
      expect(loadModelEditorCatalogMock).toHaveBeenCalled()
    })
    expect(loadModelEditorLinksMock).not.toHaveBeenCalled()

    catalog.resolve(emptyCatalog)
    await loading
    await editor.whenBackgroundReady()
    expect(loadModelEditorLinksMock).not.toHaveBeenCalled()
    scope.stop()
  })

  it('does not wipe components loaded for a new diagram when the empty catalog arrives later', async () => {
    const catalog = deferred<typeof emptyCatalog>()
    loadModelEditorShellMock.mockResolvedValue(shell('model-a'))
    loadModelEditorCatalogMock.mockReturnValue(catalog.promise)

    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!
    const loading = editor.loadModel()

    await vi.waitFor(() => {
      expect(editor.initialSnapshotReady.value).toBe(true)
    })

    editor.state.value.diagrams.push({
      id: 'diagram-new',
      name: 'First diagram',
      version: '1.0.0',
      ownerId: 'owner-1',
      modelId: 'model-a',
      nodeId: null,
      notationId: 'not-archi',
      createdAt: null,
      updatedAt: null,
      parsedAttrs: { instances: { nodes: [], edges: [] } },
      _isNew: true,
    })
    editor.state.value.components = [
      {
        id: 'cmp-1',
        name: 'Business Actor',
        version: '1.0.0',
        ownerId: 'owner-1',
        notationId: 'not-archi',
        nodeTypeId: 'nt-1',
        attrs: null,
      },
    ]

    catalog.resolve({
      ...emptyCatalog,
      notations: [{ id: 'not-archi', name: 'ArchiMate', version: '1.0.0', ownerId: 'owner-1', attrs: null }],
    })
    await loading

    expect(editor.state.value.components).toEqual([
      expect.objectContaining({ id: 'cmp-1', notationId: 'not-archi' }),
    ])
    scope.stop()
  })

  it('replaces components for notations included in the arriving catalog batch', async () => {
    const catalog = deferred<typeof emptyCatalog>()
    loadModelEditorShellMock.mockResolvedValue({
      ...shell('model-a'),
      loadedNotationIds: ['not-archi'],
    })
    loadModelEditorCatalogMock.mockReturnValue(catalog.promise)

    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!
    const loading = editor.loadModel()

    await vi.waitFor(() => {
      expect(editor.initialSnapshotReady.value).toBe(true)
    })

    editor.state.value.components = [
      {
        id: 'cmp-stale',
        name: 'Stale',
        version: '1.0.0',
        ownerId: 'owner-1',
        notationId: 'not-archi',
        nodeTypeId: 'nt-1',
        attrs: null,
      },
      {
        id: 'cmp-keep',
        name: 'Keep',
        version: '1.0.0',
        ownerId: 'owner-1',
        notationId: 'not-other',
        nodeTypeId: 'nt-2',
        attrs: null,
      },
    ]

    catalog.resolve({
      ...emptyCatalog,
      components: [
        {
          id: 'cmp-fresh',
          name: 'Fresh',
          version: '1.0.0',
          ownerId: 'owner-1',
          notationId: 'not-archi',
          nodeTypeId: 'nt-1',
          attrs: null,
        },
      ],
    })
    await loading

    expect(editor.state.value.components.map(item => item.id).sort()).toEqual([
      'cmp-fresh',
      'cmp-keep',
    ])
    scope.stop()
  })

  it('ignores catalog completion from the previous model load', async () => {
    const catalogA = deferred<typeof emptyCatalog>()
    const catalogB = deferred<typeof emptyCatalog>()
    loadModelEditorShellMock.mockImplementation(async (modelId: string) => shell(modelId))
    loadModelEditorCatalogMock.mockImplementation(async (modelId: string) => {
      if (modelId === 'model-a') return catalogA.promise
      if (modelId === 'model-b') return catalogB.promise
      return emptyCatalog
    })

    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!

    const loadA = editor.loadModel()
    const readyA = editor.whenBackgroundReady()
    await vi.waitFor(() => {
      expect(loadModelEditorCatalogMock).toHaveBeenCalledWith(
        'model-a',
        [],
        expect.objectContaining({ isCancelled: expect.any(Function) })
      )
    })

    route.params.id = 'model-b'
    const loadB = editor.loadModel()
    await vi.waitFor(() => {
      expect(editor.state.value.modelId).toBe('model-b')
    })

    catalogA.resolve(emptyCatalog)
    await Promise.all([loadA, readyA])

    expect(editor.state.value.modelId).toBe('model-b')
    // Model B already has a usable shell; catalog readiness is intentionally independent.
    expect(editor.initialSnapshotReady.value).toBe(true)

    catalogB.resolve(emptyCatalog)
    await loadB
    scope.stop()
  })

  it('marks the scoped shell ready before independent catalog work', async () => {
    const catalog = deferred<typeof emptyCatalog>()
    loadModelEditorShellMock.mockResolvedValue(shell('model-a'))
    loadModelEditorCatalogMock.mockReturnValue(catalog.promise)

    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!
    const loading = editor.loadModel()

    await vi.waitFor(() => {
      expect(editor.initialSnapshotReady.value).toBe(true)
      expect(loadModelEditorCatalogMock).toHaveBeenCalledWith(
        'model-a',
        [],
        expect.objectContaining({ isCancelled: expect.any(Function) })
      )
    })
    expect(loadModelEditorLinksMock).not.toHaveBeenCalled()

    catalog.resolve(emptyCatalog)
    await loading
    expect(loadModelEditorLinksMock).not.toHaveBeenCalled()
    scope.stop()
  })

  it('keeps catalog failure nonblocking and retryable without removing the root shell', async () => {
    const rootShell = shell('model-a')
    rootShell.state.nodes = [
      {
        id: 'root-child',
        name: 'Root child',
        modelId: 'model-a',
        ownerId: 'owner-1',
        nodeTypeId: 'directory-type',
        parentNodeId: null,
        hasChildren: true,
        parsedAttrs: {
          treeOrder: 0,
          notationComponents: {},
          componentProperties: {},
          typeProperties: {},
        },
      },
    ]
    rootShell.rootChildrenPage.content = [
      {
        id: 'root-child',
        name: 'Root child',
        modelId: 'model-a',
        ownerId: 'owner-1',
        nodeTypeId: 'directory-type',
        parentNodeId: null,
        hasChildren: true,
        attrs: null,
      },
    ]
    rootShell.rootChildrenPage.page = {
      number: 0,
      size: 500,
      totalElements: 1,
      totalPages: 1,
    }
    loadModelEditorShellMock.mockResolvedValue(rootShell)
    loadModelEditorCatalogMock.mockRejectedValue(new Error('catalog unavailable'))
    loadModelEditorLinksMock.mockResolvedValue([])

    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!
    await editor.loadModel()

    expect(editor.initialSnapshotReady.value).toBe(true)
    expect(editor.state.value.nodes.map(row => row.id)).toEqual(['root-child'])
    expect(editor.errorMessage.value).toBeNull()
    expect(editor.catalogLoadWarning.value).toBe('catalog unavailable')
    expect(loadModelEditorLinksMock).not.toHaveBeenCalled()

    loadModelEditorCatalogMock.mockResolvedValue(emptyCatalog)
    await editor.retryCatalogLoad()
    expect(editor.catalogLoadWarning.value).toBeNull()
    expect(editor.state.value.nodes.map(row => row.id)).toEqual(['root-child'])
    scope.stop()
  })

  it('does not invoke the detached full-links helper even when it would fail', async () => {
    loadModelEditorShellMock.mockResolvedValue(shell('model-a'))
    loadModelEditorCatalogMock.mockResolvedValue(emptyCatalog)
    loadModelEditorLinksMock.mockRejectedValueOnce(new Error('links unavailable'))

    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!
    await editor.loadModel()

    expect(editor.initialSnapshotReady.value).toBe(true)
    expect(editor.errorMessage.value).toBeNull()
    expect(loadModelEditorLinksMock).not.toHaveBeenCalled()
    scope.stop()
  })

  it('replaces readiness promises for an invalid route id', async () => {
    const shellA = deferred<ReturnType<typeof shell>>()
    loadModelEditorShellMock.mockReturnValue(shellA.promise)

    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!
    const loadA = editor.loadModel()
    const catalogA = editor.whenCatalogReady()
    const backgroundA = editor.whenBackgroundReady()

    route.params.id = undefined
    await editor.loadModel()
    const invalidCatalog = editor.whenCatalogReady()
    const invalidBackground = editor.whenBackgroundReady()

    expect(invalidCatalog).not.toBe(catalogA)
    expect(invalidBackground).not.toBe(backgroundA)
    await expect(invalidCatalog).resolves.toBeUndefined()
    await expect(invalidBackground).resolves.toBeUndefined()

    shellA.resolve(shell('model-a'))
    await loadA
    scope.stop()
  })

  it('ignores progress events from an older load generation', async () => {
    const catalogA = deferred<typeof emptyCatalog>()
    const catalogB = deferred<typeof emptyCatalog>()
    const progressByModel = new Map<string, (event: ModelEditorLoadProgressEvent) => void>()
    loadModelEditorShellMock.mockImplementation(
      async (
        modelId: string,
        options: { onProgress?: (event: ModelEditorLoadProgressEvent) => void }
      ) => {
        if (options.onProgress) progressByModel.set(modelId, options.onProgress)
        return shell(modelId)
      }
    )
    loadModelEditorCatalogMock.mockImplementation(async (modelId: string) => {
      if (modelId === 'model-a') return catalogA.promise
      if (modelId === 'model-b') return catalogB.promise
      return emptyCatalog
    })

    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!
    const loadA = editor.loadModel()
    await vi.waitFor(() => {
      expect(progressByModel.has('model-a')).toBe(true)
    })

    route.params.id = 'model-b'
    const loadB = editor.loadModel()
    await vi.waitFor(() => {
      expect(progressByModel.has('model-b')).toBe(true)
    })

    progressByModel.get('model-a')?.({
      kind: 'collection',
      collection: 'nodes',
      loaded: 100,
      total: 100,
    })
    expect(editor.loadProgress.value).toMatchObject({
      modelId: 'model-b',
      percent: 0,
      blocking: false,
    })

    progressByModel.get('model-b')?.({
      kind: 'collection',
      collection: 'nodes',
      loaded: 50,
      total: 100,
    })
    expect(editor.loadProgress.value).toMatchObject({
      modelId: 'model-b',
      phase: 'nodes',
      loaded: 50,
      total: 100,
    })

    catalogA.resolve(emptyCatalog)
    catalogB.resolve(emptyCatalog)
    await Promise.all([loadA, loadB])
    scope.stop()
  })
})
