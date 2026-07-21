import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/composables/useApi'
import { createEmptyModelEditorState } from '../types'
import { ensureDiagramAttrsLoaded } from './ensureDiagramAttrs'
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
