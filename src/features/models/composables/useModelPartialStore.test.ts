import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeResponse } from '@/types/api'
import type { PaginatedResponse } from '@/types/entities'
import { createEmptyModelEditorState } from '../types'
import { fetchNodeChildren } from './modelScopedApi'
import { useModelPartialStore } from './useModelPartialStore'

vi.mock('./modelScopedApi', () => ({
  fetchNodeChildren: vi.fn(),
}))

const node = (id: string, parentNodeId: string | null = null): NodeResponse => ({
  id,
  name: id,
  modelId: 'model-a',
  ownerId: 'owner-1',
  nodeTypeId: 'type-1',
  parentNodeId,
  attrs: null,
  hasChildren: false,
})

const page = (
  content: NodeResponse[],
  number = 0,
  totalElements = content.length,
  totalPages = 1
): PaginatedResponse<NodeResponse> => ({
  content,
  page: { number, size: 500, totalElements, totalPages },
})

const deferred = <T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useModelPartialStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deduplicates concurrent loads for the same parent scope', async () => {
    const response = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren).mockReturnValue(response.promise)
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')

    const first = partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })
    const second = partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })

    expect(fetchNodeChildren).toHaveBeenCalledTimes(1)
    response.resolve({ success: true, data: page([node('child-1', 'parent-1')]) })
    await Promise.all([first, second])
    expect(state.value.nodes.map(row => row.id)).toEqual(['child-1'])
    scope.stop()
  })

  it('ignores an old model response after the generation changes', async () => {
    const response = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren).mockReturnValue(response.promise)
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')
    const oldLoad = partial.loadChildren({ kind: 'root' })

    partial.resetPartialScopes('model-b')
    response.resolve({ success: true, data: page([node('stale-a')]) })
    await oldLoad

    expect(state.value.nodes).toEqual([])
    expect(state.value.modelId).toBe('model-b')
    scope.stop()
  })

  it('keeps a failed child error local and retries only that scope', async () => {
    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({
        success: false,
        error: { status: 503, message: 'branch unavailable' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: page([node('child-1', 'parent-1')]),
      })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')

    await partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })
    expect(partial.childrenErrors.value.get('node:parent-1')).toBe('branch unavailable')
    expect(partial.childrenErrors.value.has('node:parent-2')).toBe(false)

    await partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })
    expect(fetchNodeChildren).toHaveBeenCalledTimes(2)
    expect(partial.childrenErrors.value.has('node:parent-1')).toBe(false)
    expect(state.value.nodes.map(row => row.id)).toEqual(['child-1'])
    scope.stop()
  })

  it('keeps local materialized rows when a remote child page is merged', async () => {
    vi.mocked(fetchNodeChildren).mockResolvedValue({
      success: true,
      data: page([node('remote-child', 'parent-1')]),
    })
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')
    state.value.nodes = [
      {
        ...node('local-new', 'parent-1'),
        parsedAttrs: {
          treeOrder: 0,
          notationComponents: {},
          componentProperties: {},
          typeProperties: {},
        },
        _isNew: true,
      },
    ]

    await partial.loadChildren({ kind: 'node', nodeId: 'parent-1' })

    expect(state.value.nodes.map(row => row.id).sort()).toEqual(['local-new', 'remote-child'])
    scope.stop()
  })

  it('aborts paging and rejects its stale result on reset', async () => {
    const response = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren).mockReturnValue(response.promise)
    const state = ref(createEmptyModelEditorState())
    const scope = effectScope()
    const partial = scope.run(() => useModelPartialStore(state))!
    partial.resetPartialScopes('model-a')
    const loading = partial.loadNextChildrenPage({ kind: 'node', nodeId: 'parent-1' })
    const signal = vi.mocked(fetchNodeChildren).mock.calls[0]?.[2]?.signal

    partial.resetPartialScopes('model-a')
    expect(signal?.aborted).toBe(true)
    response.resolve({ success: true, data: page([node('stale-child', 'parent-1')], 0) })
    await loading

    expect(state.value.nodes).toEqual([])
    expect(partial.childrenLoading.value.size).toBe(0)
    scope.stop()
  })
})
