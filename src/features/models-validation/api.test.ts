import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost } from '@/composables/useApi'
import {
  fetchMergeLinksPreview,
  fetchMergeNodesPreview,
  fetchValidationReport,
  mergeLinks,
  mergeNodes,
} from './api'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

const sampleReport = {
  modelId: 'm1',
  generatedAt: '2026-08-22T12:00:00.000Z',
  duplicateNodes: [
    {
      nodeTypeId: 'nt1',
      nodeTypeName: 'Application',
      name: 'CRM',
      count: 2,
      nodes: [
        { id: 'n1', name: 'CRM', parentId: 'p1', parentName: 'Apps' },
        { id: 'n2', name: 'CRM', parentId: null, parentName: null },
      ],
    },
  ],
  duplicateLinks: [
    {
      sourceId: 'n1',
      sourceName: 'CRM',
      targetId: 'n3',
      targetName: 'ERP',
      linkTypeId: 'lt1',
      linkTypeName: 'Serving',
      count: 2,
      links: [{ id: 'l1' }, { id: 'l2' }],
    },
  ],
}

const sampleNodesPreview = {
  keepId: 'a',
  dropId: 'b',
  keepTypeProperties: { owner: 'keep' },
  dropTypeProperties: { owner: 'drop' },
  uniqueLinks: [
    {
      id: 'l1',
      linkTypeId: 'lt1',
      linkTypeName: 'Serving',
      direction: 'out',
      otherNodeId: 'n3',
      otherNodeName: 'ERP',
    },
  ],
  linksToDelete: [],
  keepDiagrams: [{ diagramId: 'd1', diagramName: 'Landscape' }],
  dropDiagrams: [],
  hasChildren: false,
  hasDocuments: false,
  diagramsToReparentCount: 0,
  keepUpdatedAt: '2026-08-22T12:00:00.000Z',
  dropUpdatedAt: '2026-08-22T12:01:00.000Z',
}

const sampleLinksPreview = {
  keepId: 'a',
  dropId: 'b',
  keepTypeProperties: { note: 'keep' },
  dropTypeProperties: { note: 'drop' },
  keepDiagrams: [{ diagramId: 'd1', diagramName: 'Landscape' }],
  dropDiagrams: [],
  keepUpdatedAt: '2026-08-22T12:00:00.000Z',
  dropUpdatedAt: '2026-08-22T12:01:00.000Z',
}

describe('models-validation api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches report', async () => {
    vi.mocked(apiGet).mockResolvedValue({ success: true, data: sampleReport })
    const result = await fetchValidationReport('m1')
    expect(apiGet).toHaveBeenCalledWith('/models/m1/validation-report')
    expect(result.success && result.data.duplicateNodes).toHaveLength(1)
  })

  it('fetches merge-nodes preview', async () => {
    vi.mocked(apiGet).mockResolvedValue({ success: true, data: sampleNodesPreview })
    const result = await fetchMergeNodesPreview('m1', { keepId: 'a', dropId: 'b' })
    expect(apiGet).toHaveBeenCalledWith(
      '/models/m1/validation/merge-nodes-preview?keepId=a&dropId=b'
    )
    expect(result.success && result.data.uniqueLinks).toHaveLength(1)
  })

  it('fetches merge-links preview', async () => {
    vi.mocked(apiGet).mockResolvedValue({ success: true, data: sampleLinksPreview })
    const result = await fetchMergeLinksPreview('m1', { keepId: 'a', dropId: 'b' })
    expect(apiGet).toHaveBeenCalledWith(
      '/models/m1/validation/merge-links-preview?keepId=a&dropId=b'
    )
    expect(result.success && result.data.keepId).toBe('a')
  })

  it('posts merge-nodes with typeProperties, transferLinkIds and timestamps', async () => {
    const body = {
      keepId: 'a',
      dropId: 'b',
      typeProperties: { owner: 'keep' },
      transferLinkIds: ['l1', 'l2'],
      keepUpdatedAt: '2026-08-22T12:00:00.000Z',
      dropUpdatedAt: '2026-08-22T12:01:00.000Z',
    }
    vi.mocked(apiPost).mockResolvedValue({ success: true, data: { keepId: 'a', dropId: 'b' } })
    await mergeNodes('m1', body)
    expect(apiPost).toHaveBeenCalledWith('/models/m1/validation/merge-nodes', body)
  })

  it('posts merge-links without transferLinkIds', async () => {
    const body = {
      keepId: 'a',
      dropId: 'b',
      typeProperties: { note: 'keep' },
      keepUpdatedAt: '2026-08-22T12:00:00.000Z',
      dropUpdatedAt: '2026-08-22T12:01:00.000Z',
    }
    vi.mocked(apiPost).mockResolvedValue({ success: true, data: { keepId: 'a', dropId: 'b' } })
    await mergeLinks('m1', body)
    expect(apiPost).toHaveBeenCalledWith('/models/m1/validation/merge-links', body)
  })
})
