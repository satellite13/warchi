import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDelete, apiPost } from '@/composables/useApi'
import { parseDiagramAttrs } from '../modelAttrs'
import type { ModelEditorState } from '../types'
import { useDiagramRealtimeCollab, type DiagramSpectatorEntry } from './useDiagramRealtimeCollab'

vi.mock('@/composables/useApi', () => ({
  apiDelete: vi.fn(),
  apiPost: vi.fn(),
}))

function createState(): ModelEditorState {
  return {
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodes: [],
    links: [],
    diagrams: [
      {
        id: 'diagram-1',
        name: 'Diagram',
        version: '1.0.0',
        modelId: 'model-1',
        ownerId: 'owner-1',
        notationId: 'notation-1',
        nodeId: null,
        parsedAttrs: parseDiagramAttrs(null),
      },
    ],
    notations: [],
    nodeTypes: [],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
  }
}

function mountCollab(options?: {
  isLockHolder?: boolean
  isSpectator?: boolean
  selectedDiagramId?: string | null
}) {
  const state = ref(createState()) as Ref<ModelEditorState>
  const selectedDiagramId = ref(options?.selectedDiagramId ?? 'diagram-1')
  const currentUserId = ref('user-self')
  const isLockHolder = ref(options?.isLockHolder ?? false)
  const isSpectator = ref(options?.isSpectator ?? false)
  let collab!: ReturnType<typeof useDiagramRealtimeCollab>

  const wrapper = mount(
    defineComponent({
      setup() {
        collab = useDiagramRealtimeCollab({
          state,
          selectedDiagramId,
          currentUserId,
          isLockHolder,
          isSpectator,
          getDiagramRenderer: () => ({
            screenToWorld: (x: number, y: number) => ({ x: x + 10, y: y + 20 }),
          }) as never,
        })
        return () => null
      },
    })
  )

  return { wrapper, collab, state, selectedDiagramId, currentUserId, isLockHolder, isSpectator }
}

