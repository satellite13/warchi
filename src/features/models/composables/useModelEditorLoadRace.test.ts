import { effectScope } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelEditorState } from '../types'
import type { ModelEditorLoadProgressEvent } from '../utils/modelEditorLoadProgress'
import { useModelEditor } from './useModelEditor'

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
  }
}

const emptyCatalog = {
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

  it('ignores background completion from the previous model load', async () => {
    const linksA = deferred<never[]>()
    const catalogB = deferred<typeof emptyCatalog>()
    loadModelEditorShellMock.mockImplementation(async (modelId: string) => shell(modelId))
    loadModelEditorCatalogMock.mockImplementation(async (modelId: string) => {
      if (modelId === 'model-b') return catalogB.promise
      return emptyCatalog
    })
    loadModelEditorLinksMock.mockImplementation(async (modelId: string) => {
      if (modelId === 'model-a') return linksA.promise
      return []
    })

    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!

    const loadA = editor.loadModel()
    const readyA = editor.whenBackgroundReady()
    await vi.waitFor(() => {
      expect(loadModelEditorLinksMock).toHaveBeenCalledWith(
        'model-a',
        expect.objectContaining({ isCancelled: expect.any(Function) })
      )
    })

    route.params.id = 'model-b'
    const loadB = editor.loadModel()
    await vi.waitFor(() => {
      expect(editor.state.value.modelId).toBe('model-b')
    })

    linksA.resolve([])
    await Promise.all([loadA, readyA])

    expect(editor.state.value.modelId).toBe('model-b')
    expect(editor.initialSnapshotReady.value).toBe(false)

    catalogB.resolve(emptyCatalog)
    await loadB
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
    const linksA = deferred<never[]>()
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
      if (modelId === 'model-b') return catalogB.promise
      return emptyCatalog
    })
    loadModelEditorLinksMock.mockImplementation(async (modelId: string) => {
      if (modelId === 'model-a') return linksA.promise
      return []
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

    linksA.resolve([])
    catalogB.resolve(emptyCatalog)
    await Promise.all([loadA, loadB])
    scope.stop()
  })
})
