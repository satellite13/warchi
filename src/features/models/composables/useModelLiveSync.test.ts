import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref, type Ref } from 'vue'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { refreshAccessToken, type ApiResult } from '@/api/apiClient'
import { apiFetch, apiGet } from '@/composables/useApi'
import type { NodeResponse } from '@/types/api'
import type { ModelData } from '@/types/entities'
import { createEmptyModelEditorState } from '../types'
import { ModelPartialStore } from '../utils/modelPartialStore'
import { toEditorNode } from './modelEditorMappers'
import { parseModelLivePollMs, parseModelLiveSyncMode, useModelLiveSync } from './useModelLiveSync'

type StompOptions = {
  onConnect: () => void
  onDisconnect: () => void
  onWebSocketClose: () => void
}

const stompMock = vi.hoisted(() => {
  type MessageHandler = (message: { body: string }) => void
  const clients: Array<{
    options: StompOptions
    subscriptions: Map<string, MessageHandler>
  }> = []
  return { clients, autoConnect: false, rejectDeactivate: false }
})

vi.mock('@stomp/stompjs', () => ({
  Client: class {
    private readonly subscriptions = new Map<string, (message: { body: string }) => void>()
    private readonly options: StompOptions

    constructor(options: StompOptions) {
      this.options = options
      stompMock.clients.push({ options, subscriptions: this.subscriptions })
    }

    activate() {
      if (stompMock.autoConnect) this.options.onConnect()
    }
    deactivate() {
      if (stompMock.rejectDeactivate) return Promise.reject(new Error('deactivate failed'))
      return Promise.resolve()
    }
    subscribe(topic: string, handler: (message: { body: string }) => void) {
      this.subscriptions.set(topic, handler)
      return { unsubscribe: vi.fn() }
    }
  },
}))

vi.mock('@/composables/useApi', () => ({
  apiFetch: vi.fn(),
  apiGet: vi.fn(),
}))

vi.mock('@/composables/authStorage', () => ({
  AUTH_CLEARED_EVENT: 'warchi-auth-cleared',
  AUTH_UPDATED_EVENT: 'warchi-auth-updated',
  loadStoredUser: vi.fn(() => ({ id: 'viewer-1' })),
}))

vi.mock('@/api/apiClient', () => ({
  refreshAccessToken: vi.fn(async () => true),
}))

vi.mock('@/api/modelSyncWs', () => ({
  buildModelSyncWsUrl: vi.fn(() => 'ws://example.test/model-sync'),
}))

