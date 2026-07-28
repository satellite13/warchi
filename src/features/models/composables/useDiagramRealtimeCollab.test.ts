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

  it('sends pointer coordinates in world space for the lock holder', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.200Z'))
    const { collab } = mountCollab({ isLockHolder: true })

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
