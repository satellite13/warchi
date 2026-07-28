import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAllPages } from './fetchAllPages'

const apiGet = vi.fn()

vi.mock('@/composables/useApi', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
}))

describe('fetchAllPages', () => {
  beforeEach(() => {
    apiGet.mockReset()
  })

  it('returns single page content', async () => {
    apiGet.mockResolvedValueOnce({
      success: true,
      data: { content: [{ id: 'a' }], totalPages: 1, last: true },
    })

    const result = await fetchAllPages<{ id: string }>('/items', { foo: 'bar' }, {
      pageSize: 10,
      errorLabel: 'items',
    })

    expect(result).toEqual([{ id: 'a' }])
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(String(apiGet.mock.calls[0]?.[0])).toContain('foo=bar')
  })

  it('fetches remaining pages sequentially', async () => {
    apiGet
      .mockResolvedValueOnce({
        success: true,
        data: { content: [{ id: '1' }], totalPages: 2, last: false },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { content: [{ id: '2' }], totalPages: 2, last: true },
      })

    const result = await fetchAllPages<{ id: string }>('/items', undefined, { pageSize: 1 })
    expect(result.map(item => item.id)).toEqual(['1', '2'])
    expect(apiGet).toHaveBeenCalledTimes(2)
  })

  it('fetches remaining pages in parallel when requested', async () => {
    apiGet
      .mockResolvedValueOnce({
        success: true,
        data: { content: [{ id: '1' }], totalPages: 3, last: false },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { content: [{ id: '2' }], totalPages: 3, last: false },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { content: [{ id: '3' }], totalPages: 3, last: true },
      })

    const result = await fetchAllPages<{ id: string }>('/items', undefined, {
      pageSize: 1,
      parallel: true,
    })
    expect(result.map(item => item.id)).toEqual(['1', '2', '3'])
    expect(apiGet).toHaveBeenCalledTimes(3)
  })
})
