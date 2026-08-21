import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseNodeAttrs } from '../modelAttrs'
import { createEmptyModelEditorState } from '../types'
import { fetchAllByModelId } from './modelEditorLoadModel'
import { prepareModelSaveValidation } from './prepareModelSaveValidation'
import { useDetachedModelSnapshot } from './useDetachedModelSnapshot'

vi.mock('./modelEditorLoadModel', async importOriginal => {
  const actual = await importOriginal<typeof import('./modelEditorLoadModel')>()
  return {
    ...actual,
    fetchAllByModelId: vi.fn(),
  }
})

const fetchAllByModelIdMock = vi.mocked(fetchAllByModelId)

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('prepareModelSaveValidation', () => {
  beforeEach(() => {
    fetchAllByModelIdMock.mockReset()
  })

  it('cancels without treating the editor as invalid and releases the snapshot', async () => {
    const nodesRequest = deferred<unknown[]>()
    fetchAllByModelIdMock.mockImplementation(async (path, _modelId, _pageSize, _extra, options) => {
      if (path === '/nodes') {
        await nodesRequest.promise
        if (options?.isCancelled?.()) return []
      }
      return []
    })
    const state = createEmptyModelEditorState()
    state.nodes = [
      {
        id: 'n1',
        name: 'Local',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: null,
        parsedAttrs: parseNodeAttrs(null),
        _isDirty: true,
      },
    ]
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelSnapshot(ref('model-1')))!
    const prepare = prepareModelSaveValidation({
      loader,
      state,
      activeDiagram: null,
    })
    loader.cancel()
    nodesRequest.resolve([])
    const result = await prepare

    expect(result).toEqual({ ok: false, cancelled: true, error: null })
    expect(loader.snapshot.value).toBeNull()
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0]?._isDirty).toBe(true)
    vueScope.stop()
  })

  it('blocks save with a retryable load error and does not change editor arrays', async () => {
    fetchAllByModelIdMock.mockRejectedValue(new Error('full list failed'))
    const state = createEmptyModelEditorState()
    state.nodes = [
      {
        id: 'n1',
        name: 'Local',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: null,
        parsedAttrs: parseNodeAttrs(null),
      },
    ]
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelSnapshot(ref('model-1')))!

    const result = await prepareModelSaveValidation({
      loader,
      state,
      activeDiagram: null,
    })

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      error: 'full list failed',
    })
    expect(loader.snapshot.value).toBeNull()
    expect(state.nodes.map(row => row.id)).toEqual(['n1'])
    vueScope.stop()
  })

  it('validates the overlayed snapshot and releases the server reference afterwards', async () => {
    fetchAllByModelIdMock.mockImplementation(async path => {
      if (path === '/nodes') {
        return [
          {
            id: 'hidden',
            name: 'Hidden',
            modelId: 'model-1',
            ownerId: 'owner-1',
            nodeTypeId: 'type-1',
            parentNodeId: null,
            attrs: null,
          },
        ]
      }
      return []
    })
    const state = createEmptyModelEditorState()
    state.nodeTypes = [
      {
        id: 'type-1',
        name: 'App',
        ownerId: 'owner-1',
        attrs: JSON.stringify({
          customProperties: [{ name: 'code', type: 'string', required: true, system: false }],
        }),
      } as never,
    ]
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelSnapshot(ref('model-1')))!

    const result = await prepareModelSaveValidation({
      loader,
      state,
      activeDiagram: null,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.cancelled).toBe(false)
      expect(result.error).toContain('code')
    }
    expect(loader.snapshot.value).toBeNull()
    expect(state.nodes).toEqual([])
    vueScope.stop()
  })
})
