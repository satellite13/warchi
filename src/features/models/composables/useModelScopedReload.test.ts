import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeResponse } from '@/types/api'
import type { ModelData, PaginatedResponse } from '@/types/entities'
import { parseDiagramAttrs, parseNodeAttrs } from '../modelAttrs'
import { createEmptyModelEditorState } from '../types'
import { fetchAllByModelId, loadModelEditorShell } from './modelEditorLoadModel'
import { discardUnsavedModelChanges } from './discardUnsavedModelChanges'
import type { ModelEditorDraftSnapshot } from './useModelEditorDraft'
import { useModelPartialStore } from './useModelPartialStore'
import { useModelScopedReload } from './useModelScopedReload'

vi.mock('./modelEditorLoadModel', async importOriginal => {
  const actual = await importOriginal<typeof import('./modelEditorLoadModel')>()
  return {
    ...actual,
    loadModelEditorShell: vi.fn(),
    fetchAllByModelId: vi.fn(),
  }
})

vi.mock('./discardUnsavedModelChanges', () => ({
  discardUnsavedModelChanges: vi.fn(),
}))

vi.mock('./modelScopedApi', () => ({
  fetchNodeChildren: vi.fn(async () => ({
    success: true,
    data: {
      content: [],
      page: { number: 0, size: 500, totalElements: 0, totalPages: 1 },
    },
  })),
}))

const loadModelEditorShellMock = vi.mocked(loadModelEditorShell)
const fetchAllByModelIdMock = vi.mocked(fetchAllByModelId)
const discardUnsavedModelChangesMock = vi.mocked(discardUnsavedModelChanges)

const model: ModelData = {
  id: 'model-1',
  name: 'Model',
  version: '1.0.0',
  ownerId: 'owner-1',
  attrs: JSON.stringify({ treeRootNodeId: 'root-1' }),
}

const rootPage = (ids: string[]): PaginatedResponse<NodeResponse> => ({
  content: ids.map(id => ({
    id,
    name: id,
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeTypeId: 'type-1',
    parentNodeId: 'root-1',
    attrs: null,
  })),
  page: { number: 0, size: 500, totalElements: ids.length, totalPages: 1 },
})

