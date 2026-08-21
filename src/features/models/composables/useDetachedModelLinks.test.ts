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

describe('useDetachedModelLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
