import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiGet = vi.fn()

vi.mock('@/composables/useApi', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

let capturedOnMounted: (() => void) | null = null

vi.mock('vue', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    onMounted: vi.fn((fn: () => void) => {
      capturedOnMounted = fn
    }),
  }
})

import { useDashboard } from '@/composables/useDashboard'
import type { ModelData, NotationData } from '@/types/entities'
import type { NodeTypeResponse, LinkTypeResponse, DiagramResponse } from '@/types/api'

interface DashboardRecentDiagram {
  id: string
  name: string
  version: string
  modelId: string
  modelName: string
  updatedAt: string | null
}

function makeModel(id: string, name: string, updatedAt?: string): ModelData {
  return { id, name, version: '1.0.0', ownerId: 'u1', updatedAt }
}

function makeNotation(id: string, name: string, updatedAt?: string): NotationData {
  return { id, name, version: '1.0.0', ownerId: 'u1', updatedAt }
}

function makeNodeType(id: string, name: string): NodeTypeResponse {
  return { id, name, ownerId: 'u1' }
}

function makeLinkType(id: string, name: string): LinkTypeResponse {
  return { id, name, ownerId: 'u1' }
}

function makeDiagramResponse(
  id: string,
  name: string,
  modelId: string,
  updatedAt?: string,
): DiagramResponse {
  return {
    id,
    name,
    version: '1.0.0',
    ownerId: 'u1',
    modelId,
    notationId: 'n1',
    updatedAt,
  }
}

function makeRecentDiagram(
  id: string,
  name: string,
  modelId: string,
  modelName: string,
  updatedAt?: string,
): DashboardRecentDiagram {
  return { id, name, version: '1.0.0', modelId, modelName, updatedAt: updatedAt ?? null }
}

function mockDashboardSuccess(
  overrides: {
    stats?: { models: number; notations: number; nodeTypes: number; linkTypes: number }
    models?: ModelData[]
    notations?: NotationData[]
    diagrams?: DashboardRecentDiagram[]
  } = {},
) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.startsWith('/dashboard/stats')) {
      return Promise.resolve({
        success: true,
        data: overrides.stats ?? { models: 1, notations: 1, nodeTypes: 1, linkTypes: 1 },
      })
    }
    if (url.startsWith('/dashboard/recent')) {
      return Promise.resolve({
        success: true,
        data: {
          models: overrides.models ?? [],
          notations: overrides.notations ?? [],
          diagrams: overrides.diagrams ?? [],
        },
      })
    }
    return Promise.resolve({ success: true, data: { content: [] } })
  })
}

function mockAllSuccess(
  overrides: {
    models?: ModelData[]
    notations?: NotationData[]
    nodeTypes?: NodeTypeResponse[]
    linkTypes?: LinkTypeResponse[]
    diagrams?: DiagramResponse[]
  } = {},
) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.startsWith('/models'))
      return Promise.resolve({ success: true, data: { content: overrides.models ?? [] } })
    if (url.startsWith('/notations'))
      return Promise.resolve({ success: true, data: { content: overrides.notations ?? [] } })
    if (url.startsWith('/node-types'))
      return Promise.resolve({ success: true, data: { content: overrides.nodeTypes ?? [] } })
    if (url.startsWith('/link-types'))
      return Promise.resolve({ success: true, data: { content: overrides.linkTypes ?? [] } })
    if (url.startsWith('/diagrams'))
      return Promise.resolve({ success: true, data: { content: overrides.diagrams ?? [] } })
    return Promise.resolve({ success: true, data: { content: [] } })
  })
}

async function callLoadAll() {
  const fn = capturedOnMounted
  if (!fn) throw new Error('onMounted callback was not captured')
  await fn()
}

