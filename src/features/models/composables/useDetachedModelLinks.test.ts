import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadModelEditorLinks } from './modelEditorLoadModel'
import { mergeDetachedModelLinks, useDetachedModelLinks } from './useDetachedModelLinks'
import { parseLinkAttrs } from '../modelAttrs'
import type { EditorLink } from '../types'

vi.mock('./modelEditorLoadModel', () => ({
  loadModelEditorLinks: vi.fn(),
}))

const link = (id: string, updatedAt: string | null = null): EditorLink => ({
  id,
  modelId: 'model-1',
  ownerId: 'owner-1',
  linkTypeId: 'type-1',
  sourceId: 'source-1',
  targetId: 'target-1',
  parsedAttrs: parseLinkAttrs(null),
  updatedAt,
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useDetachedModelLinks', () => {
  beforeEach(() => {
    vi.mocked(loadModelEditorLinks).mockReset()
  })

  it('loads full links only on demand and keeps them detached from partial state', async () => {
    const modelId = ref<string | null>('model-1')
    const partialLinks = [link('partial')]
    vi.mocked(loadModelEditorLinks).mockResolvedValue([link('remote')])
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelLinks(modelId))!

    expect(loadModelEditorLinks).not.toHaveBeenCalled()
    await loader.load()

    expect(loadModelEditorLinks).toHaveBeenCalledWith('model-1', expect.any(Object))
    expect(loader.links.value.map(item => item.id)).toEqual(['remote'])
    expect(partialLinks.map(item => item.id)).toEqual(['partial'])
    vueScope.stop()
  })

  it('deduplicates remote rows while local dirty/new/deleted rows take precedence', () => {
    const remote = [link('same', 'remote'), link('remote-only'), link('same', 'duplicate')]
    const dirty = { ...link('same', 'local'), _isDirty: true }
    const created = { ...link('new'), _isNew: true }
    const deleted = { ...link('remote-only'), _isDeleted: true }

    expect(mergeDetachedModelLinks(remote, [dirty, created, deleted])).toEqual([dirty, created])
  })

  it('refetches a repeated operation and replaces a remotely updated snapshot', async () => {
    vi.mocked(loadModelEditorLinks)
      .mockResolvedValueOnce([link('remote', 'v1')])
      .mockResolvedValueOnce([link('remote', 'v2')])
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelLinks(ref('model-1')))!

    await loader.load()
    await loader.load()

    expect(loadModelEditorLinks).toHaveBeenCalledTimes(2)
    expect(loader.links.value).toEqual([link('remote', 'v2')])
    expect(mergeDetachedModelLinks(loader.links.value, [link('remote', 'v1')])).toEqual([
      link('remote', 'v2'),
    ])
    vueScope.stop()
  })

  it('does not resurrect a remote delete after a successful save clears local flags', async () => {
    const staleCleanPartial = link('deleted-remotely', 'v1')
    vi.mocked(loadModelEditorLinks)
      .mockResolvedValueOnce([link('deleted-remotely', 'v1')])
      .mockResolvedValueOnce([])
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelLinks(ref('model-1')))!

    await loader.load()
    expect(
      mergeDetachedModelLinks(loader.links.value, [
        { ...staleCleanPartial, _isDeleted: true },
      ])
    ).toEqual([])

    // Successful save removes the local tombstone; the next detached operation must
    // consult the server again instead of treating the old full snapshot as authoritative.
    await loader.refreshAfterSuccessfulSave()

    expect(loadModelEditorLinks).toHaveBeenCalledTimes(2)
    expect(mergeDetachedModelLinks(loader.links.value, [staleCleanPartial])).toEqual([])
    vueScope.stop()
  })

  it('deduplicates only concurrent calls and starts a new request after settlement', async () => {
    const first = deferred<EditorLink[]>()
    vi.mocked(loadModelEditorLinks)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([link('second')])
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelLinks(ref('model-1')))!

    const firstCall = loader.load()
    const sameOperation = loader.load()
    expect(loadModelEditorLinks).toHaveBeenCalledTimes(1)
    first.resolve([link('first')])
    await Promise.all([firstCall, sameOperation])

    await loader.load()

    expect(loadModelEditorLinks).toHaveBeenCalledTimes(2)
    expect(loader.links.value).toEqual([link('second')])
    vueScope.stop()
  })

  it('supersedes an in-flight snapshot when save succeeds and never publishes the old result', async () => {
    const oldRequest = deferred<EditorLink[]>()
    const freshRequest = deferred<EditorLink[]>()
    vi.mocked(loadModelEditorLinks)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(freshRequest.promise)
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelLinks(ref('model-1')))!

    const oldLoad = loader.load()
    const saveRefresh = loader.refreshAfterSuccessfulSave()
    expect(loadModelEditorLinks).toHaveBeenCalledTimes(2)

    oldRequest.resolve([link('stale-before-save')])
    await oldLoad
    expect(loader.links.value).toEqual([])
    expect(loader.loadedModelId.value).toBeNull()

    freshRequest.resolve([link('fresh-after-save')])
    await saveRefresh
    expect(loader.links.value).toEqual([link('fresh-after-save')])
    vueScope.stop()
  })

  it('invalidates remote events without eager reload and next explicit load is fresh', async () => {
    const oldRequest = deferred<EditorLink[]>()
    vi.mocked(loadModelEditorLinks)
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce([link('fresh-after-events')])
    const vueScope = effectScope()
    const loader = vueScope.run(() => useDetachedModelLinks(ref('model-1')))!

    const oldLoad = loader.load()
    loader.invalidateAfterRemoteSync()
    loader.invalidateAfterRemoteSync()
    loader.invalidateAfterRemoteSync()
    expect(loadModelEditorLinks).toHaveBeenCalledTimes(1)
    expect(loader.links.value).toEqual([])
    expect(loader.loadedModelId.value).toBeNull()
    expect(loader.stale.value).toBe(true)

    oldRequest.resolve([link('deleted-remotely')])
    await oldLoad
    expect(loader.links.value).toEqual([])

    await loader.load()
    expect(loadModelEditorLinks).toHaveBeenCalledTimes(2)
    expect(loader.links.value).toEqual([link('fresh-after-events')])
    expect(loader.stale.value).toBe(false)
    vueScope.stop()
  })
})
