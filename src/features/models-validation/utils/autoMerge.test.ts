import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  autoMergeDuplicates,
  fillEmptyProps,
  typePropertiesEqual,
  type AutoMergeOptions,
} from './autoMerge'
import type {
  DuplicateLinkGroup,
  DuplicateNodeGroup,
  MergeLinksPreview,
  MergeNodesPreview,
} from '../types'

vi.mock('../api', () => ({
  fetchMergeNodesPreview: vi.fn(),
  fetchMergeLinksPreview: vi.fn(),
  mergeNodes: vi.fn(),
  mergeLinks: vi.fn(),
  saveOefMergeDecisions: vi.fn(),
}))

import {
  fetchMergeLinksPreview,
  fetchMergeNodesPreview,
  mergeLinks,
  mergeNodes,
  saveOefMergeDecisions,
} from '../api'
import { apiGet } from '@/composables/useApi'
import { mergeNodesWithOefDecision } from './persistOefMergeDecision'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

const mockedApiGet = vi.mocked(apiGet)
const mockedSaveDecisions = vi.mocked(saveOefMergeDecisions)

const mockedPreviewNodes = vi.mocked(fetchMergeNodesPreview)
const mockedPreviewLinks = vi.mocked(fetchMergeLinksPreview)
const mockedMergeNodes = vi.mocked(mergeNodes)
const mockedMergeLinks = vi.mocked(mergeLinks)

function nodePreview(overrides: Partial<MergeNodesPreview>): {
  success: true
  data: MergeNodesPreview
} {
  return {
    success: true,
    data: {
      keepId: 'keep',
      dropId: 'drop',
      keepTypeProperties: {},
      dropTypeProperties: {},
      uniqueLinks: [],
      linksToDelete: [],
      keepDiagrams: [],
      dropDiagrams: [],
      hasChildren: false,
      hasDocuments: false,
      diagramsToReparentCount: 0,
      keepUpdatedAt: 'k1',
      dropUpdatedAt: 'd1',
      ...overrides,
    },
  }
}

function nodeGroup(members: Array<{ id: string; diagramCount?: number }>): DuplicateNodeGroup {
  return {
    nodeTypeId: 'nt',
    nodeTypeName: 'Type',
    name: 'Group A',
    count: members.length,
    nodes: members.map(m => ({
      id: m.id,
      name: m.id,
      parentId: null,
      parentName: null,
      diagramCount: m.diagramCount,
    })),
  }
}

