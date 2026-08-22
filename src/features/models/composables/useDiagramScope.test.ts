import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/composables/useApi'
import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
import { createEmptyModelEditorState, type ModelEditorState } from '../types'
import { parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import { toEditorDiagram } from './modelEditorMappers'
import { useDiagramScope } from './useDiagramScope'
import { useModelPartialStore } from './useModelPartialStore'

vi.mock('@/composables/useApi', () => ({
  apiFetch: vi.fn(),
}))

const ok = <T>(data: T) => ({ success: true as const, data })
const nodeResponse = (id: string, name = id): NodeResponse => ({
  id,
  name,
  modelId: 'model-1',
  ownerId: 'owner-1',
  nodeTypeId: 'node-type-1',
  parentNodeId: null,
  attrs: null,
})
const linkResponse = (
  id: string,
  sourceId: string,
  targetId: string,
  updatedAt: string | null = null
): LinkResponse => ({
  id,
  modelId: 'model-1',
  ownerId: 'owner-1',
  linkTypeId: 'link-type-1',
  sourceId,
  targetId,
  attrs: null,
  updatedAt,
})

function diagramResponse(
  id: string,
  nodeIds: readonly string[],
  linkIds: readonly string[] = []
): DiagramResponse {
  return {
    id,
    name: id,
    version: '1.0.0',
    modelId: 'model-1',
    ownerId: 'owner-1',
    notationId: 'notation-1',
    nodeId: null,
    attrs: JSON.stringify({
      instances: {
        nodes: nodeIds.map((modelNodeId, index) => ({
          id: `${id}-node-${index}`,
          modelNodeId,
          x: 0,
          y: 0,
        })),
        edges: linkIds.map((modelLinkId, index) => ({
          id: `${id}-edge-${index}`,
          modelLinkId,
          sourceInstanceId: `${id}-node-0`,
          targetInstanceId: `${id}-node-1`,
        })),
      },
    }),
    createdAt: null,
    updatedAt: null,
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function mountScope(
  stateValue?: ModelEditorState,
  selectedId = 'diagram-1',
  options: { autoOpen?: boolean; beforeOpen?: () => Promise<void> } = {}
) {
  const state = ref(stateValue ?? createEmptyModelEditorState())
  const selectedDiagramId = ref<string | null>(selectedId)
  const vueScope = effectScope()
  const result = vueScope.run(() => {
    const partialStore = useModelPartialStore(state)
    partialStore.store.replaceMaterializedRows(state.value.nodes, state.value.links)
    return {
      partialStore,
      diagramScope: useDiagramScope({ state, selectedDiagramId, partialStore, ...options }),
    }
  })!
  return { state, selectedDiagramId, vueScope, ...result }
}

describe('useDiagramScope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not resolve diagram-only node ids as model nodes', async () => {
    const realNodeId = '8c865e01-108f-4b99-a46a-421d4fa54a64'
    const containerId = '__diagram-container__:f3881715-48ad-45c4-b401-93534b6e6797'
    const edgeAnchorId = '__diagram-edge-anchor__:7c5176ac-6b72-4fc6-9e75-2f68f2e157af'
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [
      toEditorDiagram(diagramResponse('diagram-1', [realNodeId, containerId, edgeAnchorId])),
    ]
    vi.mocked(apiFetch).mockImplementation(async (path, options) => {
      if (path.endsWith('/nodes:resolve')) {
        const body = JSON.parse(String(options?.body)) as { nodeIds: string[] }
        return ok({ nodes: body.nodeIds.map(id => nodeResponse(id)), missingIds: [] })
      }
      return ok({ links: [], missingLinkIds: [] })
    })
    const mounted = mountScope(state)

    await mounted.diagramScope.open('diagram-1')

    const resolvedNodeIds = vi
      .mocked(apiFetch)
      .mock.calls.filter(([path]) => path.endsWith('/nodes:resolve'))
      .flatMap(([, options]) => JSON.parse(String(options?.body)) as { nodeIds: string[] })
      .flatMap(body => body.nodeIds)
    expect(resolvedNodeIds).toEqual([realNodeId])
    expect(resolvedNodeIds).not.toContain(containerId)
    expect(resolvedNodeIds).not.toContain(edgeAnchorId)
    mounted.vueScope.stop()
  })

  it('does not resolve edge-anchor link endpoints as model nodes', async () => {
    const diagramNodeId = '8c865e01-108f-4b99-a46a-421d4fa54a64'
    const endpointNodeId = '953d4579-7de9-47db-a2ed-072817cd3b0c'
    const edgeAnchorId = '__diagram-edge-anchor__:7c5176ac-6b72-4fc6-9e75-2f68f2e157af'
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [toEditorDiagram(diagramResponse('diagram-1', [diagramNodeId]))]
    vi.mocked(apiFetch).mockImplementation(async (path, options) => {
      const body = JSON.parse(String(options?.body)) as { nodeIds?: string[] }
      if (path.endsWith('/nodes:resolve')) {
        return ok({ nodes: (body.nodeIds ?? []).map(id => nodeResponse(id)), missingIds: [] })
      }
      return ok({
        links: [linkResponse('link-1', edgeAnchorId, endpointNodeId)],
        missingLinkIds: [],
      })
    })
    const mounted = mountScope(state)

    await mounted.diagramScope.open('diagram-1')

    const nodeResolveBodies = vi
      .mocked(apiFetch)
      .mock.calls.filter(([path]) => path.endsWith('/nodes:resolve'))
      .map(([, options]) => JSON.parse(String(options?.body)) as { nodeIds: string[] })
    expect(nodeResolveBodies.map(body => body.nodeIds)).toEqual([[diagramNodeId], [endpointNodeId]])
    expect(nodeResolveBodies[1]?.nodeIds).not.toContain(edgeAnchorId)
    mounted.vueScope.stop()
  })

  it('hydrates attrs and resolves 4501 node ids in 2000/2000/501 chunks with only explicit and incident links', async () => {
    const nodeIds = Array.from({ length: 4501 }, (_, index) => `n-${index}`)
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [
      toEditorDiagram({
        ...diagramResponse('diagram-1', [], []),
        attrs: null,
      }),
    ]
    vi.mocked(apiFetch).mockImplementation(async (path, options) => {
      if (path === '/diagrams/diagram-1') {
        return ok(
          diagramResponse('diagram-1', [...nodeIds, 'n-0'], ['link-explicit', 'link-explicit'])
        )
      }
      const body = JSON.parse(String(options?.body)) as {
        nodeIds?: string[]
        linkIds?: string[]
        endpointNodeIds?: string[]
      }
      if (path.endsWith('/nodes:resolve')) {
        return ok({
          nodes: (body.nodeIds ?? []).map(id => nodeResponse(id)),
          missingIds: [],
        })
      }
      const endpointIds = body.endpointNodeIds ?? []
      const links: LinkResponse[] = []
      if (body.linkIds?.includes('link-explicit')) {
        links.push(linkResponse('link-explicit', 'outside-source', 'n-0'))
      }
      if (endpointIds.includes('n-2000')) {
        links.push(linkResponse('link-incident', 'n-2000', 'outside-target'))
      }
      return ok({ links, missingLinkIds: [] })
    })
    const mounted = mountScope(state)

    await mounted.diagramScope.open('diagram-1')

    const nodeBodies = vi
      .mocked(apiFetch)
      .mock.calls.filter(([path]) => path.endsWith('/nodes:resolve'))
      .map(([, options]) => JSON.parse(String(options?.body)) as { nodeIds: string[] })
    const linkBodies = vi
      .mocked(apiFetch)
      .mock.calls.filter(([path]) => path.endsWith('/links:resolve'))
      .map(
        ([, options]) =>
          JSON.parse(String(options?.body)) as { linkIds: string[]; endpointNodeIds: string[] }
      )
    expect(nodeBodies.slice(0, 3).map(body => body.nodeIds.length)).toEqual([2000, 2000, 501])
    expect(nodeBodies[3]?.nodeIds).toEqual(['outside-source', 'outside-target'])
    expect(linkBodies.map(body => body.endpointNodeIds.length)).toEqual([2000, 2000, 501])
    expect(linkBodies.flatMap(body => body.linkIds)).toEqual(['link-explicit'])
    expect(mounted.state.value.nodes).toHaveLength(4503)
    expect(mounted.state.value.links.map(link => link.id)).toEqual([
      'link-explicit',
      'link-incident',
    ])
    expect(mounted.diagramScope.diagramScopeReady.value).toBe(true)
    expect(mounted.diagramScope.progress.value).toBeNull()
    expect(mounted.diagramScope.error.value).toBeNull()
    mounted.vueScope.stop()
  })

  it('preserves dirty rows and treats missing ids as non-authoritative', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.nodes = [
      {
        ...nodeResponse('n-dirty', 'local node'),
        parsedAttrs: parseNodeAttrs(null),
        _isDirty: true,
      },
      { ...nodeResponse('n-unmentioned'), parsedAttrs: parseNodeAttrs(null) },
    ]
    state.links = [
      {
        ...linkResponse('l-dirty', 'n-dirty', 'n-missing', '2026-01-01T00:00:00Z'),
        parsedAttrs: parseLinkAttrs(null),
        _isDeleted: true,
      },
      {
        ...linkResponse('l-unmentioned', 'n-unmentioned', 'n-dirty'),
        parsedAttrs: parseLinkAttrs(null),
      },
    ]
    state.diagrams = [
      toEditorDiagram(diagramResponse('diagram-1', ['n-dirty', 'n-missing'], ['l-dirty'])),
    ]
    vi.mocked(apiFetch).mockImplementation(async path => {
      if (path.endsWith('/nodes:resolve')) {
        return ok({
          nodes: [nodeResponse('n-dirty', 'remote node')],
          missingIds: ['n-missing'],
        })
      }
      return ok({
        links: [linkResponse('l-dirty', 'n-dirty', 'n-missing', '2026-02-01T00:00:00Z')],
        missingLinkIds: ['l-missing'],
      })
    })
    const mounted = mountScope(state)

    await mounted.diagramScope.open('diagram-1')

    expect(mounted.state.value.nodes.find(node => node.id === 'n-dirty')?.name).toBe('local node')
    expect(mounted.state.value.nodes.some(node => node.id === 'n-unmentioned')).toBe(true)
    expect(mounted.state.value.links.find(link => link.id === 'l-dirty')?.updatedAt).toBe(
      '2026-01-01T00:00:00Z'
    )
    expect(mounted.state.value.links.find(link => link.id === 'l-dirty')?._isDeleted).toBe(true)
    expect(mounted.state.value.links.some(link => link.id === 'l-unmentioned')).toBe(true)
    mounted.vueScope.stop()
  })

  it('ignores stale completion after a diagram switch', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [
      toEditorDiagram(diagramResponse('diagram-1', ['node-old'])),
      toEditorDiagram(diagramResponse('diagram-2', ['node-current'])),
    ]
    const oldNodes = deferred<ReturnType<typeof ok>>()
    vi.mocked(apiFetch).mockImplementation(async (_path, options) => {
      const body = JSON.parse(String(options?.body)) as {
        nodeIds?: string[]
        endpointNodeIds?: string[]
      }
      if (body.nodeIds?.includes('node-old')) return oldNodes.promise
      if (body.nodeIds) {
        return ok({ nodes: body.nodeIds.map(id => nodeResponse(id)), missingIds: [] })
      }
      return ok({ links: [], missingLinkIds: [] })
    })
    const mounted = mountScope(state)
    const oldOpen = mounted.diagramScope.open('diagram-1')
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))

    mounted.selectedDiagramId.value = 'diagram-2'
    await mounted.diagramScope.open('diagram-2')
    oldNodes.resolve(ok({ nodes: [nodeResponse('node-old')], missingIds: [] }))
    await oldOpen

    expect(mounted.state.value.nodes.map(node => node.id)).toEqual(['node-current'])
    expect(mounted.diagramScope.readyDiagramId.value).toBe('diagram-2')
    expect(mounted.diagramScope.diagramScopeReady.value).toBe(true)
    mounted.vueScope.stop()
  })

  it('cancels an in-flight scope without merge, readiness, progress, or error', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [toEditorDiagram(diagramResponse('diagram-1', ['node-late']))]
    const pending = deferred<ReturnType<typeof ok>>()
    vi.mocked(apiFetch).mockReturnValue(pending.promise)
    const mounted = mountScope(state)
    const opening = mounted.diagramScope.open('diagram-1')
    await vi.waitFor(() => expect(mounted.diagramScope.progress.value).not.toBeNull())

    mounted.diagramScope.cancel()
    pending.resolve(ok({ nodes: [nodeResponse('node-late')], missingIds: [] }))
    await opening

    expect(mounted.state.value.nodes).toEqual([])
    expect(mounted.diagramScope.diagramScopeReady.value).toBe(false)
    expect(mounted.diagramScope.progress.value).toBeNull()
    expect(mounted.diagramScope.error.value).toBeNull()
    mounted.vueScope.stop()
  })

  it('threads an external abort through reload and ignores a late diagram response', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [
      toEditorDiagram({
        ...diagramResponse('diagram-1', [], []),
        attrs: null,
      }),
    ]
    const pendingDiagram = deferred<ReturnType<typeof ok>>()
    vi.mocked(apiFetch).mockImplementation(async path => {
      if (path === '/diagrams/diagram-1') return pendingDiagram.promise
      if (path.endsWith('/nodes:resolve')) return ok({ nodes: [nodeResponse('late')], missingIds: [] })
      return ok({ links: [], missingLinkIds: [] })
    })
    const mounted = mountScope(state)
    const controller = new AbortController()

    const reloading = mounted.diagramScope.reload(controller.signal)
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    const requestSignal = vi.mocked(apiFetch).mock.calls[0]?.[1]?.signal

    controller.abort()
    expect(requestSignal?.aborted).toBe(true)
    pendingDiagram.resolve(ok(diagramResponse('diagram-1', ['late'])))
    await reloading

    expect(mounted.state.value.nodes).toEqual([])
    expect(mounted.state.value.diagrams[0]?._attrsPending).toBe(true)
    expect(mounted.diagramScope.diagramScopeReady.value).toBe(false)
    expect(mounted.diagramScope.progress.value).toBeNull()
    mounted.vueScope.stop()
  })

  it('keeps a 413 link-union error local and retries the same diagram', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [toEditorDiagram(diagramResponse('diagram-1', ['node-1'], ['link-explicit']))]
    let rejectLinks = true
    vi.mocked(apiFetch).mockImplementation(async path => {
      if (path.endsWith('/nodes:resolve')) {
        return ok({ nodes: [nodeResponse('node-1')], missingIds: [] })
      }
      if (rejectLinks) {
        return {
          success: false as const,
          error: {
            status: 413,
            message: 'Too many links',
            details: { code: 'MODEL_LINK_RESOLVE_RESULT_LIMIT_EXCEEDED' },
          },
        }
      }
      return ok({
        links: [linkResponse('link-explicit', 'node-1', 'node-1')],
        missingLinkIds: [],
      })
    })
    const mounted = mountScope(state)

    await mounted.diagramScope.open('diagram-1')

    expect(mounted.diagramScope.diagramScopeReady.value).toBe(false)
    expect(mounted.diagramScope.error.value).toEqual({
      status: 413,
      code: 'MODEL_LINK_RESOLVE_RESULT_LIMIT_EXCEEDED',
      message: 'Too many links',
    })
    expect(mounted.state.value.nodes).toEqual([])
    expect(mounted.state.value.links).toEqual([])

    rejectLinks = false
    await mounted.diagramScope.reload()

    expect(mounted.diagramScope.error.value).toBeNull()
    expect(mounted.diagramScope.diagramScopeReady.value).toBe(true)
    expect(mounted.state.value.nodes.map(node => node.id)).toEqual(['node-1'])
    expect(mounted.state.value.links.map(link => link.id)).toEqual(['link-explicit'])
    mounted.vueScope.stop()
  })

  it('rejects an aggregate deduplicated link union above 5000 before any partial merge', async () => {
    const nodeIds = Array.from({ length: 3001 }, (_, index) => `n-${index}`)
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [toEditorDiagram(diagramResponse('diagram-1', nodeIds))]
    let linkBatch = 0
    vi.mocked(apiFetch).mockImplementation(async (path, options) => {
      const body = JSON.parse(String(options?.body)) as {
        nodeIds?: string[]
        endpointNodeIds?: string[]
      }
      if (path.endsWith('/nodes:resolve')) {
        return ok({
          nodes: (body.nodeIds ?? []).map(id => nodeResponse(id)),
          missingIds: [],
        })
      }
      const start = linkBatch * 2500
      const count = linkBatch === 0 ? 2500 : 2501
      linkBatch += 1
      return ok({
        links: Array.from({ length: count }, (_, index) =>
          linkResponse(`resolved-${start + index}`, 'n-0', 'n-1')
        ),
        missingLinkIds: [],
      })
    })
    const mounted = mountScope(state)

    await mounted.diagramScope.open('diagram-1')

    expect(linkBatch).toBe(2)
    expect(mounted.diagramScope.error.value).toEqual({
      status: 413,
      code: 'MODEL_LINK_RESOLVE_RESULT_LIMIT_EXCEEDED',
      message: 'Resolved diagram scope exceeds 5000 links.',
    })
    expect(mounted.state.value.nodes).toEqual([])
    expect(mounted.state.value.links).toEqual([])
    expect(mounted.diagramScope.diagramScopeReady.value).toBe(false)
    mounted.vueScope.stop()
  })

  it('invalidates readiness when the partial-store generation changes', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [toEditorDiagram(diagramResponse('diagram-1', []))]
    const mounted = mountScope(state)

    await mounted.diagramScope.open('diagram-1')
    expect(mounted.diagramScope.diagramScopeReady.value).toBe(true)

    mounted.partialStore.resetPartialScopes('model-1')

    expect(mounted.diagramScope.diagramScopeReady.value).toBe(false)
    expect(mounted.diagramScope.readyDiagramId.value).toBeNull()
    mounted.vueScope.stop()
  })

  it('reopens the same selected diagram after a partial-store generation reset', async () => {
    const state = createEmptyModelEditorState()
    state.modelId = 'model-1'
    state.diagrams = [toEditorDiagram(diagramResponse('diagram-1', ['n-1']))]
    let nodeResolveCalls = 0
    vi.mocked(apiFetch).mockImplementation(async path => {
      if (path.endsWith('/nodes:resolve')) {
        nodeResolveCalls += 1
        return ok({ nodes: [nodeResponse('n-1')], missingIds: [] })
      }
      return ok({ links: [], missingLinkIds: [] })
    })
    const mounted = mountScope(state, 'diagram-1', { autoOpen: true })

    await vi.waitFor(() => {
      expect(mounted.diagramScope.diagramScopeReady.value).toBe(true)
    })
    mounted.partialStore.resetPartialScopes('model-1')
    await vi.waitFor(() => {
      expect(nodeResolveCalls).toBe(2)
      expect(mounted.diagramScope.diagramScopeReady.value).toBe(true)
    })

    mounted.vueScope.stop()
  })
})
