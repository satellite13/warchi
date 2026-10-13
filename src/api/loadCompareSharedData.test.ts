import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiGet = vi.fn()

vi.mock('@/composables/useApi', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('@/api/queryHelpers', () => ({
  listParams: vi.fn(() => new URLSearchParams({ size: '1000' })),
}))

import { loadCompareSharedData } from './loadCompareSharedData'

describe('loadCompareSharedData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('success scenarios', () => {
    it('returns all four collections when all requests succeed', async () => {
      const notationsData = {
        content: [{ id: 'n1', name: 'Test', version: '1.0.0', ownerId: 'o1' }],
      }
      const componentsData = {
        content: [
          {
            id: 'c1',
            name: 'C1',
            version: '1.0.0',
            ownerId: 'o1',
            notationId: 'n1',
            nodeTypeId: 't1',
          },
        ],
      }
      const relationsData = {
        content: [
          {
            id: 'r1',
            name: 'R1',
            version: '1.0.0',
            ownerId: 'o1',
            notationId: 'n1',
            linkTypeId: 'lt1',
          },
        ],
      }
      const rulesData = {
        content: [
          {
            id: 'rr1',
            name: 'Rule',
            version: '1.0.0',
            ownerId: 'o1',
            notationId: 'n1',
            relationId: 'r1',
            sourceComponents: [],
            targetComponents: [],
          },
        ],
      }

      mockApiGet
        .mockResolvedValueOnce({ success: true, data: notationsData })
        .mockResolvedValueOnce({ success: true, data: componentsData })
        .mockResolvedValueOnce({ success: true, data: relationsData })
        .mockResolvedValueOnce({ success: true, data: rulesData })

      const result = await loadCompareSharedData()

      expect(result).toEqual({
        notations: notationsData.content,
        components: componentsData.content,
        relations: relationsData.content,
        relationRules: rulesData.content,
      })
      expect(mockApiGet).toHaveBeenCalledTimes(4)
    })

    it('makes requests in parallel (all URLs called)', async () => {
      mockApiGet
        .mockResolvedValueOnce({ success: true, data: { content: [] } })
        .mockResolvedValueOnce({ success: true, data: { content: [] } })
        .mockResolvedValueOnce({ success: true, data: { content: [] } })
        .mockResolvedValueOnce({ success: true, data: { content: [] } })

      await loadCompareSharedData()

      const calls = mockApiGet.mock.calls.map((c: unknown[]) => c[0] as string)
      expect(calls).toContainEqual(expect.stringContaining('/notations'))
      expect(calls).toContainEqual(expect.stringContaining('/components'))
      expect(calls).toContainEqual(expect.stringContaining('/relations'))
      expect(calls).toContainEqual(expect.stringContaining('/relation-rules'))
    })

    it('handles empty content arrays', async () => {
      mockApiGet
        .mockResolvedValueOnce({ success: true, data: { content: [] } })
        .mockResolvedValueOnce({ success: true, data: { content: [] } })
        .mockResolvedValueOnce({ success: true, data: { content: [] } })
        .mockResolvedValueOnce({ success: true, data: { content: [] } })

      const result = await loadCompareSharedData()

      expect(result.notations).toEqual([])
      expect(result.components).toEqual([])
      expect(result.relations).toEqual([])
      expect(result.relationRules).toEqual([])
    })

    it('handles null content', async () => {
      mockApiGet
        .mockResolvedValueOnce({ success: true, data: { content: null } })
        .mockResolvedValueOnce({ success: true, data: { content: null } })
        .mockResolvedValueOnce({ success: true, data: { content: null } })
        .mockResolvedValueOnce({ success: true, data: { content: null } })

      const result = await loadCompareSharedData()

      expect(result.notations).toEqual([])
      expect(result.components).toEqual([])
      expect(result.relations).toEqual([])
      expect(result.relationRules).toEqual([])
    })

    it('handles missing content field', async () => {
      mockApiGet
        .mockResolvedValueOnce({ success: true, data: {} })
        .mockResolvedValueOnce({ success: true, data: {} })
        .mockResolvedValueOnce({ success: true, data: {} })
        .mockResolvedValueOnce({ success: true, data: {} })

      const result = await loadCompareSharedData()

      expect(result.notations).toEqual([])
      expect(result.components).toEqual([])
      expect(result.relations).toEqual([])
      expect(result.relationRules).toEqual([])
    })
  })

  describe('partial success scenarios', () => {
    it('returns empty for failed individual requests', async () => {
      mockApiGet
        .mockResolvedValueOnce({ success: true, data: { content: [{ id: 'n1' }] } })
        .mockResolvedValueOnce({ success: false, error: { message: 'err' } })
        .mockResolvedValueOnce({ success: true, data: { content: [{ id: 'r1' }] } })
        .mockResolvedValueOnce({ success: false, error: { message: 'err2' } })

      const result = await loadCompareSharedData()

      expect(result.notations).toEqual([{ id: 'n1' }])
      expect(result.components).toEqual([])
      expect(result.relations).toEqual([{ id: 'r1' }])
      expect(result.relationRules).toEqual([])
    })

    it('returns all empty when all requests fail', async () => {
      mockApiGet
        .mockResolvedValueOnce({ success: false, error: { message: 'e1' } })
        .mockResolvedValueOnce({ success: false, error: { message: 'e2' } })
        .mockResolvedValueOnce({ success: false, error: { message: 'e3' } })
        .mockResolvedValueOnce({ success: false, error: { message: 'e4' } })

      const result = await loadCompareSharedData()

      expect(result).toEqual({
        notations: [],
        components: [],
        relations: [],
        relationRules: [],
      })
    })

    it('throws when data is null within success response (edge case)', async () => {
      mockApiGet
        .mockResolvedValueOnce({ success: true, data: null })
        .mockResolvedValueOnce({ success: true, data: null })
        .mockResolvedValueOnce({ success: true, data: null })
        .mockResolvedValueOnce({ success: true, data: null })

      await expect(loadCompareSharedData()).rejects.toThrow()
    })
  })

  describe('URL construction', () => {
    it('uses query params in request URLs', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: { content: [] } })

      await loadCompareSharedData()

      expect(mockApiGet.mock.calls[0][0]).toContain('size=')
    })
  })
})
