import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DiagramCopyEntityPreview,
  DiagramCopyPreviewResponse,
  DiagramCopyResolution,
} from './diagramCopyApi'
import {
  buildResolutionsFromPreview,
  commitDiagramCopy,
  pickDefaultTargetNotationId,
  previewDiagramCopy,
} from './diagramCopyApi'
import { apiPost } from '@/composables/useApi'

vi.mock('@/composables/useApi', () => ({
  apiPost: vi.fn(),
}))

function createEntityPreview(
  overrides: Partial<DiagramCopyEntityPreview> = {}
): DiagramCopyEntityPreview {
  return {
    sourceId: 'source-1',
    kind: 'NODE',
    label: 'Source entity',
    stableId: null,
    typeId: null,
    autoMatchTargetId: null,
    autoMatchReason: null,
    candidates: [],
    effectiveAction: null,
    effectiveTargetId: null,
    isEndpointOfEdge: false,
    ...overrides,
  }
}

function createPreview(
  overrides: Partial<DiagramCopyPreviewResponse> = {}
): DiagramCopyPreviewResponse {
  return {
    sourceDiagramId: 'source-diagram',
    sourceDiagramName: 'Source diagram',
    sourceDiagramVersion: '1.0.0',
    suggestedName: 'Copied diagram',
    suggestedVersion: '1.0.0',
    nodes: [],
    links: [],
    blockers: [],
    notationRemap: {
      mappedComponents: 0,
      unmappedComponents: [],
      mappedRelations: 0,
      unmappedRelations: [],
    },
    warnings: [],
    canCommit: true,
    ...overrides,
  }
}

describe('buildResolutionsFromPreview', () => {
  it('uses override for a source entity before its effective action', () => {
    const override: DiagramCopyResolution = {
      sourceId: 'node-1',
      action: 'SKIP',
      kind: 'NODE',
    }
    const result = buildResolutionsFromPreview(
      createPreview({
        nodes: [
          createEntityPreview({
            sourceId: 'node-1',
            effectiveAction: 'MATCH',
            effectiveTargetId: 'target-1',
          }),
        ],
      }),
      new Map([['node-1', override]])
    )

    expect(result).toEqual([override])
  })

  it('builds a match resolution when the effective target is available', () => {
    const result = buildResolutionsFromPreview(
      createPreview({
        nodes: [
          createEntityPreview({
            sourceId: 'node-1',
            effectiveAction: 'MATCH',
            effectiveTargetId: 'target-1',
          }),
        ],
      }),
      new Map()
    )

    expect(result).toEqual([
      { sourceId: 'node-1', action: 'MATCH', targetId: 'target-1', kind: 'NODE' },
    ])
  })

  it('builds create and skip resolutions from effective actions', () => {
    const result = buildResolutionsFromPreview(
      createPreview({
        nodes: [createEntityPreview({ sourceId: 'node-1', effectiveAction: 'CREATE' })],
        links: [
          createEntityPreview({
            sourceId: 'link-1',
            kind: 'LINK',
            effectiveAction: 'SKIP',
          }),
        ],
      }),
      new Map()
    )

    expect(result).toEqual([
      { sourceId: 'node-1', action: 'CREATE', kind: 'NODE' },
      { sourceId: 'link-1', action: 'SKIP', kind: 'LINK' },
    ])
  })

  it('creates unresolved entities, including matches without a target', () => {
    const result = buildResolutionsFromPreview(
      createPreview({
        nodes: [
          createEntityPreview({ sourceId: 'node-without-action' }),
          createEntityPreview({
            sourceId: 'node-without-target',
            effectiveAction: 'MATCH',
          }),
        ],
      }),
      new Map()
    )

    expect(result).toEqual([
      { sourceId: 'node-without-action', action: 'CREATE', kind: 'NODE' },
      { sourceId: 'node-without-target', action: 'CREATE', kind: 'NODE' },
    ])
  })
})

describe('pickDefaultTargetNotationId', () => {
  it('prefers source notation when available', () => {
    expect(
      pickDefaultTargetNotationId(
        [{ id: 'n-a' }, { id: 'n-source' }, { id: 'n-b' }],
        'n-source'
      )
    ).toBe('n-source')
  })

  it('falls back to first available when source notation is missing', () => {
    expect(pickDefaultTargetNotationId([{ id: 'n-a' }, { id: 'n-b' }], 'gone')).toBe('n-a')
    expect(pickDefaultTargetNotationId([], 'n-source')).toBe('')
  })
})

describe('diagram copy API', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset()
  })

  it('posts preview and commit requests to encoded target model endpoints', async () => {
    const previewRequest = {
      sourceDiagramId: 'source-diagram',
      targetNotationId: 'target-notation',
    }
    const commitRequest = {
      ...previewRequest,
      name: 'Copied diagram',
      version: '1.0.0',
      resolutions: [],
    }
    vi.mocked(apiPost).mockResolvedValue({ success: true, data: {} } as never)

    await previewDiagramCopy('model/with space', previewRequest)
    await commitDiagramCopy('model/with space', commitRequest)

    expect(apiPost).toHaveBeenNthCalledWith(
      1,
      '/models/model%2Fwith%20space/diagram-copies/preview',
      previewRequest
    )
    expect(apiPost).toHaveBeenNthCalledWith(
      2,
      '/models/model%2Fwith%20space/diagram-copies/commit',
      commitRequest
    )
  })
})
