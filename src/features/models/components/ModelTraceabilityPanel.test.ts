import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphNeighborResponse } from '@/types/api'
import { parseNodeAttrs } from '../modelAttrs'
import type { EditorNode } from '../types'
import ModelTraceabilityPanel from './ModelTraceabilityPanel.vue'

const lazyState = vi.hoisted(() => ({
  selectRoot: vi.fn(async () => {}),
  loadRootBranch: vi.fn(async () => true),
  loadBranch: vi.fn(async () => true),
  loadMore: vi.fn(async () => true),
  retry: vi.fn(async () => true),
  loadMoreDiagrams: vi.fn(async () => true),
  retryDiagrams: vi.fn(async () => true),
  diagramReferences: [
    {
      id: 'diagram-ref',
      name: 'Referenced diagram',
      version: '1.0.0',
      ownerId: 'owner-1',
      modelId: 'model-1',
      notationId: 'notation-1',
    },
  ],
  diagramsLoading: false,
  diagramsError: null as string | null,
  diagramsNextPage: null as number | null,
  diagramsTotalElements: 1,
  branchStates: new Map<
    string,
    {
      rows: GraphNeighborResponse[]
      loading: boolean
      error: string | null
      failedPage: number | null
      nextPage: number | null
      totalElements: number
      token: number
      generation: number
    }
  >(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../composables/useLazyTraceability', async importOriginal => {
  const actual = await importOriginal<typeof import('../composables/useLazyTraceability')>()
  const { computed } = await import('vue')
  return {
    ...actual,
    useLazyTraceability: () => ({
      selectRoot: lazyState.selectRoot,
      loadRootBranch: lazyState.loadRootBranch,
      loadBranch: lazyState.loadBranch,
      loadMore: lazyState.loadMore,
      retry: lazyState.retry,
      loadMoreDiagrams: lazyState.loadMoreDiagrams,
      retryDiagrams: lazyState.retryDiagrams,
      diagramReferences: computed(() => lazyState.diagramReferences),
      diagramsLoading: computed(() => lazyState.diagramsLoading),
      diagramsError: computed(() => lazyState.diagramsError),
      diagramsNextPage: computed(() => lazyState.diagramsNextPage),
      diagramsTotalElements: computed(() => lazyState.diagramsTotalElements),
      getBranchState: (query: { nodeId: string }) =>
        lazyState.branchStates.get(query.nodeId) ?? {
          rows: [],
          loading: false,
          error: null,
          failedPage: null,
          nextPage: null,
          totalElements: 0,
          token: 0,
          generation: 1,
        },
    }),
  }
})

const editorNode = (id: string, name = id): EditorNode => ({
  id,
  name,
  modelId: 'model-1',
  ownerId: 'owner-1',
  nodeTypeId: 'node-type-1',
  parsedAttrs: parseNodeAttrs(null),
})

const neighbor = (
  id: string,
  sourceId: string,
  targetId: string,
  nextNodeId: string
): GraphNeighborResponse => ({
  link: {
    id,
    sourceId,
    targetId,
    linkTypeId: 'link-type-1',
    modelId: 'model-1',
    ownerId: 'owner-1',
    attrs: null,
  },
  node: {
    id: nextNodeId,
    name: nextNodeId,
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeTypeId: 'node-type-1',
    attrs: null,
  },
})

const mountPanel = () =>
  mount(ModelTraceabilityPanel, {
    props: {
      modelId: 'model-1',
      selectedNode: editorNode('root', 'Root'),
      nodes: [editorNode('root', 'Root'), editorNode('child', 'Child')],
      linkTypes: [
        {
          id: 'link-type-1',
          name: 'Dependency',
          ownerId: 'owner-1',
        },
      ],
      activeDiagram: null,
      activeNotationId: null,
      isDiagramReadOnly: false,
      relations: [],
      canConnect: () => true,
      beginRequest: () => ({ generation: 1, requestKey: 'test', token: 1 }),
      isRequestCurrent: () => true,
      mergePartialEntities: () => true,
    },
    global: {
      stubs: {
        UiIcon: { template: '<span class="ui-icon" />' },
      },
    },
  })

describe('ModelTraceabilityPanel lazy branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lazyState.branchStates.clear()
    lazyState.diagramsLoading = false
    lazyState.diagramsError = null
    lazyState.diagramsNextPage = null
  })

  it('loads selected root and renders diagram references from the scoped endpoint state', async () => {
    const wrapper = mountPanel()
    await nextTick()

    expect(lazyState.selectRoot).toHaveBeenCalledWith({
      nodeId: 'root',
      direction: 'outgoing',
      linkTypeId: null,
    })
    expect(wrapper.text()).toContain('Referenced diagram')
  })

  it('loads a direct child branch on expansion and never asks for global links', async () => {
    lazyState.branchStates.set('root', {
      rows: [neighbor('link-1', 'root', 'child', 'child')],
      loading: false,
      error: null,
      failedPage: null,
      nextPage: null,
      totalElements: 1,
      token: 1,
      generation: 1,
    })
    const wrapper = mountPanel()
    await nextTick()

    await wrapper.get('.tb__link').trigger('click')

    expect(lazyState.loadBranch).toHaveBeenCalledWith(
      {
        nodeId: 'child',
        direction: 'outgoing',
        linkTypeId: null,
      },
      new Set(['root'])
    )
  })

  it('exposes accessible branch errors, retry, loading status, and load more controls', async () => {
    lazyState.branchStates.set('root', {
      rows: [],
      loading: false,
      error: 'branch failed',
      failedPage: 0,
      nextPage: 0,
      totalElements: 0,
      token: 2,
      generation: 1,
    })
    let wrapper = mountPanel()
    await nextTick()

    expect(wrapper.get('[role="alert"]').text()).toContain('branch failed')
    await wrapper.get('[data-testid="trace-retry"]').trigger('click')
    expect(lazyState.retry).toHaveBeenCalledWith({
      nodeId: 'root',
      direction: 'outgoing',
      linkTypeId: null,
    })

    lazyState.branchStates.set('root', {
      rows: [neighbor('link-1', 'root', 'child', 'child')],
      loading: false,
      error: null,
      failedPage: null,
      nextPage: 1,
      totalElements: 2,
      token: 3,
      generation: 1,
    })
    wrapper.unmount()
    wrapper = mountPanel()
    await nextTick()
    await wrapper.get('[data-testid="trace-load-more"]').trigger('click')
    expect(lazyState.loadMore).toHaveBeenCalled()

    lazyState.branchStates.set('root', {
      rows: [],
      loading: true,
      error: null,
      failedPage: null,
      nextPage: 0,
      totalElements: 0,
      token: 4,
      generation: 1,
    })
    wrapper.unmount()
    wrapper = mountPanel()
    await nextTick()
    expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite')
  })
})
