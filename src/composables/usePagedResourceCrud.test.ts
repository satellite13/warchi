import { describe, it, expect, vi, beforeEach } from 'vitest'

const { apiGet, apiPost, apiPut, apiDelete } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('./useApi', () => ({
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
}))

import { usePagedResourceCrud } from './usePagedResourceCrud'

type Item = { id: string; name: string }
type Create = { name: string }
type Update = { name: string }

describe('usePagedResourceCrud', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchList populates list and totalElements', async () => {
    apiGet.mockResolvedValue({
      success: true,
      data: { content: [{ id: '1', name: 'A' }], totalElements: 1 },
    })
    const crud = usePagedResourceCrud<Item, Item, Create, Update>({ basePath: '/things' })
    const ok = await crud.fetchList({ size: 50 })
    expect(ok).toBe(true)
    expect(apiGet).toHaveBeenCalledWith('/things?page=0&size=50')
    expect(crud.list.value).toEqual([{ id: '1', name: 'A' }])
    expect(crud.totalElements.value).toBe(1)
  })

  it('fetchList respects beforeUpdate and onListLoaded', async () => {
    apiGet.mockResolvedValue({
      success: true,
      data: { content: [{ id: '1', name: 'A' }], totalElements: 1 },
    })
    const onListLoaded = vi.fn()
    const crud = usePagedResourceCrud<Item, Item, Create, Update>({
      basePath: '/things',
      beforeUpdate: () => false,
      onListLoaded,
    })
    const ok = await crud.fetchList()
    expect(ok).toBe(false)
    expect(onListLoaded).not.toHaveBeenCalled()
    expect(crud.list.value).toEqual([])
  })

  it('create/update/remove call afterMutation', async () => {
    const afterMutation = vi.fn()
    const crud = usePagedResourceCrud<Item, Item, Create, Update>({
      basePath: '/things',
      afterMutation,
    })

    apiPost.mockResolvedValue({ success: true, data: { id: '1', name: 'A' } })
    await crud.create({ name: 'A' })
    expect(afterMutation).toHaveBeenCalledWith('create', { id: '1', name: 'A' })

    apiPut.mockResolvedValue({ success: true, data: { id: '1', name: 'B' } })
    await crud.update('1', { name: 'B' })
    expect(afterMutation).toHaveBeenCalledWith('update', { id: '1', name: 'B' })

    apiDelete.mockResolvedValue({ success: true, data: null })
    await crud.remove('1')
    expect(afterMutation).toHaveBeenCalledWith('remove', null)
  })

  it('fetchById returns null on error', async () => {
    apiGet.mockResolvedValue({
      success: false,
      error: { status: 404, message: 'missing' },
    })
    const crud = usePagedResourceCrud<Item, Item, Create, Update>({ basePath: '/things' })
    const detail = await crud.fetchById('x')
    expect(detail).toBeNull()
    expect(crud.error.value).toBe('missing')
  })
})