describe('useDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnMounted = null
    mockAllSuccess()
  })

  describe('stats computation', () => {
    it('counts unique names for models and notations', async () => {
      mockAllSuccess({
        models: [makeModel('1', 'Alpha'), makeModel('2', 'Alpha'), makeModel('3', 'Beta')],
        notations: [
          makeNotation('1', 'N-One'),
          makeNotation('2', 'N-One'),
          makeNotation('3', 'N-Two'),
          makeNotation('4', 'N-Three'),
        ],
        nodeTypes: [makeNodeType('1', 'NT1'), makeNodeType('2', 'NT2')],
        linkTypes: [makeLinkType('1', 'LT1')],
      })

      const { stats } = useDashboard()
      await callLoadAll()

      expect(stats.value).toEqual({
        models: 2,
        notations: 3,
        nodeTypes: 2,
        linkTypes: 1,
      })
    })
  })

  describe('totalVersions', () => {
    it('returns raw length counts for models and notations', async () => {
      mockAllSuccess({
        models: [makeModel('1', 'Alpha'), makeModel('2', 'Alpha'), makeModel('3', 'Beta')],
        notations: [makeNotation('1', 'N-One'), makeNotation('2', 'N-One')],
      })

      const { totalVersions } = useDashboard()
      await callLoadAll()

      expect(totalVersions.value).toEqual({
        models: 3,
        notations: 2,
      })
    })
  })

  describe('recentModels sorting', () => {
    it('returns top 5 models sorted by updatedAt descending', async () => {
      const models = [
        makeModel('1', 'M1', '2025-01-01T00:00:00Z'),
        makeModel('2', 'M2', '2025-07-01T00:00:00Z'),
        makeModel('3', 'M3', '2025-03-01T00:00:00Z'),
        makeModel('4', 'M4', '2025-12-01T00:00:00Z'),
        makeModel('5', 'M5', '2025-05-01T00:00:00Z'),
        makeModel('6', 'M6', '2025-09-01T00:00:00Z'),
        makeModel('7', 'M7', '2025-02-01T00:00:00Z'),
      ]
      mockAllSuccess({ models })

      const { recentModels } = useDashboard()
      await callLoadAll()

      expect(recentModels.value).toHaveLength(5)
      expect(recentModels.value.map((m) => m.id)).toEqual(['4', '6', '2', '5', '3'])
    })

    it('treats missing updatedAt as oldest', async () => {
      const models = [
        makeModel('1', 'M1', undefined),
        makeModel('2', 'M2', '2025-06-01T00:00:00Z'),
        makeModel('3', 'M3', '2025-01-01T00:00:00Z'),
      ]
      mockAllSuccess({ models })

      const { recentModels } = useDashboard()
      await callLoadAll()

      expect(recentModels.value.map((m) => m.id)).toEqual(['2', '3', '1'])
    })
  })

  describe('recentNotations sorting', () => {
    it('returns top 5 notations sorted by updatedAt descending', async () => {
      const notations = [
        makeNotation('1', 'N1', '2025-01-01T00:00:00Z'),
        makeNotation('2', 'N2', '2025-08-01T00:00:00Z'),
        makeNotation('3', 'N3', '2025-04-01T00:00:00Z'),
        makeNotation('4', 'N4', '2025-11-01T00:00:00Z'),
        makeNotation('5', 'N5', '2025-06-01T00:00:00Z'),
        makeNotation('6', 'N6', '2025-10-01T00:00:00Z'),
        makeNotation('7', 'N7', '2025-02-01T00:00:00Z'),
      ]
      mockAllSuccess({ notations })

      const { recentNotations } = useDashboard()
      await callLoadAll()

      expect(recentNotations.value).toHaveLength(5)
      expect(recentNotations.value.map((n) => n.id)).toEqual(['4', '6', '2', '5', '3'])
    })
  })

  describe('loadAll API calls', () => {
    it('calls all API endpoints with correct query params', async () => {
      mockAllSuccess()

      useDashboard()
      await callLoadAll()

      expect(mockApiGet).toHaveBeenCalledTimes(7)
      expect(mockApiGet).toHaveBeenCalledWith('/dashboard/stats')
      expect(mockApiGet).toHaveBeenCalledWith('/dashboard/recent?limit=5')
      expect(mockApiGet).toHaveBeenCalledWith('/models?page=0&size=50')
      expect(mockApiGet).toHaveBeenCalledWith('/notations?page=0&size=50')
      expect(mockApiGet).toHaveBeenCalledWith('/node-types?page=0&size=50')
      expect(mockApiGet).toHaveBeenCalledWith('/link-types?page=0&size=50')
      expect(mockApiGet).toHaveBeenCalledWith('/diagrams?page=0&size=5')
      expect(mockApiGet).not.toHaveBeenCalledWith('/audit-log?page=0&size=20')
    })

    it('sets isLoading to false after completion', async () => {
      mockAllSuccess()

      const { isLoading } = useDashboard()
      expect(isLoading.value).toBe(true)

      await callLoadAll()

      expect(isLoading.value).toBe(false)
    })
  })

  describe('dashboard recent happy path', () => {
    it('reads diagrams from /dashboard/recent and does not hit fallback lists', async () => {
      mockDashboardSuccess({
        diagrams: [makeRecentDiagram('d1', 'Landscape', 'm1', 'Enterprise', '2026-08-01T00:00:00Z')],
        models: [makeModel('m1', 'Enterprise', '2026-08-01T00:00:00Z')],
      })
      const { recentDiagrams, recentModels } = useDashboard()
      await callLoadAll()
      expect(recentDiagrams.value).toHaveLength(1)
      expect(recentDiagrams.value[0]).toMatchObject({
        id: 'd1',
        name: 'Landscape',
        modelId: 'm1',
        modelName: 'Enterprise',
      })
      expect(recentModels.value.map((m) => m.id)).toEqual(['m1'])
      expect(mockApiGet).toHaveBeenCalledTimes(2)
      expect(mockApiGet).not.toHaveBeenCalledWith(expect.stringMatching(/^\/diagrams/))
    })
  })

  describe('recentDiagrams fallback', () => {
    it('maps /diagrams and resolves modelName from loaded models', async () => {
      mockAllSuccess({
        models: [makeModel('m1', 'Enterprise', '2026-08-01T00:00:00Z')],
        diagrams: [makeDiagramResponse('d1', 'Landscape', 'm1', '2026-08-02T00:00:00Z')],
      })
      const { recentDiagrams } = useDashboard()
      await callLoadAll()
      expect(recentDiagrams.value[0]).toMatchObject({
        id: 'd1',
        name: 'Landscape',
        modelId: 'm1',
        modelName: 'Enterprise',
      })
    })
  })

  describe('handles API failures gracefully', () => {
    it('populates successful responses and ignores failed ones', async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url.startsWith('/models'))
          return Promise.resolve({
            success: true,
            data: { content: [makeModel('1', 'Alpha')] },
          })
        if (url.startsWith('/notations'))
          return Promise.resolve({
            success: false,
            error: { status: 500, message: 'Server error' },
          })
        if (url.startsWith('/node-types'))
          return Promise.resolve({
            success: true,
            data: { content: [makeNodeType('1', 'NT1')] },
          })
        if (url.startsWith('/link-types'))
          return Promise.resolve({
            success: false,
            error: { status: 404, message: 'Not found' },
          })
        if (url.startsWith('/diagrams'))
          return Promise.resolve({
            success: true,
            data: { content: [makeDiagramResponse('d1', 'Landscape', 'm1', '2025-01-01T00:00:00Z')] },
          })
        return Promise.resolve({ success: true, data: { content: [] } })
      })

      const { stats, totalVersions, recentDiagrams, isLoading } = useDashboard()
      await callLoadAll()

      expect(isLoading.value).toBe(false)
      expect(stats.value.models).toBe(1)
      expect(stats.value.notations).toBe(0)
      expect(stats.value.nodeTypes).toBe(1)
      expect(stats.value.linkTypes).toBe(0)
      expect(totalVersions.value.notations).toBe(0)
      expect(recentDiagrams.value).toHaveLength(1)
    })
  })
})
