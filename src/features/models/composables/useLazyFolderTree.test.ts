import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeResponse } from '@/types/api'
import type { PaginatedResponse } from '@/types/entities'
import { fetchNodeChildren } from './modelScopedApi'
import { useLazyFolderTree } from './useLazyFolderTree'

vi.mock('./modelScopedApi', () => ({
  fetchNodeChildren: vi.fn(),
}))

const folder = (id: string, parentNodeId: string | null, hasChildren = false): NodeResponse =>
  ({
    id,
    name: id,
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeTypeId: 'directory',
    parentNodeId,
    hasChildren,
  }) as NodeResponse

const page = (
  content: NodeResponse[],
  pageNumber = 0,
  totalPages = 1
): PaginatedResponse<NodeResponse> => ({
  content,
  page: { number: pageNumber, size: 2, totalElements: content.length, totalPages },
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useLazyFolderTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads root folders and only direct children when a folder expands', async () => {
    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({
        success: true,
        data: page([folder('folder-a', null, true)]),
      })
      .mockResolvedValueOnce({
        success: true,
        data: page([folder('folder-b', 'folder-a')]),
      })
    const tree = useLazyFolderTree()

    tree.setModel('model-1')
    await tree.loadRoot()
    expect(tree.visibleRows.value.map(row => [row.node.id, row.depth])).toEqual([
      ['folder-a', 0],
    ])

    await tree.toggleFolder('folder-a')

    expect(fetchNodeChildren).toHaveBeenNthCalledWith(
      1,
      'model-1',
      { kind: 'root' },
      expect.objectContaining({ page: 0, size: 500, foldersOnly: true })
    )
    expect(fetchNodeChildren).toHaveBeenNthCalledWith(
      2,
      'model-1',
      { kind: 'node', nodeId: 'folder-a' },
      expect.objectContaining({ page: 0, size: 500, foldersOnly: true })
    )
    expect(tree.visibleRows.value.map(row => [row.node.id, row.depth])).toEqual([
      ['folder-a', 0],
      ['folder-b', 1],
    ])
  })

  it('keeps load-more state local to its parent scope', async () => {
    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({
        success: true,
        data: page([folder('folder-a', null)], 0, 2),
      })
      .mockResolvedValueOnce({
        success: true,
        data: page([folder('folder-b', null)], 1, 2),
      })
    const tree = useLazyFolderTree()
    tree.setModel('model-1')

    await tree.loadRoot()
    expect(tree.scopes.value.get('root')).toMatchObject({ nextPage: 1, hasMore: true })

    await tree.loadMore({ kind: 'root' })

    expect(tree.visibleRows.value.map(row => row.node.id)).toEqual(['folder-a', 'folder-b'])
    expect(tree.scopes.value.get('root')).toMatchObject({ nextPage: 2, hasMore: false })
  })

  it('ignores a stale response after the target model changes', async () => {
    const oldRequest = deferred<Awaited<ReturnType<typeof fetchNodeChildren>>>()
    vi.mocked(fetchNodeChildren)
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({
        success: true,
        data: page([folder('new-folder', null)]),
      })
    const tree = useLazyFolderTree()

    tree.setModel('old-model')
    const oldLoad = tree.loadRoot()
    tree.setModel('new-model')
    await tree.loadRoot()
    oldRequest.resolve({
      success: true,
      data: page([folder('old-folder', null)]),
    })
    await oldLoad

    expect(tree.visibleRows.value.map(row => row.node.id)).toEqual(['new-folder'])
  })

  it('keeps child loading errors local and retryable', async () => {
    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({
        success: true,
        data: page([folder('folder-a', null, true)]),
      })
      .mockResolvedValueOnce({
        success: false,
        error: { message: 'child failed' },
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: page([folder('folder-b', 'folder-a')]),
      })
    const tree = useLazyFolderTree()
    tree.setModel('model-1')
    await tree.loadRoot()

    await tree.toggleFolder('folder-a')

    expect(tree.scopes.value.get('node:folder-a')?.error).toBe('child failed')
    expect(tree.scopes.value.get('root')?.error).toBeNull()

    await tree.retry({ kind: 'node', nodeId: 'folder-a' })

    expect(tree.scopes.value.get('node:folder-a')?.error).toBeNull()
    expect(tree.visibleRows.value.map(row => row.node.id)).toEqual(['folder-a', 'folder-b'])
  })

  it('caches a successfully loaded empty child scope across repeated expands', async () => {
    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({
        success: true,
        data: page([folder('empty-folder', null, true)]),
      })
      .mockResolvedValue({
        success: true,
        data: page([]),
      })
    const tree = useLazyFolderTree()
    tree.setModel('model-1')
    await tree.loadRoot()

    await tree.toggleFolder('empty-folder')
    await tree.toggleFolder('empty-folder')
    await tree.toggleFolder('empty-folder')

    expect(fetchNodeChildren).toHaveBeenCalledTimes(2)
    expect(tree.scopes.value.get('node:empty-folder')).toMatchObject({
      rows: [],
      nextPage: 1,
      hasMore: false,
      error: null,
      expanded: true,
    })
  })

  it('retries a failed next page without discarding earlier folders', async () => {
    vi.mocked(fetchNodeChildren)
      .mockResolvedValueOnce({
        success: true,
        data: page([folder('folder-a', null)], 0, 2),
      })
      .mockResolvedValueOnce({
        success: false,
        error: { message: 'page failed' },
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: page([folder('folder-b', null)], 1, 2),
      })
    const tree = useLazyFolderTree()
    tree.setModel('model-1')
    await tree.loadRoot()
    await tree.loadMore({ kind: 'root' })

    expect(tree.visibleRows.value.map(row => row.node.id)).toEqual(['folder-a'])
    expect(tree.scopes.value.get('root')).toMatchObject({
      error: 'page failed',
      nextPage: 1,
    })

    await tree.retry({ kind: 'root' })

    expect(fetchNodeChildren).toHaveBeenLastCalledWith(
      'model-1',
      { kind: 'root' },
      expect.objectContaining({ page: 1, size: 500, foldersOnly: true })
    )
    expect(tree.visibleRows.value.map(row => row.node.id)).toEqual(['folder-a', 'folder-b'])
  })

  it('does not reload a known-empty root or reset the same target model', async () => {
    vi.mocked(fetchNodeChildren).mockResolvedValue({
      success: true,
      data: page([]),
    })
    const tree = useLazyFolderTree()
    tree.setModel('model-1')

    await tree.loadRoot()
    tree.setModel('model-1')
    await tree.loadRoot()

    expect(fetchNodeChildren).toHaveBeenCalledTimes(1)
    expect(tree.scopes.value.get('root')).toMatchObject({
      rows: [],
      hasMore: false,
      error: null,
    })
  })
})
