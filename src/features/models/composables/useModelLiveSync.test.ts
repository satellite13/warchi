import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/composables/useApi'
import type { ModelData } from '@/types/entities'
import { createEmptyModelEditorState } from '../types'
import { parseModelLivePollMs, parseModelLiveSyncMode, useModelLiveSync } from './useModelLiveSync'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

vi.mock('@/composables/authStorage', () => ({
  AUTH_CLEARED_EVENT: 'warchi-auth-cleared',
  AUTH_UPDATED_EVENT: 'warchi-auth-updated',
  loadStoredUser: vi.fn(() => null),
}))

vi.mock('../utils/modelEditorSnapshotFreshness', () => ({
  isModelEditorSnapshotFresh: vi.fn(() => false),
}))

function page<T>(content: T[]) {
  return { content, totalElements: content.length, totalPages: 1, size: content.length, number: 0 }
}

function model(overrides: Partial<ModelData> = {}): ModelData {
  return {
    id: 'model-1',
    name: 'Model',
    version: '1.0.0',
    ownerId: 'owner-1',
    attrs: null,
    accessPermission: 'OWNER',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('useModelLiveSync config parsing', () => {
  it('accepts supported sync modes and defaults unknown values to hybrid', () => {
    expect(parseModelLiveSyncMode('ws')).toBe('ws')
    expect(parseModelLiveSyncMode('poll')).toBe('poll')
    expect(parseModelLiveSyncMode('hybrid')).toBe('hybrid')
    expect(parseModelLiveSyncMode(' HYBRID ')).toBe('hybrid')
    expect(parseModelLiveSyncMode('invalid')).toBe('hybrid')
    expect(parseModelLiveSyncMode(undefined)).toBe('hybrid')
  })

  it('normalizes poll interval to a finite integer with a one second minimum', () => {
    expect(parseModelLivePollMs('2500.9')).toBe(2500)
    expect(parseModelLivePollMs('100')).toBe(1000)
    expect(parseModelLivePollMs('not-a-number')).toBe(15_000)
    expect(parseModelLivePollMs(undefined)).toBe(15_000)
  })
})

describe('useModelLiveSync snapshot pull', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
  })

  it('merges remote snapshot into editor state and model metadata', async () => {
    const state = ref(createEmptyModelEditorState())
    state.value.modelId = 'model-1'
    const currentModel = ref<ModelData | null>(model({ name: 'Local Model' }))
    const ensureNotationRelationsAndRules = vi.fn(async () => undefined)

    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/nodes?')) {
        return {
          success: true,
          data: page([
            {
              id: 'node-1',
              name: 'Remote Node',
              modelId: 'model-1',
              ownerId: 'owner-1',
              nodeTypeId: 'node-type-1',
              parentNodeId: null,
              attrs: '{"typeProperties":{"code":"N1"}}',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
          ]),
        }
      }
      if (path.startsWith('/links?')) {
        return {
          success: true,
          data: page([
            {
              id: 'link-1',
              sourceId: 'node-1',
              targetId: 'node-1',
              modelId: 'model-1',
              ownerId: 'owner-1',
              linkTypeId: 'link-type-1',
              attrs: '{"relationProperties":{}}',
            },
          ]),
        }
      }
      if (path.startsWith('/diagrams?')) {
        return {
          success: true,
          data: page([
            {
              id: 'diagram-1',
              name: 'Remote Diagram',
              version: '1.0.0',
              modelId: 'model-1',
              ownerId: 'owner-1',
              notationId: 'notation-1',
              nodeId: null,
              attrs: '{"instances":{"nodes":[],"edges":[]}}',
            },
          ]),
        }
      }
      if (path === '/models/model-1') {
        return { success: true, data: model({ name: 'Remote Model', version: '1.1.0' }) }
      }
      if (path.startsWith('/node-types?')) {
        return {
          success: true,
          data: page([
            {
              id: 'node-type-1',
              name: 'Remote Node Type',
              ownerId: 'owner-1',
              attrs: null,
            },
          ]),
        }
      }
      if (path.startsWith('/link-types?')) {
        return {
          success: true,
          data: page([
            {
              id: 'link-type-1',
              name: 'Remote Link Type',
              ownerId: 'owner-1',
              attrs: null,
            },
          ]),
        }
      }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state,
            model: currentModel,
            enabled: ref(true),
            isLoading: ref(false),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules,
          })
          return () => null
        },
      })
    )

    await flushPromises()
    await flushPromises()
    wrapper.unmount()

    expect(state.value.nodes).toHaveLength(1)
    expect(state.value.nodes[0]?.name).toBe('Remote Node')
    expect(state.value.nodes[0]?.parsedAttrs.typeProperties).toEqual({ code: 'N1' })
    expect(state.value.links).toHaveLength(1)
    expect(state.value.diagrams[0]?.name).toBe('Remote Diagram')
    expect(state.value.nodeTypes[0]?.name).toBe('Remote Node Type')
    expect(state.value.linkTypes[0]?.name).toBe('Remote Link Type')
    expect(currentModel.value?.name).toBe('Remote Model')
    expect(currentModel.value?.version).toBe('1.1.0')
    expect(ensureNotationRelationsAndRules).toHaveBeenCalledWith('notation-1')
  })

  it('halts sync and notifies when model GET returns 404', async () => {
    const state = ref(createEmptyModelEditorState())
    state.value.modelId = 'model-gone'
    const currentModel = ref<ModelData | null>(model({ id: 'model-gone' }))
    const onModelUnavailable = vi.fn()
    let modelGets = 0

    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/nodes?') || path.startsWith('/links?') || path.startsWith('/diagrams?')) {
        return { success: true, data: page([]) }
      }
      if (path === '/models/model-gone') {
        modelGets += 1
        return { success: false, error: { status: 404, message: 'Not found' } }
      }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-gone'),
            state,
            model: currentModel,
            enabled: ref(true),
            isLoading: ref(false),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            onModelUnavailable,
          })
          return () => null
        },
      })
    )

    await flushPromises()
    await flushPromises()
    const getsAfterHalt = modelGets
    await flushPromises()
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(onModelUnavailable).toHaveBeenCalledWith(404)
    expect(modelGets).toBe(getsAfterHalt)
    expect(modelGets).toBeGreaterThanOrEqual(1)

    wrapper.unmount()
  })
})
