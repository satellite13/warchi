import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAllByModelId } from './modelEditorLoadModel'
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

describe('detached snapshot consumer isolation', () => {
  beforeEach(() => {
    fetchAllByModelIdMock.mockReset()
  })

  it('keeps save, script and OEF loaders on separate generations', async () => {
    const saveNodes = deferred<unknown[]>()
    fetchAllByModelIdMock.mockImplementation(async (path, _modelId, _pageSize, _extra, options) => {
      if (path !== '/nodes') return []
      await saveNodes.promise
      if (options?.isCancelled?.()) return []
      return [
        {
          id: 'save-n',
          modelId: 'model-1',
          ownerId: 'o',
          nodeTypeId: 't',
          parentNodeId: null,
          attrs: null,
        },
      ]
    })
    const vueScope = effectScope()
    const modelId = ref('model-1')
    const saveLoader = vueScope.run(() => useDetachedModelSnapshot(modelId, { t: key => key }))!
    const scriptLoader = vueScope.run(() => useDetachedModelSnapshot(modelId, { t: key => key }))!
    const oefLoader = vueScope.run(() => useDetachedModelSnapshot(modelId, { t: key => key }))!

    const saveLoad = saveLoader.load()
    scriptLoader.cancel()
    oefLoader.invalidateAfterRemoteSync()
    saveNodes.resolve([])
    const saved = await saveLoad

    expect(saved?.nodes.map(row => row.id)).toEqual(['save-n'])
    expect(oefLoader.stale.value).toBe(true)
    expect(oefLoader.snapshot.value).toBeNull()
    expect(saveLoader.stale.value).toBe(false)
    expect(saveLoader.snapshot.value).not.toBeNull()
    vueScope.stop()
  })

  it('uses a translated fallback when the load error is not an Error', async () => {
    fetchAllByModelIdMock.mockRejectedValue('boom')
    const vueScope = effectScope()
    const loader = vueScope.run(() =>
      useDetachedModelSnapshot(ref('model-1'), { t: key => key })
    )!

    await loader.load()
    expect(loader.error.value).toBe('models.detachedSnapshotFailed')
    vueScope.stop()
  })
})
