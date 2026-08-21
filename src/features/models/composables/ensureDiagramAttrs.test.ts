import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/composables/useApi'
import { createEmptyModelEditorState } from '../types'
import {
  ensureDiagramAttrsLoaded,
  ensureDirtyPendingDiagramAttrsLoaded,
} from './ensureDiagramAttrs'
import { toEditorDiagram, toEditorDiagramPreservingLocalAttrs } from './modelEditorMappers'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

describe('ensureDiagramAttrsLoaded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hydrates pending diagram attrs from GET /diagrams/{id}', async () => {
    const state = createEmptyModelEditorState()
    state.diagrams = [
      toEditorDiagram({
        id: 'diagram-1',
        name: 'D',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        attrs: null,
        createdAt: null,
        updatedAt: null,
      }),
    ]
    expect(state.diagrams[0]?._attrsPending).toBe(true)

    vi.mocked(apiGet).mockResolvedValueOnce({
      success: true,
      data: {
        id: 'diagram-1',
        name: 'D',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        attrs: '{"instances":{"nodes":[{"id":"i1","modelNodeId":"n1"}],"edges":[]}}',
        createdAt: null,
        updatedAt: null,
      },
    })

    const hydrated = await ensureDiagramAttrsLoaded(() => state, 'diagram-1')

    expect(apiGet).toHaveBeenCalledWith('/diagrams/diagram-1')
    expect(hydrated?._attrsPending).toBe(false)
    expect(hydrated?.parsedAttrs.instances.nodes).toHaveLength(1)
    expect(state.diagrams[0]?._attrsPending).toBe(false)
  })

  it('skips fetch when attrs already loaded', async () => {
    const state = createEmptyModelEditorState()
    state.diagrams = [
      toEditorDiagram({
        id: 'diagram-1',
        name: 'D',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        attrs: '{"instances":{"nodes":[],"edges":[]}}',
        createdAt: null,
        updatedAt: null,
      }),
    ]

    await ensureDiagramAttrsLoaded(state, 'diagram-1')
    expect(apiGet).not.toHaveBeenCalled()
  })

  it('keeps a local folder move when hydrating a dirty pending diagram', async () => {
    const state = createEmptyModelEditorState()
    state.diagrams = [
      {
        ...toEditorDiagram({
          id: 'diagram-1',
          name: 'D',
          version: '1.0.0',
          modelId: 'model-1',
          ownerId: 'owner-1',
          notationId: 'notation-1',
          nodeId: null,
          attrs: null,
          createdAt: null,
          updatedAt: null,
        }),
        nodeId: 'folder-1',
        _isDirty: true,
      },
    ]

    vi.mocked(apiGet).mockResolvedValueOnce({
      success: true,
      data: {
        id: 'diagram-1',
        name: 'D',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        attrs: '{"instances":{"nodes":[{"id":"i1","modelNodeId":"n1"}],"edges":[]}}',
        createdAt: null,
        updatedAt: null,
      },
    })

    const hydrated = await ensureDiagramAttrsLoaded(() => state, 'diagram-1')

    expect(hydrated?.nodeId).toBe('folder-1')
    expect(hydrated?._isDirty).toBe(true)
    expect(hydrated?.parsedAttrs.instances.nodes).toHaveLength(1)
    expect(state.diagrams[0]?.nodeId).toBe('folder-1')
  })

  it('does not apply hydration after the model generation changes', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [
      toEditorDiagram({
        id: 'diagram-1',
        name: 'Old model diagram',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        attrs: null,
        createdAt: null,
        updatedAt: null,
      }),
    ]
    let finishRequest!: (value: Awaited<ReturnType<typeof apiGet>>) => void
    vi.mocked(apiGet).mockReturnValueOnce(
      new Promise(resolve => {
        finishRequest = resolve
      })
    )

    const hydration = ensureDiagramAttrsLoaded(() => state, 'diagram-1', {
      expectedModelId: 'model-1',
    })
    state.modelId = 'model-2'
    state.diagrams = [
      toEditorDiagram({
        id: 'diagram-1',
        name: 'New model diagram',
        version: '1.0.0',
        modelId: 'model-2',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        attrs: null,
        createdAt: null,
        updatedAt: null,
      }),
    ]
    finishRequest({
      success: true,
      data: {
        id: 'diagram-1',
        name: 'Old model diagram',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        attrs: '{"instances":{"nodes":[{"id":"old","modelNodeId":"old-node"}],"edges":[]}}',
        createdAt: null,
        updatedAt: null,
      },
    })

    await expect(hydration).resolves.toBeNull()
    expect(state.modelId).toBe('model-2')
    expect(state.diagrams[0]?.name).toBe('New model diagram')
    expect(state.diagrams[0]?._attrsPending).toBe(true)
  })

  it('ensureDirtyPendingDiagramAttrsLoaded hydrates only dirty pending diagrams', async () => {
    const state = createEmptyModelEditorState()
    state.diagrams = [
      {
        ...toEditorDiagram({
          id: 'dirty-pending',
          name: 'A',
          version: '1.0.0',
          modelId: 'model-1',
          ownerId: 'owner-1',
          notationId: 'notation-1',
          nodeId: null,
          attrs: null,
          createdAt: null,
          updatedAt: null,
        }),
        _isDirty: true,
      },
      toEditorDiagram({
        id: 'clean-pending',
        name: 'B',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        attrs: null,
        createdAt: null,
        updatedAt: null,
      }),
    ]

    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        id: 'dirty-pending',
        name: 'A',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        attrs: '{"instances":{"nodes":[{"id":"i1","modelNodeId":"n1"}],"edges":[]}}',
        createdAt: null,
        updatedAt: null,
      },
    })

    await ensureDirtyPendingDiagramAttrsLoaded(() => state)

    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(apiGet).toHaveBeenCalledWith('/diagrams/dirty-pending')
    expect(state.diagrams[0]?._attrsPending).toBe(false)
    expect(state.diagrams[1]?._attrsPending).toBe(true)
  })
})

describe('toEditorDiagramPreservingLocalAttrs', () => {
  it('keeps hydrated attrs when remote list omits attrs', () => {
    const previous = [
      {
        ...toEditorDiagram({
          id: 'diagram-1',
          name: 'Old',
          version: '1.0.0',
          modelId: 'model-1',
          ownerId: 'owner-1',
          notationId: 'notation-1',
          nodeId: null,
          attrs: '{"instances":{"nodes":[{"id":"i1","modelNodeId":"n1"}],"edges":[]}}',
          createdAt: null,
          updatedAt: null,
        }),
        _attrsPending: false,
      },
    ]
    const next = toEditorDiagramPreservingLocalAttrs(
      {
        id: 'diagram-1',
        name: 'Remote',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        attrs: null,
        createdAt: null,
        updatedAt: null,
      },
      previous
    )

    expect(next.name).toBe('Remote')
    expect(next._attrsPending).toBe(false)
    expect(next.parsedAttrs.instances.nodes).toHaveLength(1)
  })
})