describe('useDiagramRealtimeCollab', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.mocked(apiDelete).mockReset()
    vi.mocked(apiPost).mockReset()
    vi.mocked(apiPost).mockResolvedValue({ success: true, data: {} })
    vi.mocked(apiDelete).mockResolvedValue({ success: true, data: undefined })
  })

  it('applies remote diagram live instances for spectators', () => {
    const { collab, state } = mountCollab({ isSpectator: true })

    collab.handleModelTopicBroadcast({
      type: 'diagram_live',
      diagramId: 'diagram-1',
      actorUserId: 'user-other',
      instances: {
        nodes: [{ id: 'node-instance-1', modelNodeId: 'node-1', x: 10, y: 20 }],
        edges: [],
      },
    })

    expect(state.value.diagrams[0]?.parsedAttrs.instances.nodes).toEqual([
      { id: 'node-instance-1', modelNodeId: 'node-1', x: 10, y: 20 },
    ])
  })

  it('ignores remote diagram live instances when local diagram is dirty', () => {
    const { collab, state } = mountCollab({ isSpectator: true })
    state.value.diagrams[0]!._isDirty = true

    collab.handleModelTopicBroadcast({
      type: 'diagram_live',
      diagramId: 'diagram-1',
      actorUserId: 'user-other',
      instances: {
        nodes: [{ id: 'node-instance-1', modelNodeId: 'node-1', x: 10, y: 20 }],
        edges: [],
      },
    })

    expect(state.value.diagrams[0]?.parsedAttrs.instances.nodes).toEqual([])
  })

  it('tracks remote editor pointer only for spectator broadcasts from other users', () => {
    const { collab } = mountCollab({ isSpectator: true })

    collab.handleModelTopicBroadcast({
      type: 'diagram_pointer',
      diagramId: 'diagram-1',
      actorUserId: 'user-other',
      worldX: 12,
      worldY: 34,
    })
    expect(collab.remoteEditorPointer.value).toEqual({ worldX: 12, worldY: 34, visible: true })

    collab.handleModelTopicBroadcast({
      type: 'diagram_pointer',
      diagramId: 'diagram-1',
      actorUserId: 'user-self',
      worldX: 99,
      worldY: 99,
    })
    expect(collab.remoteEditorPointer.value).toEqual({ worldX: 12, worldY: 34, visible: true })
  })

  it('updates spectator list only for the lock holder', () => {
    const { collab } = mountCollab({ isLockHolder: true })
    const viewers: DiagramSpectatorEntry[] = [{ userId: 'user-2', displayName: 'Second User' }]

    collab.handleModelTopicBroadcast({
      type: 'diagram_spectators',
      diagramId: 'diagram-1',
      viewers,
    })

    expect(collab.diagramSpectators.value).toEqual(viewers)
  })

  it('sends pointer coordinates in world space for the lock holder', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.200Z'))
    const { collab } = mountCollab({ isLockHolder: true })
    collab.handleModelTopicBroadcast({
      type: 'diagram_spectators',
      diagramId: 'diagram-1',
      viewers: [{ userId: 'u2', displayName: 'B' }],
    })
    await Promise.resolve()
    await Promise.resolve()

    collab.onCanvasMouseMoveForPointer(5, 6)
    collab.onCanvasMouseLeaveForPointer()

    expect(apiPost).toHaveBeenCalledWith('/diagram-locks/diagram-1/pointer', {
      worldX: 15,
      worldY: 26,
      visible: true,
    })
    expect(apiPost).toHaveBeenCalledWith('/diagram-locks/diagram-1/pointer', {
      worldX: 0,
      worldY: 0,
      visible: false,
    })
  })

  it('does not post live or pointer when there are no spectators', () => {
    const { collab, state } = mountCollab({ isLockHolder: true })
    state.value.diagrams[0]!.parsedAttrs.instances = {
      nodes: [{ id: 'n1', modelNodeId: 'm-n1', x: 1, y: 0 }],
      edges: [],
    }

    collab.flushLivePushNow()
    collab.onCanvasMouseMoveForPointer(5, 6)
    collab.onCanvasMouseLeaveForPointer()

    const paths = vi.mocked(apiPost).mock.calls.map((call) => String(call[0]))
    expect(paths.some((path) => path.endsWith('/live') || path.endsWith('/pointer'))).toBe(false)
  })

  it('posts a patch of changed instances after a spectator is present', async () => {
    const { collab, state } = mountCollab({ isLockHolder: true })
    const node = { id: 'n1', modelNodeId: 'm-n1', x: 1, y: 0 }
    const edge = {
      id: 'e1',
      modelLinkId: 'l-e1',
      sourceInstanceId: 'n1',
      targetInstanceId: 'n1',
    }
    state.value.diagrams[0]!.parsedAttrs.instances = {
      nodes: [node],
      edges: [edge],
    }

    collab.handleModelTopicBroadcast({
      type: 'diagram_spectators',
      diagramId: 'diagram-1',
      viewers: [{ userId: 'u2', displayName: 'B' }],
    })
    await Promise.resolve()
    await Promise.resolve()

    state.value.diagrams[0]!.parsedAttrs.instances = {
      nodes: [{ ...node, x: 9 }],
      edges: [edge],
    }
    collab.flushLivePushNow()
    await Promise.resolve()
    await Promise.resolve()

    const livePosts = vi
      .mocked(apiPost)
      .mock.calls.filter((call) => String(call[0]) === '/diagram-locks/diagram-1/live')
    const last = livePosts.at(-1)?.[1] as Record<string, unknown>
    expect(last.kind).toBe('patch')
    expect(last.upsertNodes).toEqual([{ ...node, x: 9 }])
    expect(last.upsertEdges ?? []).toEqual([])
  })

  it('sends snapshot chunks when a new spectator appears', async () => {
    const { collab, state } = mountCollab({ isLockHolder: true })
    state.value.diagrams[0]!.parsedAttrs.instances = {
      nodes: [{ id: 'n1', modelNodeId: 'm-n1', x: 1, y: 0 }],
      edges: [
        {
          id: 'e1',
          modelLinkId: 'l-e1',
          sourceInstanceId: 'n1',
          targetInstanceId: 'n1',
        },
      ],
    }

    collab.handleModelTopicBroadcast({
      type: 'diagram_spectators',
      diagramId: 'diagram-1',
      viewers: [{ userId: 'u2', displayName: 'B' }],
    })
    await Promise.resolve()
    await Promise.resolve()

    const livePosts = vi
      .mocked(apiPost)
      .mock.calls.filter((call) => String(call[0]) === '/diagram-locks/diagram-1/live')
    expect(livePosts.length).toBeGreaterThan(0)
    const body = livePosts[0]?.[1] as Record<string, unknown>
    expect(body.kind).toBe('snapshot-chunk')
    expect(typeof body.seq).toBe('number')
    expect(body.upsertNodes).toEqual([{ id: 'n1', modelNodeId: 'm-n1', x: 1, y: 0 }])
    expect(body.upsertEdges).toEqual([
      {
        id: 'e1',
        modelLinkId: 'l-e1',
        sourceInstanceId: 'n1',
        targetInstanceId: 'n1',
      },
    ])
    expect(body.nodes).toBeUndefined()
    expect(body.edges).toBeUndefined()
  })

  it('does not snapshot again when the same spectator list is rebroadcast', async () => {
    const { collab, state } = mountCollab({ isLockHolder: true })
    state.value.diagrams[0]!.parsedAttrs.instances = {
      nodes: [{ id: 'n1', modelNodeId: 'm-n1', x: 1, y: 0 }],
      edges: [],
    }

    collab.handleModelTopicBroadcast({
      type: 'diagram_spectators',
      diagramId: 'diagram-1',
      viewers: [{ userId: 'u2', displayName: 'B' }],
    })
    await Promise.resolve()
    await Promise.resolve()
    vi.mocked(apiPost).mockClear()

    collab.handleModelTopicBroadcast({
      type: 'diagram_spectators',
      diagramId: 'diagram-1',
      viewers: [{ userId: 'u2', displayName: 'B' }],
    })
    await Promise.resolve()
    await Promise.resolve()

    const livePosts = vi
      .mocked(apiPost)
      .mock.calls.filter((call) => String(call[0]) === '/diagram-locks/diagram-1/live')
    expect(livePosts).toHaveLength(0)
  })

  it('applies a remote patch for spectators', () => {
    const { collab, state } = mountCollab({ isSpectator: true })
    state.value.diagrams[0]!.parsedAttrs.instances = {
      nodes: [
        { id: 'n1', modelNodeId: 'm-n1', x: 1, y: 0 },
        { id: 'gone', modelNodeId: 'm-gone', x: 0, y: 0 },
      ],
      edges: [],
    }

    collab.handleModelTopicBroadcast({
      type: 'diagram_live',
      diagramId: 'diagram-1',
      actorUserId: 'user-other',
      instances: {
        v: 1,
        kind: 'patch',
        seq: 2,
        upsertNodes: [{ id: 'n1', modelNodeId: 'm-n1', x: 9, y: 0 }],
        removeNodeIds: ['gone'],
      },
    })

    expect(state.value.diagrams[0]?.parsedAttrs.instances.nodes.map((node) => node.id)).toEqual([
      'n1',
    ])
    expect(state.value.diagrams[0]?.parsedAttrs.instances.nodes[0]?.x).toBe(9)
  })

  it('starts and leaves spectator sessions when spectator state changes', async () => {
    const { wrapper, isSpectator } = mountCollab({ isSpectator: false })

    isSpectator.value = true
    await nextTick()
    await nextTick()

    expect(apiPost).toHaveBeenCalledWith('/diagram-locks/diagram-1/spectate', {})

    isSpectator.value = false
    await nextTick()
    await nextTick()
    wrapper.unmount()

    expect(apiDelete).toHaveBeenCalledWith('/diagram-locks/diagram-1/spectate')
  })
})
