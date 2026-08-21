import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyModelEditorState } from '../types'
import { parseLinkAttrs } from '../modelAttrs'
import { buildOefBatchSaveRequest } from '../utils/oef/oefToBatchSave'
import { useOefImport } from './useOefImport'

vi.mock('../utils/oef/oefToBatchSave', () => ({
  buildOefBatchSaveRequest: vi.fn(),
}))
vi.mock('./useModelBatchSave', () => ({
  batchSave: vi.fn(),
  hasBatchChanges: vi.fn(() => false),
}))

describe('useOefImport detached reuse input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  it('uses explicitly supplied detached links instead of the partial editor store', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.links = []
    const detachedLink = {
      id: 'detached-link',
      modelId: 'model-1',
      ownerId: 'owner-1',
      linkTypeId: 'type-1',
      sourceId: 'source-1',
      targetId: 'target-1',
      parsedAttrs: parseLinkAttrs(null),
      updatedAt: null,
    }
    vi.mocked(buildOefBatchSaveRequest).mockReturnValue({
      request: {
        nodes: { create: [], update: [], delete: [] },
        links: { create: [], update: [], delete: [] },
        diagrams: { create: [], update: [], delete: [] },
      },
      warnings: [],
      createdCounts: {
        nodes: 0,
        links: 0,
        diagrams: 0,
        diagramNodeInstances: 0,
        diagramConnectionInstances: 0,
      },
      reuseCounts: {
        nodesReused: 0,
        nodesUpdated: 0,
        linksReused: 0,
        linksUpdated: 0,
      },
    })
    const oef = useOefImport({
      state: ref(state),
      treeRootNodeId: computed(() => null),
      t: key => key,
      setUiError: vi.fn(),
      loadModel: vi.fn(async () => undefined),
      getExistingLinks: () => [detachedLink],
    })

    await oef.handleOefImportSubmit({
      draft: {
        sourceModelId: 'source-model',
        sourceModelName: 'Source',
        nodes: [],
        links: [],
        diagrams: [],
        organizations: [],
        sourceElementTypes: [],
        sourceRelationshipTypes: [],
      },
      notationId: 'notation-1',
      mapping: { elementTypeMap: {}, relationshipTypeMap: {} },
      ruleDecisions: {},
      reuseSettings: {
        nodesMode: 'reuseMatching',
        linksMode: 'reuseMatching',
        linkMatchCriterion: 'endpointsAndType',
        onNodeMatch: 'reuseId',
        onLinkMatch: 'reuseId',
      },
    })

    expect(buildOefBatchSaveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ existingLinks: [detachedLink] })
    )
  })
})