function linkGroup(ids: Array<{ id: string; diagramCount?: number }>): DuplicateLinkGroup {
  return {
    sourceId: 's',
    sourceName: 'S',
    targetId: 't',
    targetName: 'T',
    linkTypeId: 'lt',
    linkTypeName: 'LT',
    count: ids.length,
    links: ids,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('typePropertiesEqual', () => {
  it('treats missing values as equal', () => {
    expect(typePropertiesEqual({}, { productId: undefined })).toBe(true)
    expect(typePropertiesEqual({ productId: '' }, { productId: undefined })).toBe(true)
    expect(typePropertiesEqual({ productId: 'P1' }, { productId: 'P1' })).toBe(true)
  })

  it('detects differing values', () => {
    expect(typePropertiesEqual({}, { productId: 'P0335' })).toBe(false)
    expect(typePropertiesEqual({ a: 1 }, { a: 2 })).toBe(false)
  })
})

describe('fillEmptyProps', () => {
  it('fills empty keep values from the dropped copy', () => {
    expect(
      fillEmptyProps(
        { a: 'keep', b: '', c: undefined },
        { a: 'drop', b: 'drop', c: 'drop', d: 'drop' }
      )
    ).toEqual({ a: 'keep', b: 'drop', c: 'drop', d: 'drop' })
  })
})

describe('autoMergeDuplicates options', () => {
  const baseOptions: AutoMergeOptions = {
    includeLinks: true,
    propsPolicy: 'skip',
    childrenPolicy: 'skip',
  }

  it('fills empty properties when propsPolicy is fillEmpty', async () => {
    mockedPreviewNodes.mockResolvedValue(
      nodePreview({
        keepTypeProperties: { productId: '', ownerId: 'x' },
        dropTypeProperties: { productId: 'P0335', ownerId: 'y' },
      })
    )
    mockedMergeNodes.mockResolvedValue({ success: true, data: { keepId: 'keep', dropId: 'drop' } })

    const result = await autoMergeDuplicates({
      modelId: 'm1',
      nodeGroups: [nodeGroup([{ id: 'a' }, { id: 'b' }])],
      linkGroups: [],
      options: { ...baseOptions, propsPolicy: 'fillEmpty' },
    })

    expect(result.mergedGroups).toBe(1)
    expect(mockedMergeNodes).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ typeProperties: { productId: 'P0335', ownerId: 'x' } })
    )
  })

  it('passes reparentChildren when childrenPolicy is reparent', async () => {
    mockedPreviewNodes.mockResolvedValue(nodePreview({ hasChildren: true }))
    mockedMergeNodes.mockResolvedValue({ success: true, data: { keepId: 'keep', dropId: 'drop' } })

    const result = await autoMergeDuplicates({
      modelId: 'm1',
      nodeGroups: [nodeGroup([{ id: 'a' }, { id: 'b' }])],
      linkGroups: [],
      options: { ...baseOptions, childrenPolicy: 'reparent' },
    })

    expect(result.mergedGroups).toBe(1)
    expect(mockedMergeNodes).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ reparentChildren: true })
    )
  })

  it('ignores link groups when includeLinks is false', async () => {
    mockedPreviewNodes.mockResolvedValue(nodePreview({}))
    mockedMergeNodes.mockResolvedValue({ success: true, data: { keepId: 'keep', dropId: 'drop' } })

    const result = await autoMergeDuplicates({
      modelId: 'm1',
      nodeGroups: [nodeGroup([{ id: 'a' }, { id: 'b' }])],
      linkGroups: [linkGroup([{ id: 'l1' }, { id: 'l2' }])],
      options: { ...baseOptions, includeLinks: false },
    })

    expect(result.mergedGroups).toBe(1)
    expect(mockedPreviewLinks).not.toHaveBeenCalled()
    expect(mockedMergeLinks).not.toHaveBeenCalled()
  })
})