function page<T>(content: T[]) {
  return { content, totalElements: content.length, totalPages: 1, size: content.length, number: 0 }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
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
  it('requires an initial snapshot readiness ref', () => {
    type Options = Parameters<typeof useModelLiveSync>[0]

    expectTypeOf<Pick<Options, 'initialSnapshotReady'>>().toEqualTypeOf<{
      initialSnapshotReady: Ref<boolean>
    }>()
  })

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
    vi.mocked(apiFetch).mockReset()
    vi.mocked(apiFetch).mockImplementation(path => apiGet(path))
    stompMock.clients.length = 0
    stompMock.autoConnect = false
    stompMock.rejectDeactivate = false
    vi.mocked(refreshAccessToken).mockReset()
    vi.mocked(refreshAccessToken).mockResolvedValue(true)
  })

  it('merges only remote slim diagrams and model metadata', async () => {
    const state = ref(createEmptyModelEditorState())
    state.value.modelId = 'model-1'
    const currentModel = ref<ModelData | null>(model({ name: 'Local Model' }))
    const ensureNotationRelationsAndRules = vi.fn(async () => undefined)
    const reconcileMaterializedRows = vi.fn()
    const onRemoteSnapshotApplied = vi.fn()

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
        return {
          success: true,
          data: model({
            name: 'Remote Model',
            version: '1.1.0',
            updatedAt: '2026-01-02T00:00:00.000Z',
          }),
        }
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
            initialSnapshotReady: ref(true),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules,
            reconcileMaterializedRows,
            onRemoteSnapshotApplied,
          })
          return () => null
        },
      })
    )

    await flushPromises()
    await flushPromises()
    wrapper.unmount()

    expect(state.value.nodes).toEqual([])
    expect(state.value.links).toEqual([])
    expect(state.value.diagrams[0]?.name).toBe('Remote Diagram')
    expect(state.value.nodeTypes).toEqual([])
    expect(state.value.linkTypes).toEqual([])
    expect(currentModel.value?.name).toBe('Remote Model')
    expect(currentModel.value?.version).toBe('1.1.0')
    expect(ensureNotationRelationsAndRules).not.toHaveBeenCalled()
    expect(reconcileMaterializedRows).not.toHaveBeenCalled()
    expect(onRemoteSnapshotApplied).toHaveBeenCalledTimes(1)
  })

  it('halts sync and notifies when model GET returns 404', async () => {
    const state = ref(createEmptyModelEditorState())
    state.value.modelId = 'model-gone'
    const currentModel = ref<ModelData | null>(model({ id: 'model-gone' }))
    const onModelUnavailable = vi.fn()
    let modelGets = 0

    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (
        path.startsWith('/nodes?') ||
        path.startsWith('/links?') ||
        path.startsWith('/diagrams?')
      ) {
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
            initialSnapshotReady: ref(true),
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

  it('does not pull collections until the initial snapshot is ready', async () => {
    const snapshotReady = ref(false)
    vi.mocked(apiGet).mockImplementation(async () => {
      throw new Error('live sync must not pull while the editor is still loading extras')
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: snapshotReady,
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
          })
          return () => null
        },
      })
    )

    await flushPromises()
    expect(apiGet).not.toHaveBeenCalled()

    snapshotReady.value = true
    await flushPromises()
    expect(apiGet).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('does not pull unscoped collections when websocket connects immediately after shell readiness', async () => {
    const snapshotReady = ref(false)
    let modelGets = 0
    vi.mocked(apiGet).mockImplementation(async path => {
      if (path === '/models/model-1') {
        modelGets += 1
        return { success: true, data: model({ updatedAt: '2026-01-01T00:00:00.000Z' }) }
      }
      throw new Error('unchanged websocket connect must not pull unscoped collections')
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          const state = createEmptyModelEditorState()
          state.modelId = 'model-1'
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(state),
            model: ref(model({ updatedAt: '2026-01-01T00:00:00.000Z' })),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: snapshotReady,
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'ws',
          })
          return () => null
        },
      })
    )
    await flushPromises()
    const client = stompMock.clients.at(-1)

    snapshotReady.value = true
    client?.options.onConnect()
    await flushPromises()

    expect(modelGets).toBe(1)
    expect(
      vi
        .mocked(apiGet)
        .mock.calls.filter(([path]) => path.startsWith('/nodes?') || path.startsWith('/links?'))
    ).toEqual([])
    wrapper.unmount()
  })

  it('routes poll, visibility, auth refresh, and reconnect probes through bounded sync only', async () => {
    vi.useFakeTimers()
    const fetchModel = vi.fn(async () => ({
      success: true as const,
      data: model({ updatedAt: '2026-01-01T00:00:00.000Z' }),
    }))
    const fetchSlimDiagrams = vi.fn(async () => ({ success: true as const, data: [] }))
    const state = ref(createEmptyModelEditorState())
    state.value.modelId = 'model-1'

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state,
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(true),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'hybrid',
            boundedSync: {
              materializedScopes: () => [],
              refreshVisibleChildrenScope: vi.fn(async () => undefined),
              fetchers: { fetchModel, fetchSlimDiagrams },
            },
          })
          return () => null
        },
      })
    )
    await flushPromises()
    const client = stompMock.clients.at(-1)
    client?.options.onConnect()
    await flushPromises()

    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('warchi-auth-updated'))
    client?.options.onDisconnect()
    await vi.advanceTimersByTimeAsync(15_000)
    client?.options.onConnect()
    await flushPromises()

    expect(fetchModel.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(fetchSlimDiagrams).not.toHaveBeenCalled()
    expect(
      vi
        .mocked(apiGet)
        .mock.calls.filter(([path]) => path.startsWith('/nodes?') || path.startsWith('/links?'))
    ).toEqual([])

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('uses bounded reconciliation when model revision changes before subscription', async () => {
    const snapshotReady = ref(false)
    let nodePulls = 0
    let linkPulls = 0
    let modelGets = 0
    vi.mocked(apiGet).mockImplementation(async path => {
      if (path === '/models/model-1') {
        modelGets += 1
        return { success: true, data: model({ updatedAt: '2026-01-02T00:00:00.000Z' }) }
      }
      if (path.startsWith('/nodes?')) {
        nodePulls += 1
        return { success: true, data: page([]) }
      }
      if (path.startsWith('/links?')) {
        linkPulls += 1
        return { success: true, data: page([]) }
      }
      if (path.startsWith('/diagrams?')) {
        return { success: true, data: page([]) }
      }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          const state = createEmptyModelEditorState()
          state.modelId = 'model-1'
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(state),
            model: ref(model({ updatedAt: '2026-01-01T00:00:00.000Z' })),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: snapshotReady,
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'ws',
          })
          return () => null
        },
      })
    )
    await flushPromises()
    const client = stompMock.clients.at(-1)

    snapshotReady.value = true
    client?.options.onConnect()
    await flushPromises()
    await flushPromises()

    expect(modelGets).toBe(2)
    expect(nodePulls).toBe(0)
    expect(linkPulls).toBe(0)
    wrapper.unmount()
  })

  it('never promotes unsupported WS payloads to a full snapshot repeat', async () => {
    const snapshotReady = ref(false)
    const firstNodes = deferred<ApiResult<unknown>>()
    let nodePulls = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/nodes?')) {
        nodePulls += 1
        if (nodePulls === 1) return firstNodes.promise
        return { success: true, data: page([]) }
      }
      if (path.startsWith('/links?') || path.startsWith('/diagrams?')) {
        return { success: true, data: page([]) }
      }
      if (path === '/models/model-1') return { success: true, data: model() }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: snapshotReady,
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            currentUserId: ref('viewer-1'),
          })
          return () => null
        },
      })
    )
    await flushPromises()
    snapshotReady.value = true
    await flushPromises()
    const client = stompMock.clients.at(-1)
    expect(client).toBeDefined()
    client?.options.onConnect()
    await flushPromises()
    window.dispatchEvent(new Event('warchi-auth-updated'))
    await flushPromises()
    expect(nodePulls).toBe(0)
    const reconnectClient = stompMock.clients.at(-1)
    reconnectClient?.options.onConnect()
    reconnectClient?.subscriptions.get('/topic/models/model-1')?.({
      body: JSON.stringify({
        type: 'model_changed',
        modelId: 'model-1',
        actorUserId: 'other-user',
        eventId: 'event-1',
      }),
    })
    await flushPromises()
    expect(nodePulls).toBe(0)

    reconnectClient?.subscriptions.get('/topic/models/model-1')?.({
      body: JSON.stringify({
        type: 'model_changed',
        modelId: 'model-1',
        actorUserId: 'other-user',
        eventId: 'event-2',
      }),
    })
    await flushPromises()
    firstNodes.resolve({ success: true, data: page([]) })
    await flushPromises()
    await flushPromises()

    expect(nodePulls).toBe(0)
    wrapper.unmount()
  })

  it('does not merge an old model pull and starts the new model pull once', async () => {
    const modelId = ref('model-1')
    const firstModel = deferred<ApiResult<ModelData>>()
    const state = ref(createEmptyModelEditorState())
    const currentModel = ref<ModelData | null>(model())
    let modelTwoPulls = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/models/model-1') return firstModel.promise
      if (path === '/models/model-2') {
        modelTwoPulls += 1
        return {
          success: true,
          data: model({
            id: 'model-2',
            name: 'Model 2',
            updatedAt: '2026-01-02T00:00:00.000Z',
          }),
        }
      }
      if (path.startsWith('/diagrams?')) return { success: true, data: page([]) }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId,
            state,
            model: currentModel,
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(true),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
          })
          return () => null
        },
      })
    )
    await flushPromises()
    modelId.value = 'model-2'
    await flushPromises()
    firstModel.resolve({ success: true, data: model() })
    await flushPromises()
    await flushPromises()

    expect(state.value.nodes).toEqual([])
    expect(currentModel.value?.id).toBe('model-2')
    expect(modelTwoPulls).toBe(2)
    wrapper.unmount()
  })

  it('routes session resync and websocket connect through revision probes', async () => {
    const snapshotReady = ref(false)
    const enabled = ref(true)
    let modelProbes = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/models/model-1') {
        modelProbes += 1
        return { success: true, data: model() }
      }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: ref(model()),
            enabled,
            isLoading: ref(false),
            initialSnapshotReady: snapshotReady,
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
          })
          return () => null
        },
      })
    )
    await flushPromises()
    snapshotReady.value = true
    stompMock.clients.at(-1)?.options.onConnect()
    await flushPromises()
    const pullsBeforeBurst = modelProbes

    stompMock.autoConnect = true
    enabled.value = false
    await flushPromises()
    enabled.value = true
    await flushPromises()

    expect(modelProbes - pullsBeforeBurst).toBe(2)
    wrapper.unmount()
  })

  it('waits for the poll interval after readiness instead of pulling immediately', async () => {
    vi.useFakeTimers()
    const snapshotReady = ref(false)
    let modelProbes = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/models/model-1') {
        modelProbes += 1
        return { success: true, data: model() }
      }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: snapshotReady,
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'poll',
          })
          return () => null
        },
      })
    )
    await flushPromises()
    snapshotReady.value = true
    await flushPromises()
    expect(modelProbes).toBe(0)

    await vi.advanceTimersByTimeAsync(14_999)
    expect(modelProbes).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(modelProbes).toBe(1)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('coalesces intervals during a slow poll into one follow-up probe', async () => {
    vi.useFakeTimers()
    const firstModel = deferred<ApiResult<ModelData>>()
    let modelProbes = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/models/model-1') {
        modelProbes += 1
        if (modelProbes === 1) return firstModel.promise
        return { success: true, data: model() }
      }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(true),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'poll',
          })
          return () => null
        },
      })
    )
    await flushPromises()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(modelProbes).toBe(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(modelProbes).toBe(1)
    firstModel.resolve({ success: true, data: model() })
    await flushPromises()
    await flushPromises()
    expect(modelProbes).toBe(2)

    await vi.advanceTimersByTimeAsync(14_999)
    expect(modelProbes).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(modelProbes).toBe(3)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('ignores a late connect callback from a replaced websocket client', async () => {
    const modelId = ref('model-1')
    vi.mocked(apiGet).mockImplementation(async () => {
      throw new Error('a stale websocket client must not trigger a pull')
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId,
            state: ref(createEmptyModelEditorState()),
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(false),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
          })
          return () => null
        },
      })
    )
    await flushPromises()
    const replacedClient = stompMock.clients.at(-1)
    modelId.value = 'model-2'
    await flushPromises()
    expect(stompMock.clients.at(-1)).not.toBe(replacedClient)

    replacedClient?.options.onConnect()
    await flushPromises()

    expect(replacedClient?.subscriptions.size).toBe(0)
    expect(apiGet).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not full-pull when websocket reconnects after readiness', async () => {
    const snapshotReady = ref(false)
    const isLoading = ref(false)
    let nodePulls = 0
    stompMock.autoConnect = true
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/nodes?')) {
        nodePulls += 1
        return { success: true, data: page([]) }
      }
      if (path.startsWith('/links?') || path.startsWith('/diagrams?')) {
        return { success: true, data: page([]) }
      }
      if (path === '/models/model-1') return { success: true, data: model() }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: ref(model()),
            enabled: ref(true),
            isLoading,
            initialSnapshotReady: snapshotReady,
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'ws',
          })
          return () => null
        },
      })
    )
    await flushPromises()
    expect(nodePulls).toBe(0)
    snapshotReady.value = true
    await flushPromises()

    const client = stompMock.clients.at(-1)
    isLoading.value = true
    client?.options.onDisconnect()
    isLoading.value = false
    client?.options.onConnect()
    await flushPromises()

    expect(nodePulls).toBe(0)
    wrapper.unmount()
  })

  it('contains pull failures and allows the next scheduled pull', async () => {
    let modelProbes = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/models/model-1') {
        modelProbes += 1
        if (modelProbes === 1) throw new Error('model probe failed')
        return { success: true, data: model() }
      }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(true),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'ws',
          })
          return () => null
        },
      })
    )
    await flushPromises()
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(modelProbes).toBe(2)
    wrapper.unmount()
  })

  it('contains websocket deactivate and auth refresh failures', async () => {
    stompMock.rejectDeactivate = true
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('refresh failed'))

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(false),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'ws',
          })
          return () => null
        },
      })
    )
    await flushPromises()
    const client = stompMock.clients.at(-1)
    client?.options.onWebSocketClose()
    wrapper.unmount()
    await flushPromises()

    expect(refreshAccessToken).toHaveBeenCalled()
  })

  it('invalidates an active bounded reconcile on auth clear and ignores its late response', async () => {
    const modelResponse = deferred<ApiResult<ModelData>>()
    let requestSignal: AbortSignal | undefined
    const fetchModel = vi.fn(async (_modelId: string, signal: AbortSignal) => {
      requestSignal = signal
      return modelResponse.promise
    })
    const fetchSlimDiagrams = vi.fn(async () => ({ success: true as const, data: [] }))
    const currentModel = ref<ModelData | null>(model())
    const onRemoteSnapshotApplied = vi.fn()
    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: currentModel,
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(true),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'ws',
            onRemoteSnapshotApplied,
            boundedSync: {
              materializedScopes: () => [],
              refreshVisibleChildrenScope: vi.fn(async () => undefined),
              fetchers: { fetchModel, fetchSlimDiagrams },
            },
          })
          return () => null
        },
      })
    )
    await vi.waitFor(() => expect(fetchModel).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event('warchi-auth-cleared'))
    expect(requestSignal?.aborted).toBe(true)
    modelResponse.resolve({
      success: true,
      data: model({ name: 'late remote', updatedAt: '2026-01-02T00:00:00.000Z' }),
    })
    await flushPromises()

    expect(currentModel.value?.name).toBe('Model')
    expect(fetchSlimDiagrams).not.toHaveBeenCalled()
    expect(onRemoteSnapshotApplied).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(fetchModel).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('keeps remote model metadata pending while dirty and applies it when dirty clears', async () => {
    const modelDirty = ref(true)
    const currentModel = ref<ModelData | null>(
      model({ name: 'local edit', updatedAt: '2026-01-01T00:00:00.000Z' })
    )
    const fetchModel = vi.fn(async () => ({
      success: true as const,
      data: model({
        name: 'remote metadata',
        ownerId: 'owner-2',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    }))
    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: currentModel,
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(true),
            isSaving: ref(false),
            modelDirty,
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'poll',
            boundedSync: {
              materializedScopes: () => [],
              refreshVisibleChildrenScope: vi.fn(async () => undefined),
              fetchers: {
                fetchModel,
                fetchSlimDiagrams: vi.fn(async () => ({ success: true as const, data: [] })),
              },
            },
          })
          return () => null
        },
      })
    )

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(fetchModel).toHaveBeenCalledTimes(2))
    expect(currentModel.value?.name).toBe('local edit')
    expect(currentModel.value?.updatedAt).toBe('2026-01-01T00:00:00.000Z')

    modelDirty.value = false
    await flushPromises()

    expect(currentModel.value?.name).toBe('remote metadata')
    expect(currentModel.value?.ownerId).toBe('owner-2')
    expect(currentModel.value?.updatedAt).toBe('2026-01-02T00:00:00.000Z')
    wrapper.unmount()
  })

  it('rejects a bounded updatedAt older than the current accepted model metadata', async () => {
    const currentModel = ref<ModelData | null>(
      model({ name: 'newer granular', updatedAt: '2026-01-03T00:00:00.000Z' })
    )
    const fetchSlimDiagrams = vi.fn(async () => ({ success: true as const, data: [] }))
    const fetchModel = vi.fn(async () => ({
      success: true as const,
      data: model({ name: 'older bounded', updatedAt: '2026-01-02T00:00:00.000Z' }),
    }))
    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state: ref(createEmptyModelEditorState()),
            model: currentModel,
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(true),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'poll',
            boundedSync: {
              materializedScopes: () => [],
              refreshVisibleChildrenScope: vi.fn(async () => undefined),
              fetchers: { fetchModel, fetchSlimDiagrams },
            },
          })
          return () => null
        },
      })
    )

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(fetchModel).toHaveBeenCalledTimes(1))

    expect(currentModel.value?.name).toBe('newer granular')
    expect(fetchSlimDiagrams).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('drops coalesced granular events on auth clear before the initial snapshot becomes ready', async () => {
    const snapshotReady = ref(false)
    const state = ref(createEmptyModelEditorState())
    state.value.modelId = 'model-1'
    const store = new ModelPartialStore()
    store.mergeNodes(
      [
        toEditorNode({
          id: 'node-1',
          name: 'old',
          modelId: 'model-1',
          ownerId: 'owner-1',
          nodeTypeId: 'node-type-1',
          attrs: null,
        }),
      ],
      { kind: 'partial' }
    )
    const fetchNode = vi.fn()
    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state,
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: snapshotReady,
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'ws',
            granularSync: {
              store,
              publishMaterializedRows: vi.fn(),
              refreshVisibleChildrenScope: vi.fn(async () => undefined),
              fetchers: {
                fetchNode,
                fetchLink: vi.fn(),
                fetchDiagram: vi.fn(),
                fetchModel: vi.fn(),
              },
            },
          })
          return () => null
        },
      })
    )
    const client = stompMock.clients.at(-1)
    client?.options.onConnect()
    client?.subscriptions.get('/topic/models/model-1')?.({
      body: JSON.stringify({
        type: 'model_changed',
        modelId: 'model-1',
        actorUserId: 'other-user',
        eventId: 'pending-before-logout',
        events: [{ type: 'node_updated', entity: 'node', id: 'node-1', revision: 2 }],
      }),
    })

    window.dispatchEvent(new Event('warchi-auth-cleared'))
    snapshotReady.value = true
    await flushPromises()

    expect(fetchNode).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('aborts an active granular point request on auth clear and ignores its late response', async () => {
    const state = ref(createEmptyModelEditorState())
    state.value.modelId = 'model-1'
    const store = new ModelPartialStore()
    store.mergeNodes(
      [
        toEditorNode({
          id: 'node-1',
          name: 'old',
          modelId: 'model-1',
          ownerId: 'owner-1',
          nodeTypeId: 'node-type-1',
          attrs: null,
        }),
      ],
      { kind: 'partial' }
    )
    state.value.nodes = store.nodes
    const response = deferred<ApiResult<NodeResponse>>()
    let pointSignal: AbortSignal | undefined
    const fetchNode = vi.fn(async (_id: string, signal: AbortSignal) => {
      pointSignal = signal
      return response.promise
    })
    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId: ref('model-1'),
            state,
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(true),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            mode: 'ws',
            granularSync: {
              store,
              publishMaterializedRows: () => {
                state.value.nodes = store.nodes
              },
              refreshVisibleChildrenScope: vi.fn(async () => undefined),
              fetchers: {
                fetchNode,
                fetchLink: vi.fn(),
                fetchDiagram: vi.fn(),
                fetchModel: vi.fn(),
              },
            },
          })
          return () => null
        },
      })
    )
    const client = stompMock.clients.at(-1)
    client?.options.onConnect()
    client?.subscriptions.get('/topic/models/model-1')?.({
      body: JSON.stringify({
        type: 'model_changed',
        modelId: 'model-1',
        actorUserId: 'other-user',
        eventId: 'active-before-logout',
        events: [{ type: 'node_updated', entity: 'node', id: 'node-1', revision: 2 }],
      }),
    })
    await vi.waitFor(() => expect(fetchNode).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event('warchi-auth-cleared'))
    expect(pointSignal?.aborted).toBe(true)
    response.resolve({
      success: true,
      data: {
        id: 'node-1',
        name: 'late remote',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'node-type-1',
        attrs: null,
      },
    })
    await flushPromises()

    expect(state.value.nodes[0]?.name).toBe('old')
    wrapper.unmount()
  })

  it('ignores a late subscription callback from the previous model generation', async () => {
    const modelId = ref('model-1')
    const onModelTopicBroadcast = vi.fn()
    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId,
            state: ref(createEmptyModelEditorState()),
            model: ref(model()),
            enabled: ref(true),
            isLoading: ref(false),
            initialSnapshotReady: ref(false),
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            onModelTopicBroadcast,
            mode: 'ws',
          })
          return () => null
        },
      })
    )
    await flushPromises()
    const oldClient = stompMock.clients.at(-1)
    oldClient?.options.onConnect()
    const lateCallback = oldClient?.subscriptions.get('/topic/models/model-1')

    modelId.value = 'model-2'
    await flushPromises()
    lateCallback?.({
      body: JSON.stringify({
        type: 'model_changed',
        modelId: 'model-1',
        actorUserId: 'other-user',
        eventId: 'late-event',
      }),
    })
    await flushPromises()

    expect(onModelTopicBroadcast).not.toHaveBeenCalled()
    expect(
      vi
        .mocked(apiGet)
        .mock.calls.filter(([path]) => path.startsWith('/nodes?') || path.startsWith('/links?'))
    ).toEqual([])
    wrapper.unmount()
  })

  it('applies granular STOMP events without unscoped node/link snapshot fallback', async () => {
    const snapshotReady = ref(false)
    const state = ref(createEmptyModelEditorState())
    const currentModel = ref<ModelData | null>(model({ name: 'old model' }))
    state.value.modelId = 'model-1'
    const store = new ModelPartialStore()
    store.mergeNodes(
      [
        toEditorNode({
          id: 'node-1',
          name: 'old',
          modelId: 'model-1',
          ownerId: 'owner-1',
          nodeTypeId: 'node-type-1',
          attrs: null,
        }),
      ],
      { kind: 'partial' }
    )
    state.value.nodes = store.nodes
    const fetchNode = vi.fn(async () => ({
      success: true as const,
      data: {
        id: 'node-1',
        name: 'remote',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'node-type-1',
        attrs: null,
      },
    }))
    const fetchModel = vi.fn(async () => ({
      success: true as const,
      data: model({ name: 'remote model', updatedAt: '2026-01-02T00:00:00.000Z' }),
    }))
    const revisionProbe = deferred<ApiResult<ModelData>>()
    vi.mocked(apiGet).mockImplementation(async path => {
      if (path === '/models/model-1') return revisionProbe.promise
      throw new Error(`Unexpected unscoped live-sync GET: ${path}`)
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
            initialSnapshotReady: snapshotReady,
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            currentUserId: ref('viewer-1'),
            mode: 'ws',
            granularSync: {
              store,
              publishMaterializedRows: () => {
                state.value.nodes = store.nodes
                state.value.links = store.links
              },
              refreshVisibleChildrenScope: vi.fn(async () => undefined),
              fetchers: {
                fetchNode,
                fetchLink: vi.fn(),
                fetchDiagram: vi.fn(),
                fetchModel,
              },
            },
          })
          return () => null
        },
      })
    )
    await flushPromises()
    snapshotReady.value = true
    const client = stompMock.clients.at(-1)
    client?.options.onConnect()
    await flushPromises()

    client?.subscriptions.get('/topic/models/model-1')?.({
      body: JSON.stringify({
        type: 'model_changed',
        modelId: 'model-1',
        actorUserId: 'other-user',
        eventId: 'granular-1',
        events: [
          { type: 'node_updated', entity: 'node', id: 'node-1', revision: 2 },
          { type: 'model_updated', entity: 'model', id: 'model-1', revision: 2 },
        ],
      }),
    })
    await flushPromises()
    await flushPromises()
    revisionProbe.resolve({
      success: true,
      data: model({ updatedAt: '2026-01-02T00:00:00.000Z' }),
    })
    await flushPromises()
    await flushPromises()

    expect(fetchNode).toHaveBeenCalledWith('node-1', expect.any(AbortSignal))
    expect(fetchModel).toHaveBeenCalledWith('model-1', expect.any(AbortSignal))
    expect(state.value.nodes[0]?.name).toBe('remote')
    expect(currentModel.value?.name).toBe('remote model')
    expect(
      vi
        .mocked(apiGet)
        .mock.calls.filter(([path]) => path.startsWith('/nodes?') || path.startsWith('/links?'))
    ).toEqual([])
    wrapper.unmount()
  })

  it('keeps shell-ready granular events queued after catalog failure and applies them on retry success', async () => {
    const snapshotReady = ref(true)
    const catalogReady = ref(false)
    const state = ref(createEmptyModelEditorState())
    state.value.modelId = 'model-1'
    const currentModel = ref<ModelData | null>(model())
    const store = new ModelPartialStore()
    store.mergeNodes(
      [
        toEditorNode({
          id: 'node-1',
          name: 'old',
          modelId: 'model-1',
          ownerId: 'owner-1',
          nodeTypeId: 'node-type-1',
          attrs: null,
        }),
      ],
      { kind: 'partial' }
    )
    state.value.nodes = store.nodes
    const fetchNode = vi.fn(async () => ({
      success: true as const,
      data: {
        id: 'node-1',
        name: 'remote',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'node-type-1',
        attrs: JSON.stringify({
          notationComponents: { 'notation-1': { componentId: 'component-1' } },
        }),
      },
    }))
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: model({ updatedAt: '2026-01-02T00:00:00.000Z' }),
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
            initialSnapshotReady: snapshotReady,
            catalogReady,
            isSaving: ref(false),
            modelDirty: ref(false),
            ensureNotationRelationsAndRules: vi.fn(async () => undefined),
            currentUserId: ref('viewer-1'),
            mode: 'ws',
            granularSync: {
              store,
              publishMaterializedRows: () => {
                state.value.nodes = store.nodes
                state.value.links = store.links
              },
              refreshVisibleChildrenScope: vi.fn(async () => undefined),
              fetchers: {
                fetchNode,
                fetchLink: vi.fn(),
                fetchDiagram: vi.fn(),
                fetchModel: vi.fn(),
              },
            },
          })
          return () => null
        },
      })
    )
    await flushPromises()
    const client = stompMock.clients.at(-1)
    client?.options.onConnect()
    await flushPromises()

    client?.subscriptions.get('/topic/models/model-1')?.({
      body: JSON.stringify({
        type: 'model_changed',
        modelId: 'model-1',
        actorUserId: 'other-user',
        eventId: 'catalog-pending',
        events: [{ type: 'node_updated', entity: 'node', id: 'node-1', revision: 2 }],
      }),
    })
    await flushPromises()

    expect(fetchNode).not.toHaveBeenCalled()
    expect(state.value.nodes[0]?.name).toBe('old')

    state.value.nodeTypes = [
      {
        id: 'node-type-1',
        name: 'Node type',
        ownerId: 'owner-1',
        attrs: JSON.stringify({
          customProperties: [{ id: 'tier', name: 'tier', type: 'string', defaultValue: 'app' }],
        }),
      },
    ]
    state.value.components = [
      {
        id: 'component-1',
        name: 'Component',
        version: '1.0.0',
        notationId: 'notation-1',
        ownerId: 'owner-1',
        nodeTypeId: 'node-type-1',
        attrs: JSON.stringify({
          customProperties: [{ id: 'status', name: 'status', type: 'string', defaultValue: 'draft' }],
        }),
      },
    ]
    catalogReady.value = true
    await flushPromises()
    await flushPromises()

    expect(fetchNode).toHaveBeenCalledWith('node-1', expect.any(AbortSignal))
    expect(state.value.nodes[0]?.name).toBe('remote')
    expect(state.value.nodes[0]?.parsedAttrs.typeProperties).toEqual({ tier: 'app' })
    expect(
      state.value.nodes[0]?.parsedAttrs.componentProperties['notation-1']?.['component-1']
    ).toEqual({ status: 'draft' })
    catalogReady.value = true
    await flushPromises()
    expect(fetchNode).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
