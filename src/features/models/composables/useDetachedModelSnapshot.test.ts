import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import type { EditorLink, EditorNode } from '../types'
import { createEmptyModelEditorState } from '../types'
import { fetchAllByModelId } from './modelEditorLoadModel'
import { useDetachedModelSnapshot } from './useDetachedModelSnapshot'
import { ModelPartialStore } from '../utils/modelPartialStore'

vi.mock('./modelEditorLoadModel', async importOriginal => {
  const actual = await importOriginal<typeof import('./modelEditorLoadModel')>()
  return {
    ...actual,
    fetchAllByModelId: vi.fn(),
  }
})

const fetchAllByModelIdMock = vi.mocked(fetchAllByModelId)

const node = (id: string, name = id): EditorNode => ({
  id,
  name,
  modelId: 'model-1',
  ownerId: 'owner-1',
  nodeTypeId: 'type-1',
  parentNodeId: null,
  parsedAttrs: parseNodeAttrs(null),
})

const link = (id: string, sourceId = 'n1', targetId = 'n2'): EditorLink => ({
  id,
  modelId: 'model-1',
  ownerId: 'owner-1',
  linkTypeId: 'type-1',
  sourceId,
  targetId,
  parsedAttrs: parseLinkAttrs(null),
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('useDetachedModelSnapshot', () => {
  beforeEach(() => {
    fetchAllByModelIdMock.mockReset()
  })

  it('loads a full snapshot through the escape hatch and never merges into the partial store', async () => {
    const store = new ModelPartialStore()
    const mergeNodes = vi.spyOn(store, 'mergeNodes')
    const mergeLinks = vi.spyOn(store, 'mergeLinks')
    fetchAllByModelIdMock.mockImplementation(async path => {
      if (path === '/nodes') {
        return [
          {
            id: 'remote-n',
            name: 'Remote',
            modelId: 'model-1',
            ownerId: 'owner-1',
            nodeTypeId: 'type-1',
            parentNodeId: null,
            attrs: null,
          },
        ]
      }
      return [
        {
          id: 'remote-l',
          modelId: 'model-1',
          ownerId: 'owner-1',
          linkTypeId: 'type-1',
          sourceId: 'missing-a',
          targetId: 'missing-b',
          attrs: null,
        },
      ]
    })
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelSnapshot(ref('model-1')))!

    const loaded = await loader.load()

    expect(fetchAllByModelIdMock).toHaveBeenCalledWith(
      '/nodes',
      'model-1',
      expect.anything(),
      undefined,
      expect.objectContaining({ isCancelled: expect.any(Function) })
    )
    expect(fetchAllByModelIdMock).toHaveBeenCalledWith(
      '/links',
      'model-1',
      expect.anything(),
      undefined,
      expect.objectContaining({ isCancelled: expect.any(Function) })
    )
    expect(loaded?.nodes.map(row => row.id)).toEqual(['remote-n'])
    expect(loaded?.links.map(row => row.id)).toEqual(['remote-l'])
    expect(mergeNodes).not.toHaveBeenCalled()
    expect(mergeLinks).not.toHaveBeenCalled()
    expect(store.nodes).toEqual([])
    expect(store.links).toEqual([])
    vueScope.stop()
  })

  it('overlays dirty/new/deleted local rows and leaves editor arrays unchanged', async () => {
    fetchAllByModelIdMock.mockImplementation(async path => {
      if (path === '/nodes') {
        return [
          {
            id: 'clean',
            name: 'server-clean',
            modelId: 'model-1',
            ownerId: 'owner-1',
            nodeTypeId: 'type-1',
            parentNodeId: null,
            attrs: null,
          },
          {
            id: 'dirty',
            name: 'server-dirty',
            modelId: 'model-1',
            ownerId: 'owner-1',
            nodeTypeId: 'type-1',
            parentNodeId: null,
            attrs: null,
          },
          {
            id: 'deleted',
            name: 'server-deleted',
            modelId: 'model-1',
            ownerId: 'owner-1',
            nodeTypeId: 'type-1',
            parentNodeId: null,
            attrs: null,
          },
        ]
      }
      return [
        {
          id: 'dangling',
          modelId: 'model-1',
          ownerId: 'owner-1',
          linkTypeId: 'type-1',
          sourceId: 'missing-a',
          targetId: 'missing-b',
          attrs: null,
        },
      ]
    })
    const state = createEmptyModelEditorState()
    state.nodes = [
      node('clean', 'materialized-clean'),
      { ...node('dirty', 'local-dirty'), _isDirty: true },
      { ...node('created', 'new-node'), _isNew: true },
      { ...node('deleted'), _isDeleted: true },
    ]
    state.links = []
    const nodesBefore = [...state.nodes]
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelSnapshot(ref('model-1')))!

    const overlay = await loader.loadOverlayed(state)

    expect(overlay?.ok).toBe(true)
    if (overlay?.ok) {
      expect(overlay.snapshot.nodes.map(row => [row.id, row.name])).toEqual([
        ['clean', 'server-clean'],
        ['dirty', 'local-dirty'],
        ['created', 'new-node'],
      ])
      expect(overlay.snapshot.links.map(row => row.id)).toEqual(['dangling'])
    }
    expect(state.nodes).toEqual(nodesBefore)
    expect(state.nodes.map(row => row.name)).toEqual([
      'materialized-clean',
      'local-dirty',
      'new-node',
      'deleted',
    ])
    vueScope.stop()
  })

  it('cancels an in-flight snapshot without publishing or changing the editor', async () => {
    const nodesRequest = deferred<unknown[]>()
    fetchAllByModelIdMock.mockImplementation(async (path, _modelId, _pageSize, _extra, options) => {
      if (path === '/nodes') {
        await nodesRequest.promise
        if (options?.isCancelled?.()) return []
        return []
      }
      return []
    })
    const state = createEmptyModelEditorState()
    state.nodes = [node('local')]
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelSnapshot(ref('model-1')))!

    const loadPromise = loader.loadOverlayed(state)
    loader.cancel()
    nodesRequest.resolve([])
    const result = await loadPromise

    expect(result).toEqual({ ok: false, cancelled: true, error: null })
    expect(loader.snapshot.value).toBeNull()
    expect(state.nodes.map(row => row.id)).toEqual(['local'])
    vueScope.stop()
  })

  it('surfaces a retryable load error and keeps the editor unchanged', async () => {
    fetchAllByModelIdMock.mockRejectedValue(new Error('snapshot unavailable'))
    const state = createEmptyModelEditorState()
    state.nodes = [node('local')]
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelSnapshot(ref('model-1')))!

    const first = await loader.loadOverlayed(state)
    expect(first).toEqual({
      ok: false,
      cancelled: false,
      error: 'snapshot unavailable',
    })
    expect(loader.error.value).toBe('snapshot unavailable')
    expect(state.nodes.map(row => row.id)).toEqual(['local'])

    fetchAllByModelIdMock.mockResolvedValue([])
    const retry = await loader.loadOverlayed(state)
    expect(retry?.ok).toBe(true)
    expect(loader.error.value).toBeNull()
    vueScope.stop()
  })

  it('releases the snapshot reference after the caller finishes validation', async () => {
    fetchAllByModelIdMock.mockResolvedValue([])
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelSnapshot(ref('model-1')))!

    const overlay = await loader.loadOverlayed(createEmptyModelEditorState())
    expect(overlay?.ok).toBe(true)
    expect(loader.snapshot.value).not.toBeNull()

    loader.release()
    expect(loader.snapshot.value).toBeNull()
    vueScope.stop()
  })
})