describe('autoMergeDuplicates', () => {
  it('merges into the most-used copy and transfers unique links', async () => {
    mockedPreviewNodes.mockResolvedValue(
      nodePreview({
        keepTypeProperties: { ownerId: 'x' },
        dropTypeProperties: { ownerId: 'x' },
        uniqueLinks: [
          {
            id: 'l1',
            linkTypeId: 'lt',
            linkTypeName: 'LT',
            direction: 'in',
            otherNodeId: 'o',
            otherNodeName: 'O',
          },
        ],
      })
    )
    mockedMergeNodes.mockResolvedValue({ success: true, data: { keepId: 'keep', dropId: 'drop' } })

    const result = await autoMergeDuplicates({
      modelId: 'm1',
      nodeGroups: [
        nodeGroup([
          { id: 'rare', diagramCount: 1 },
          { id: 'popular', diagramCount: 7 },
        ]),
      ],
      linkGroups: [],
    })

    expect(result.mergedGroups).toBe(1)
    expect(mockedMergeNodes).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({
        keepId: 'popular',
        dropId: 'rare',
        transferLinkIds: ['l1'],
        keepUpdatedAt: 'k1',
      })
    )
  })

  it('persists the OEF merge decision read before the drop node is deleted', async () => {
    mockedApiGet.mockResolvedValue({
      success: true,
      data: { attrs: JSON.stringify({ oef: { entityId: 'elem-42', properties: {} } }) },
    } as never)
    mockedSaveDecisions.mockResolvedValue({ success: true, data: { saved: 1 } } as never)
    mockedMergeNodes.mockResolvedValue({ success: true, data: { keepId: 'keep', dropId: 'drop' } })

    const result = await mergeNodesWithOefDecision('m1', {
      keepId: 'keep',
      dropId: 'drop',
      typeProperties: {},
      transferLinkIds: [],
      keepUpdatedAt: 'k1',
      dropUpdatedAt: 'd1',
    })

    expect(result.success).toBe(true)
    expect(mockedSaveDecisions).toHaveBeenCalledWith('m1', {
      decisions: [{ oefEntityId: 'elem-42', targetNodeId: 'keep' }],
    })
  })

  it('does not persist a decision when the merge fails', async () => {
    mockedApiGet.mockResolvedValue({
      success: true,
      data: { attrs: JSON.stringify({ oef: { entityId: 'elem-42', properties: {} } }) },
    } as never)
    mockedMergeNodes.mockResolvedValue({
      success: false,
      error: { message: 'Concurrent modification', status: 409 },
    })

    await mergeNodesWithOefDecision('m1', {
      keepId: 'keep',
      dropId: 'drop',
      typeProperties: {},
      transferLinkIds: [],
      keepUpdatedAt: 'k1',
      dropUpdatedAt: 'd1',
    })

    expect(mockedSaveDecisions).not.toHaveBeenCalled()
  })

  it('skips groups with differing properties without aborting the run', async () => {
    mockedPreviewNodes.mockResolvedValue(
      nodePreview({ keepTypeProperties: {}, dropTypeProperties: { productId: 'P0335' } })
    )

    const result = await autoMergeDuplicates({
      modelId: 'm1',
      nodeGroups: [nodeGroup([{ id: 'a' }, { id: 'b' }])],
      linkGroups: [],
    })

    expect(result.mergedGroups).toBe(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]?.reason).toBe('propsDiffer')
    expect(mockedMergeNodes).not.toHaveBeenCalled()
  })

  it('skips members with children or documents', async () => {
    mockedPreviewNodes
      .mockResolvedValueOnce(nodePreview({ hasChildren: true }))
      .mockResolvedValueOnce(nodePreview({ hasDocuments: true }))

    const result = await autoMergeDuplicates({
      modelId: 'm1',
      nodeGroups: [nodeGroup([{ id: 'a' }, { id: 'b' }, { id: 'c' }])],
      linkGroups: [],
    })

    expect(result.mergedGroups).toBe(0)
    expect(result.skipped.map(s => s.reason)).toEqual(['hasChildren', 'hasDocuments'])
  })

  it('merges link groups into the most-used copy', async () => {
    mockedPreviewLinks.mockResolvedValue({
      success: true,
      data: {
        keepId: 'keep',
        dropId: 'drop',
        keepTypeProperties: {},
        dropTypeProperties: {},
        keepDiagrams: [],
        dropDiagrams: [],
        keepUpdatedAt: 'k1',
        dropUpdatedAt: 'd1',
      } as MergeLinksPreview,
    })
    mockedMergeLinks.mockResolvedValue({ success: true, data: { keepId: 'keep', dropId: 'drop' } })

    const result = await autoMergeDuplicates({
      modelId: 'm1',
      nodeGroups: [],
      linkGroups: [
        linkGroup([
          { id: 'l-rare', diagramCount: 0 },
          { id: 'l-pop', diagramCount: 3 },
        ]),
      ],
    })

    expect(result.mergedGroups).toBe(1)
    expect(mockedMergeLinks).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ keepId: 'l-pop', dropId: 'l-rare' })
    )
  })

  it('aborts the run on 409 conflict and reports the message', async () => {
    mockedPreviewNodes.mockResolvedValue(nodePreview({}))
    mockedMergeNodes.mockResolvedValue({
      success: false,
      error: { message: 'Concurrent modification', status: 409 },
    })

    const groupA = nodeGroup([{ id: 'a' }, { id: 'b' }])
    const groupB = nodeGroup([{ id: 'c' }, { id: 'd' }])

    const result = await autoMergeDuplicates({
      modelId: 'm1',
      nodeGroups: [groupA, groupB],
      linkGroups: [],
    })

    expect(result.aborted).toBe('Concurrent modification')
    expect(result.mergedGroups).toBe(0)
    expect(mockedPreviewNodes).toHaveBeenCalledTimes(1)
  })
})
