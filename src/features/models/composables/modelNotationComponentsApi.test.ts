import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/composables/useApi'
import { fetchAllComponentsByNotationIds } from './modelNotationComponentsApi'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

const ok = <T>(data: T) => ({ success: true as const, data })
const page = <T>(content: T[], meta?: { last?: boolean; totalPages?: number }) => ({
  content,
  last: meta?.last ?? true,
  totalPages: meta?.totalPages ?? 1,
})

describe('fetchAllComponentsByNotationIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pages through all components for each notation', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(
        ok(page([{ id: 'c1', notationId: 'n1' }], { last: false, totalPages: 2 }))
      )
      .mockResolvedValueOnce(ok(page([{ id: 'c2', notationId: 'n1' }], { last: true, totalPages: 2 })))

    const result = await fetchAllComponentsByNotationIds(['n1'], { modelId: 'model-1' })

    expect(result.map(item => item.id)).toEqual(['c1', 'c2'])
    expect(apiGet).toHaveBeenCalledTimes(2)
    expect(String(vi.mocked(apiGet).mock.calls[0]?.[0])).toContain('notationId=n1')
    expect(String(vi.mocked(apiGet).mock.calls[0]?.[0])).toContain('modelId=model-1')
    expect(String(vi.mocked(apiGet).mock.calls[1]?.[0])).toContain('page=1')
  })
})
