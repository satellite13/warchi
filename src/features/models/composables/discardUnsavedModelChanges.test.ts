import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/composables/useApi'
import { createEmptyModelEditorState } from '../types'
import { discardUnsavedModelChanges } from './discardUnsavedModelChanges'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)

const emptyNodeAttrs = {
  treeOrder: 0,
  typeProperties: {},
  componentProperties: {},
  notationComponents: {},
}

describe('discardUnsavedModelChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes new entities and refetches dirty persisted ones without full reload', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'm1'
    state.nodes = [
      {
        id: 'n-keep',
        name: 'Keep',
        modelId: 'm1',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: { ...emptyNodeAttrs },
      },
      {
        id: 'n-dirty',
        name: 'Dirty local',
        modelId: 'm1',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: { ...emptyNodeAttrs },
        _isDirty: true,
      },
      {
        id: 'n-new',
        name: 'New',
        modelId: 'm1',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: { ...emptyNodeAttrs },
        _isNew: true,
      },
    ]
    state.diagrams = [
      {
        id: 'd1',
        name: 'D',
        version: '1.0.0',
        ownerId: 'o',
        modelId: 'm1',
        notationId: 'nt',
        nodeId: null,
        parsedAttrs: {
          instances: {
            nodes: [{ id: 'i1', modelNodeId: 'n-dirty', x: 1, y: 2, width: 10, height: 10 }],
            edges: [],
          },
        },
        _isDirty: true,
      },
    ]

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/nodes/n-dirty') {
        return {
          success: true,
          data: {
            id: 'n-dirty',
            name: 'Dirty server',
            modelId: 'm1',
            ownerId: 'o',
            nodeTypeId: 't',
            parentNodeId: null,
            attrs: null,
          },
        }
      }
      if (path === '/diagrams/d1') {
        return {
          success: true,
          data: {
            id: 'd1',
            name: 'D',
            version: '1.0.0',
            ownerId: 'o',
            modelId: 'm1',
            notationId: 'nt',
            nodeId: null,
            attrs: JSON.stringify({
              instances: {
                nodes: [{ id: 'i1', modelNodeId: 'n-dirty', x: 9, y: 9, width: 10, height: 10 }],
                edges: [],
              },
            }),
          },
        }
      }
      return { success: false, error: { status: 404, message: `unexpected ${path}` } }
    })

    const result = await discardUnsavedModelChanges({
      state,
      model: null,
      modelDirty: false,
    })

    expect(result).toEqual({ ok: true })
    expect(state.nodes.map(n => n.id).sort()).toEqual(['n-dirty', 'n-keep'])
    expect(state.nodes.find(n => n.id === 'n-dirty')?.name).toBe('Dirty server')
    expect(state.nodes.every(n => !n._isDirty && !n._isNew && !n._isDeleted)).toBe(true)
    expect(state.diagrams[0]?.parsedAttrs.instances.nodes[0]?.x).toBe(9)
    expect(state.diagrams[0]?._isDirty).toBeUndefined()
    expect(apiGetMock).toHaveBeenCalledTimes(2)
  })

  it('restores soft-deleted persisted entities locally', async () => {
    const state = createEmptyModelEditorState()
    state.nodes = [
      {
        id: 'n1',
        name: 'A',
        modelId: 'm1',
        ownerId: 'o',
        nodeTypeId: 't',
        parentNodeId: null,
        parsedAttrs: { ...emptyNodeAttrs },
        _isDeleted: true,
      },
    ]

    const result = await discardUnsavedModelChanges({
      state,
      model: null,
      modelDirty: false,
    })

    expect(result).toEqual({ ok: true })
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0]?._isDeleted).toBeUndefined()
    expect(apiGetMock).not.toHaveBeenCalled()
  })
})
