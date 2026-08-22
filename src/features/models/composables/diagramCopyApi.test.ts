import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DiagramCopyEntityPreview,
  DiagramCopyPreviewResponse,
  DiagramCopyResolution,
} from './diagramCopyApi'
import {
  buildResolutionsFromPreview,
  canMatchDiagramCopyEntity,
  commitDiagramCopy,
  diagramCopyMatchCandidates,
  pickDefaultTargetNotationId,
  previewDiagramCopy,
  resolveDiagramCopyEntityAction,
  resolveDiagramCopyTargetId,
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

describe('resolveDiagramCopyEntityAction', () => {
  it('prefers an explicit override', () => {
    expect(
      resolveDiagramCopyEntityAction(
        createEntityPreview({ autoMatchTargetId: 'target-1' }),
        { sourceId: 'source-1', action: 'SKIP', kind: 'NODE' }
      )
    ).toBe('SKIP')
  })

  it('treats auto-match targets as MATCH in the UI', () => {
    expect(
      resolveDiagramCopyEntityAction(
        createEntityPreview({
          effectiveAction: null,
          autoMatchTargetId: 'target-1',
          autoMatchReason: 'NAME_AND_TYPE',
        })
      )
    ).toBe('MATCH')
  })

  it('defaults unmatched entities to CREATE', () => {
    expect(resolveDiagramCopyEntityAction(createEntityPreview())).toBe('CREATE')
  })

  it('leaves ambiguous candidates unresolved', () => {
    expect(
      resolveDiagramCopyEntityAction(
        createEntityPreview({
          candidates: [
            { id: 'a', label: 'A', stableId: null, typeId: null },
            { id: 'b', label: 'B', stableId: null, typeId: null },
          ],
        })
      )
    ).toBeNull()
  })
})

describe('resolveDiagramCopyTargetId', () => {
  it('resolves auto-match targets without effectiveTargetId', () => {
    expect(
      resolveDiagramCopyTargetId(
        createEntityPreview({ autoMatchTargetId: 'target-1' }),
        'MATCH'
      )
    ).toBe('target-1')
  })
})

describe('buildResolutionsFromPreview', () => {
  it('builds a match resolution from auto-match metadata', () => {
    const result = buildResolutionsFromPreview(
      createPreview({
        nodes: [
          createEntityPreview({
            sourceId: 'node-1',
            autoMatchTargetId: 'target-1',
            autoMatchReason: 'STABLE_ID',
          }),
        ],
      }),
      new Map()
    )

    expect(result).toEqual([
      { sourceId: 'node-1', action: 'MATCH', targetId: 'target-1', kind: 'NODE' },
    ])
  })

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

  it('can omit unresolved entities instead of defaulting them to create', () => {
    const result = buildResolutionsFromPreview(
      createPreview({
        nodes: [
          createEntityPreview({ sourceId: 'node-without-action' }),
          createEntityPreview({
            sourceId: 'node-create',
            effectiveAction: 'CREATE',
          }),
        ],
      }),
      new Map(),
      { fillUnresolvedWithCreate: false }
    )

    expect(result).toEqual([{ sourceId: 'node-create', action: 'CREATE', kind: 'NODE' }])
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

describe('canMatchDiagramCopyEntity', () => {
  it('allows match when only an auto-match target exists', () => {
    expect(
      canMatchDiagramCopyEntity({
        autoMatchTargetId: 'target-1',
        candidates: [],
      })
    ).toBe(true)
  })

  it('disallows match when there is neither a candidate nor an auto-match', () => {
    expect(canMatchDiagramCopyEntity({ autoMatchTargetId: null, candidates: [] })).toBe(false)
  })
})

describe('diagramCopyMatchCandidates', () => {
  it('synthesizes a candidate from the auto-match when the list is empty', () => {
    expect(
      diagramCopyMatchCandidates(
        createEntityPreview({
          label: 'Техник',
          autoMatchTargetId: 'target-1',
          autoMatchReason: 'NAME_AND_TYPE',
          candidates: [],
        })
      )
    ).toEqual([
      {
        id: 'target-1',
        label: 'Техник',
        stableId: null,
        typeId: null,
      },
    ])
  })
})