function shell(rootIds: string[], diagramId = 'diagram-1') {
  return {
    model,
    modelCatalog: [],
    loadedNotationIds: ['notation-1'],
    rootChildrenPage: rootPage(rootIds),
    state: {
      ...createEmptyModelEditorState(),
      modelId: 'model-1',
      ownerId: 'owner-1',
      nodes: rootIds.map(id => ({
        id,
        name: id,
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: 'root-1',
        parsedAttrs: parseNodeAttrs(null),
      })),
      diagrams: [
        {
          id: diagramId,
          name: 'Diagram',
          version: '1.0.0',
          modelId: 'model-1',
          ownerId: 'owner-1',
          notationId: 'notation-1',
          nodeId: null,
          parsedAttrs: parseDiagramAttrs(null),
          _attrsPending: true,
        },
      ],
    },
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useModelScopedReload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadModelEditorShellMock.mockResolvedValue(shell(['root-child']))
    fetchAllByModelIdMock.mockRejectedValue(new Error('full collection must not be used'))
  })

  type ReloadOptions = Parameters<typeof useModelScopedReload>[0]

  function createHarness(extraReloadOptions: Partial<ReloadOptions> = {}) {
    const state = ref(createEmptyModelEditorState())
    state.value.modelId = 'model-1'
    state.value.ownerId = 'owner-1'
    state.value.notations = [
      { id: 'notation-1', name: 'N', version: '1.0.0', ownerId: 'o' } as never,
    ]
    state.value.nodes = [
      {
        id: 'stale-clean',
        name: 'stale-clean',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: 'root-1',
        parsedAttrs: parseNodeAttrs(null),
      },
    ]
    state.value.links = [
      {
        id: 'stale-link',
        modelId: 'model-1',
        ownerId: 'owner-1',
        linkTypeId: 'type-1',
        sourceId: 'stale-clean',
        targetId: 'stale-clean',
        parsedAttrs: parseNodeAttrs(null) as never,
      } as never,
    ]
    state.value.diagrams = [
      {
        id: 'diagram-1',
        name: 'Diagram',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        parsedAttrs: parseDiagramAttrs(null),
      },
    ]
    const modelRef = ref<ModelData | null>({ ...model, name: 'Old' })
    const modelDirty = ref(false)
    const modelInitialName = ref('Old')
    const selectedDiagramId = ref<string | null>('diagram-1')
    const vueScope = effectScope()
    const partialStore = vueScope.run(() => useModelPartialStore(state))!
    partialStore.resetPartialScopes('model-1', {
      scope: { kind: 'root' },
      page: rootPage(['stale-clean']),
      rootParentNodeId: 'root-1',
    })
    const reopenDiagramScope = vi.fn(async () => undefined)
    const refreshTreeScopes = vi.fn(async () => undefined)
    const reload = vueScope.run(() =>
      useModelScopedReload({
        state,
        model: modelRef,
        modelDirty,
        modelInitialName,
        selectedDiagramId,
        partialStore,
        reopenDiagramScope,
        refreshTreeScopes,
        t: key => key,
        ...extraReloadOptions,
      })
    )!
    return {
      state,
      modelRef,
      modelDirty,
      modelInitialName,
      selectedDiagramId,
      partialStore,
      reopenDiagramScope,
      refreshTreeScopes,
      reload,
      vueScope,
    }
  }

  it('reloads root and slim diagrams, keeps the open diagram and never fetches full nodes/links', async () => {
    const harness = createHarness()
    const generationBefore = harness.partialStore.store.generation

    const result = await harness.reload.reloadPartialEditor()

    expect(result).toEqual({ ok: true })
    expect(harness.partialStore.store.generation).toBeGreaterThan(generationBefore)
    expect(harness.selectedDiagramId.value).toBe('diagram-1')
    expect(harness.state.value.nodes.map(row => row.id)).toEqual(['root-child'])
    expect(harness.state.value.links).toEqual([])
    expect(harness.state.value.notations.map(row => row.id)).toEqual(['notation-1'])
    expect(harness.reopenDiagramScope).toHaveBeenCalledWith('diagram-1')
    expect(harness.refreshTreeScopes).not.toHaveBeenCalled()
    expect(loadModelEditorShellMock).toHaveBeenCalledWith(
      'model-1',
      expect.objectContaining({ isCancelled: expect.any(Function) })
    )
    expect(fetchAllByModelIdMock).not.toHaveBeenCalled()
    harness.vueScope.stop()
  })

  it('refreshes affected tree scopes on lock reload', async () => {
    const harness = createHarness()
    await harness.partialStore.loadChildren({ kind: 'node', nodeId: 'folder-1' })
    const affectedBefore = harness.partialStore.materializedChildrenScopes()

    await harness.reload.reloadPartialEditor({ mode: 'lock' })

    expect(harness.reopenDiagramScope).toHaveBeenCalledWith('diagram-1')
    expect(harness.refreshTreeScopes).toHaveBeenCalledWith(expect.arrayContaining(affectedBefore))
    expect(fetchAllByModelIdMock).not.toHaveBeenCalled()
    harness.vueScope.stop()
  })

  it('ignores a stale shell that resolved after a newer reset', async () => {
    const first = deferred<ReturnType<typeof shell>>()
    const second = deferred<ReturnType<typeof shell>>()
    loadModelEditorShellMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const harness = createHarness()

    const firstReload = harness.reload.reloadPartialEditor()
    const secondReload = harness.reload.reloadPartialEditor()
    first.resolve(shell(['stale-root']))
    second.resolve(shell(['fresh-root']))
    await Promise.all([firstReload, secondReload])

    expect(harness.state.value.nodes.map(row => row.id)).toEqual(['fresh-root'])
    expect(harness.reopenDiagramScope).toHaveBeenCalledTimes(1)
    expect(harness.reopenDiagramScope).toHaveBeenCalledWith('diagram-1')
    harness.vueScope.stop()
  })

  it('leaves materialized dirty/new/deleted intact when the shell fails', async () => {
    loadModelEditorShellMock.mockRejectedValue(new Error('shell down'))
    const harness = createHarness()
    harness.state.value.nodes.push({
      id: 'dirty-local',
      name: 'Dirty',
      modelId: 'model-1',
      ownerId: 'owner-1',
      nodeTypeId: 'type-1',
      parentNodeId: 'root-1',
      parsedAttrs: parseNodeAttrs(null),
      _isDirty: true,
    })
    const nodesBefore = harness.state.value.nodes.map(row => row.id)

    const result = await harness.reload.reloadPartialEditor()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failedPhase).toBe('shell')
      expect(result.error).toBe('shell down')
    }
    expect(harness.state.value.nodes.map(row => row.id)).toEqual(nodesBefore)
    expect(harness.state.value.nodes.find(row => row.id === 'dirty-local')?._isDirty).toBe(true)
    expect(harness.reopenDiagramScope).not.toHaveBeenCalled()
    harness.vueScope.stop()
  })

  it('ignores a stale model-A shell after the instance switches to model B', async () => {
    const first = deferred<ReturnType<typeof shell>>()
    loadModelEditorShellMock
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(shell(['b-root']))
    const harness = createHarness()
    const pendingA = harness.reload.reloadPartialEditor()
    harness.state.value.modelId = 'model-2'
    harness.reload.invalidate()
    const pendingB = harness.reload.reloadPartialEditor()
    first.resolve(shell(['stale-a']))
    await pendingA
    await pendingB

    expect(harness.state.value.nodes.map(row => row.id)).toEqual(['b-root'])
    expect(harness.reopenDiagramScope).toHaveBeenCalledTimes(1)
    harness.vueScope.stop()
  })

  it('ignores an in-flight shell after dispose or explicit invalidate', async () => {
    const first = deferred<ReturnType<typeof shell>>()
    loadModelEditorShellMock.mockReturnValueOnce(first.promise)
    const harness = createHarness()
    const pending = harness.reload.reloadPartialEditor()
    harness.reload.invalidate()
    first.resolve(shell(['disposed-root']))
    const result = await pending

    expect(result.ok).toBe(false)
    expect(harness.state.value.nodes.map(row => row.id)).toEqual(['stale-clean'])
    expect(harness.reopenDiagramScope).not.toHaveBeenCalled()
    harness.vueScope.stop()
  })

  it('restores the pre-reload editor when diagram reopen fails after a successful shell', async () => {
    const harness = createHarness()
    harness.state.value.nodes.push({
      id: 'dirty-local',
      name: 'Dirty',
      modelId: 'model-1',
      ownerId: 'owner-1',
      nodeTypeId: 'type-1',
      parentNodeId: 'root-1',
      parsedAttrs: parseNodeAttrs(null),
      _isDirty: true,
    })
    const nodesBefore = harness.state.value.nodes.map(row => row.id)
    const linksBefore = harness.state.value.links.map(row => row.id)
    harness.modelDirty.value = true
    harness.modelInitialName.value = 'Old'
    harness.reopenDiagramScope.mockRejectedValue(new Error('diagram scope failed'))

    const result = await harness.reload.reloadPartialEditor()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failedPhase).toBe('diagram')
      expect(result.error).toBe('diagram scope failed')
    }
    // State is rolled back to the pre-reload snapshot: unsaved edits survive the failure.
    expect(harness.state.value.nodes.map(row => row.id)).toEqual(nodesBefore)
    expect(harness.state.value.links.map(row => row.id)).toEqual(linksBefore)
    expect(harness.state.value.nodes.find(row => row.id === 'dirty-local')?._isDirty).toBe(true)
    expect(harness.modelRef.value?.name).toBe('Old')
    expect(harness.modelDirty.value).toBe(true)
    harness.vueScope.stop()
  })

  it('presents the captured unsaved draft after a successful reload', async () => {
    const snapshot: ModelEditorDraftSnapshot = {
      schemaVersion: 1,
      savedAt: 0,
      model: { id: 'model-1', name: 'Old', version: '1.0.0', ownerId: 'owner-1' },
      nodes: [],
      links: [],
      diagrams: [],
    }
    let nodesAtCapture: string[] = []
    const captureUnsavedDraft = vi.fn(() => {
      nodesAtCapture = harness.state.value.nodes.map(row => row.id)
      return snapshot
    })
    const presentUnsavedDraft = vi.fn()
    const harness = createHarness({ captureUnsavedDraft, presentUnsavedDraft })

    const result = await harness.reload.reloadPartialEditor()

    expect(result.ok).toBe(true)
    // The draft must be taken from the pre-reload state, before it is replaced.
    expect(captureUnsavedDraft).toHaveBeenCalledTimes(1)
    expect(nodesAtCapture).toEqual(['stale-clean'])
    expect(presentUnsavedDraft).toHaveBeenCalledWith(snapshot)
    harness.vueScope.stop()
  })

  it('does not present a draft when there are no unsaved edits to capture', async () => {
    const captureUnsavedDraft = vi.fn(() => null)
    const presentUnsavedDraft = vi.fn()
    const harness = createHarness({ captureUnsavedDraft, presentUnsavedDraft })

    const result = await harness.reload.reloadPartialEditor()

    expect(result.ok).toBe(true)
    expect(captureUnsavedDraft).toHaveBeenCalledTimes(1)
    expect(presentUnsavedDraft).not.toHaveBeenCalled()
    harness.vueScope.stop()
  })

  it('does not report full success when lock tree refresh fails', async () => {
    const harness = createHarness()
    harness.refreshTreeScopes.mockRejectedValue(new Error('tree refresh failed'))

    const result = await harness.reload.reloadPartialEditor({ mode: 'lock' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failedPhase).toBe('tree')
      expect(result.error).toBe('tree refresh failed')
    }
    expect(harness.reopenDiagramScope).toHaveBeenCalledWith('diagram-1')
    harness.vueScope.stop()
  })

  it('returns a translated retryable error when the model id is missing', async () => {
    const harness = createHarness()
    harness.state.value.modelId = ''

    const result = await harness.reload.reloadPartialEditor()

    expect(result).toEqual({
      ok: false,
      failedPhase: 'shell',
      error: 'models.scopedReloadModelMissing',
    })
    expect(harness.state.value.nodes.map(row => row.id)).toEqual(['stale-clean'])
    harness.vueScope.stop()
  })

  it('falls back to a partial reset when point-restore discard fails', async () => {
    discardUnsavedModelChangesMock.mockResolvedValue({ ok: false, error: 'point restore failed' })
    const harness = createHarness()
    const loadModel = vi.fn(async () => undefined)

    const result = await harness.reload.discardUnsavedOrReload({
      model: harness.modelRef.value,
      modelDirty: false,
      loadModel,
    })

    expect(result).toBe(true)
    expect(loadModel).not.toHaveBeenCalled()
    expect(loadModelEditorShellMock).toHaveBeenCalled()
    expect(fetchAllByModelIdMock).not.toHaveBeenCalled()
    expect(harness.reopenDiagramScope).toHaveBeenCalledWith('diagram-1')
    harness.vueScope.stop()
  })

  it('keeps unsaved edits when the discard fallback reload fails', async () => {
    discardUnsavedModelChangesMock.mockResolvedValue({ ok: false, error: 'point restore failed' })
    loadModelEditorShellMock.mockRejectedValue(new Error('shell down'))
    const harness = createHarness()
    harness.state.value.nodes.push({
      id: 'new-local',
      name: 'New',
      modelId: 'model-1',
      ownerId: 'owner-1',
      nodeTypeId: 'type-1',
      parentNodeId: 'root-1',
      parsedAttrs: parseNodeAttrs(null),
      _isNew: true,
    })

    const result = await harness.reload.discardUnsavedOrReload({
      model: harness.modelRef.value,
      modelDirty: false,
    })

    expect(result).toBe(false)
    expect(harness.state.value.nodes.some(row => row.id === 'new-local' && row._isNew)).toBe(true)
    expect(harness.reopenDiagramScope).not.toHaveBeenCalled()
    harness.vueScope.stop()
  })
})
