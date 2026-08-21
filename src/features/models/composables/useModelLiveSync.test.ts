import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref, type Ref } from 'vue'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { refreshAccessToken, type ApiResult } from '@/api/apiClient'
import { apiGet } from '@/composables/useApi'
import type { ModelData } from '@/types/entities'
import { createEmptyModelEditorState } from '../types'
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
    stompMock.clients.length = 0
    stompMock.autoConnect = false
    stompMock.rejectDeactivate = false
    vi.mocked(refreshAccessToken).mockReset()
    vi.mocked(refreshAccessToken).mockResolvedValue(true)
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
            initialSnapshotReady: ref(true),
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

  it('coalesces multiple foreign changes during a pull into exactly one repeat', async () => {
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
    expect(nodePulls).toBe(1)
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
    expect(nodePulls).toBe(1)

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

    expect(nodePulls).toBe(2)
    wrapper.unmount()
  })

  it('does not merge an old model pull and starts the new model pull once', async () => {
    const modelId = ref('model-1')
    const firstNodes = deferred<ApiResult<unknown>>()
    const state = ref(createEmptyModelEditorState())
    let modelTwoPulls = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/nodes?') && path.includes('modelId=model-1')) {
        return firstNodes.promise
      }
      if (path.startsWith('/nodes?') && path.includes('modelId=model-2')) {
        modelTwoPulls += 1
        return {
          success: true,
          data: page([
            {
              id: 'node-2',
              name: 'New model node',
              modelId: 'model-2',
              ownerId: 'owner-1',
              nodeTypeId: 'node-type-1',
              parentNodeId: null,
              attrs: null,
            },
          ]),
        }
      }
      if (path.startsWith('/links?') || path.startsWith('/diagrams?')) {
        return { success: true, data: page([]) }
      }
      if (path === '/models/model-1') return { success: true, data: model() }
      if (path === '/models/model-2') {
        return { success: true, data: model({ id: 'model-2', name: 'Model 2' }) }
      }
      throw new Error(`Unexpected apiGet path: ${path}`)
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          useModelLiveSync({
            modelId,
            state,
            model: ref(model()),
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
    firstNodes.resolve({
      success: true,
      data: page([
        {
          id: 'node-old',
          name: 'Old model node',
          modelId: 'model-1',
          ownerId: 'owner-1',
          nodeTypeId: 'node-type-1',
          parentNodeId: null,
          attrs: null,
        },
      ]),
    })
    await flushPromises()
    await flushPromises()

    expect(state.value.nodes.map(node => node.id)).toEqual(['node-2'])
    expect(modelTwoPulls).toBe(1)
    wrapper.unmount()
  })

  it('coalesces session resync and websocket connect in the same burst', async () => {
    const snapshotReady = ref(false)
    const enabled = ref(true)
    let nodePulls = 0
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
    const pullsBeforeBurst = nodePulls

    stompMock.autoConnect = true
    enabled.value = false
    await flushPromises()
    enabled.value = true
    await flushPromises()

    expect(nodePulls - pullsBeforeBurst).toBe(1)
    wrapper.unmount()
  })

  it('waits for the poll interval after readiness instead of pulling immediately', async () => {
    vi.useFakeTimers()
    const snapshotReady = ref(false)
    let nodePulls = 0
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
    expect(nodePulls).toBe(0)

    await vi.advanceTimersByTimeAsync(14_999)
    expect(nodePulls).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(nodePulls).toBe(1)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('does not start an immediate poll repeat after a pull spans multiple intervals', async () => {
    vi.useFakeTimers()
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
    expect(nodePulls).toBe(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(nodePulls).toBe(1)
    firstNodes.resolve({ success: true, data: page([]) })
    await flushPromises()
    await flushPromises()
    expect(nodePulls).toBe(1)

    await vi.advanceTimersByTimeAsync(14_999)
    expect(nodePulls).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(nodePulls).toBe(2)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('keeps the pull in flight until rejected siblings settle before a foreign repeat', async () => {
    const snapshotReady = ref(false)
    const firstLinks = deferred<ApiResult<unknown>>()
    let nodePulls = 0
    let linkPulls = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/nodes?')) {
        nodePulls += 1
        if (nodePulls === 1) throw new Error('nodes failed')
        return { success: true, data: page([]) }
      }
      if (path.startsWith('/links?')) {
        linkPulls += 1
        if (linkPulls === 1) return firstLinks.promise
        return { success: true, data: page([]) }
      }
      if (path.startsWith('/diagrams?')) return { success: true, data: page([]) }
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
            mode: 'ws',
          })
          return () => null
        },
      })
    )
    await flushPromises()
    const client = stompMock.clients.at(-1)
    client?.options.onConnect()
    snapshotReady.value = true
    await flushPromises()
    const callback = client?.subscriptions.get('/topic/models/model-1')
    callback?.({
      body: JSON.stringify({
        type: 'model_changed',
        modelId: 'model-1',
        actorUserId: 'other-user',
        eventId: 'event-1',
      }),
    })
    await flushPromises()
    expect(nodePulls).toBe(1)

    callback?.({
      body: JSON.stringify({
        type: 'model_changed',
        modelId: 'model-1',
        actorUserId: 'other-user',
        eventId: 'event-2',
      }),
    })
    await flushPromises()
    expect(nodePulls).toBe(1)

    firstLinks.resolve({ success: true, data: page([]) })
    await flushPromises()
    await flushPromises()
    expect(nodePulls).toBe(2)

    wrapper.unmount()
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

  it('does not suppress a real reconnect when websocket connected before readiness', async () => {
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

    expect(nodePulls).toBe(1)
    wrapper.unmount()
  })

  it('contains pull failures and allows the next scheduled pull', async () => {
    let nodePulls = 0
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/nodes?')) {
        nodePulls += 1
        if (nodePulls === 1) throw new Error('nodes failed')
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

    expect(nodePulls).toBe(2)
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
    expect(apiGet).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
