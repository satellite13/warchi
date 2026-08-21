import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import type { EditorGraphNeighbor, EditorNode } from '../types'
import ModelTraceBranch from './ModelTraceBranch.vue'
import ModelTraceabilityPanel from './ModelTraceabilityPanel.vue'

const lazyState = vi.hoisted(() => ({
  selectRoot: vi.fn(async () => {}),
  loadRootBranch: vi.fn(async () => true),
  changeFilter: vi.fn(async () => true),
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
      notationId: 'notation-1',
      nodeId: null,
    },
  ],
  diagramsLoading: false,
  diagramsError: null as string | null,
  diagramsNextPage: null as number | null,
  diagramsTotalElements: 1,
  branchStates: new Map<
    string,
    {
      rows: EditorGraphNeighbor[]
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
  useI18n: () => ({
    t: (key: string) =>
      key === 'models.traceabilityDragDisabledNoActiveDiagram' ? 'No active diagram' : key,
  }),
}))

vi.mock('../composables/useLazyTraceability', async importOriginal => {
  const actual = await importOriginal<typeof import('../composables/useLazyTraceability')>()
  const { computed } = await import('vue')
  return {
    ...actual,
    useLazyTraceability: () => ({
      selectRoot: lazyState.selectRoot,
      loadRootBranch: lazyState.loadRootBranch,
      changeFilter: lazyState.changeFilter,
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
): EditorGraphNeighbor => ({
  link: {
    id,
    sourceId,
    targetId,
    linkTypeId: 'link-type-1',
    modelId: 'model-1',
    ownerId: 'owner-1',
    parsedAttrs: parseLinkAttrs(null),
  },
  node: {
    id: nextNodeId,
    name: nextNodeId,
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeTypeId: 'node-type-1',
    parsedAttrs: parseNodeAttrs(null),
  },
})

const canDragNodeToDiagram = vi.fn(() => ({
  allowed: false,
  reason: 'models.traceabilityDragDisabledNoActiveDiagram',
}))

const dragDataTransfer = () => {
  const data = new Map<string, string>()
  return {
    data,
    dataTransfer: {
      setData: vi.fn((format: string, value: string) => {
        data.set(format, value)
      }),
      effectAllowed: 'uninitialized',
    } as unknown as DataTransfer,
  }
}

const dispatchDragStart = (element: Element, dataTransfer: DataTransfer): Event => {
  const event = new Event('dragstart', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  element.dispatchEvent(event)
  return event
}

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
      canDragNodeToDiagram,
      authoritativeRevision: 1,
      diagramRevision: 1,
      beginRequest: () => ({ generation: 1, requestKey: 'test', token: 1 }),
      isRequestCurrent: () => true,
      mergePartialEntities: () => true,
      resolveBranchRows: () => [],
      resolveDiagramReferences: rows => [...rows],
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

  it('accepts the typed node drag eligibility callback', () => {
    const wrapper = mountPanel()

    const eligibility = wrapper.props('canDragNodeToDiagram') as (nodeId: string) => {
      allowed: boolean
      reason: string
    }
    expect(eligibility('root')).toEqual({
      allowed: false,
      reason: 'models.traceabilityDragDisabledNoActiveDiagram',
    })
    expect(canDragNodeToDiagram).toHaveBeenCalledWith('root')
  })

  it('drags enabled root and branch nodes with the standard model node payload', async () => {
    canDragNodeToDiagram.mockReturnValue({ allowed: true, reason: 'Drag node' })
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

    const rootDrag = dragDataTransfer()
    dispatchDragStart(wrapper.get('[data-testid="trace-node-drag-root"]').element, rootDrag.dataTransfer)
    expect(rootDrag.dataTransfer.setData).toHaveBeenCalledWith('application/x-model-node-id', 'root')
    expect(rootDrag.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'node:root')
    expect(rootDrag.dataTransfer.effectAllowed).toBe('copy')

    await wrapper.get('.tb__link').trigger('click')
    const branchDrag = dragDataTransfer()
    dispatchDragStart(
      wrapper.get('[data-testid="trace-node-drag-child"]').element,
      branchDrag.dataTransfer
    )
    expect(branchDrag.dataTransfer.setData).toHaveBeenCalledWith(
      'application/x-model-node-id',
      'child'
    )
    expect(branchDrag.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'node:child')
    expect(branchDrag.dataTransfer.effectAllowed).toBe('copy')
  })

  it('translates the disabled root drag reason for title and aria label', () => {
    canDragNodeToDiagram.mockReturnValue({
      allowed: false,
      reason: 'models.traceabilityDragDisabledNoActiveDiagram',
    })
    const wrapper = mountPanel()

    const handle = wrapper.get('[data-testid="trace-node-drag-root"]')
    expect(handle.attributes('title')).toBe('No active diagram')
    expect(handle.attributes('aria-label')).toBe('No active diagram')
    expect(handle.attributes('draggable')).toBe('false')
  })

  it('prevents disabled root dragstart without writing DataTransfer payload', () => {
    canDragNodeToDiagram.mockReturnValue({
      allowed: false,
      reason: 'models.traceabilityDragDisabledNoActiveDiagram',
    })
    const wrapper = mountPanel()
    const drag = dragDataTransfer()

    const event = dispatchDragStart(
      wrapper.get('[data-testid="trace-node-drag-root"]').element,
      drag.dataTransfer
    )

    expect(event.defaultPrevented).toBe(true)
    expect(drag.dataTransfer.setData).not.toHaveBeenCalled()
  })

  it('keeps root focus unchanged when its drag handle is clicked and requests keyboard addition', async () => {
    canDragNodeToDiagram.mockReturnValue({ allowed: true, reason: 'Drag node' })
    const wrapper = mountPanel()
    const handle = wrapper.get('[data-testid="trace-node-drag-root"]')

    expect(handle.attributes('role')).toBe('button')
    expect(handle.attributes('tabindex')).toBe('0')
    await handle.trigger('click')
    expect(wrapper.emitted('focus-node')).toBeUndefined()

    await handle.trigger('keydown', { key: 'Enter' })
    await handle.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('add-node-to-diagram')).toEqual([['root'], ['root']])
  })

  it('keeps the current root on branch-handle click and forwards keyboard addition', async () => {
    canDragNodeToDiagram.mockReturnValue({ allowed: true, reason: 'Drag node' })
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

    const handle = wrapper.get('[data-testid="trace-node-drag-child"]')
    await handle.trigger('click')

    expect(wrapper.findComponent(ModelTraceBranch).emitted('setRoot')).toBeUndefined()
    expect(wrapper.get('.tp-tree__root-name').text()).toBe('Root')

    await handle.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('add-node-to-diagram')).toEqual([['child']])
  })

  it('translates the disabled branch drag reason for title and aria label', async () => {
    canDragNodeToDiagram.mockReturnValue({
      allowed: false,
      reason: 'models.traceabilityDragDisabledNoActiveDiagram',
    })
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

    const handle = wrapper.get('[data-testid="trace-node-drag-child"]')
    expect(handle.attributes('title')).toBe('No active diagram')
    expect(handle.attributes('aria-label')).toBe('No active diagram')
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

  it('keeps loaded diagram references visible beside a next-page retry error', async () => {
    lazyState.diagramsError = 'diagram page failed'
    lazyState.diagramsNextPage = 1

    const wrapper = mountPanel()
    await nextTick()

    expect(wrapper.text()).toContain('Referenced diagram')
    expect(wrapper.get('[role="alert"]').text()).toContain('diagram page failed')
    await wrapper.get('[data-testid="diagram-references-retry"]').trigger('click')
    expect(lazyState.retryDiagrams).toHaveBeenCalledOnce()
  })

  it('makes root and diagram rows keyboard accessible while preserving diagram double-click', async () => {
    const wrapper = mountPanel()
    await nextTick()

    const root = wrapper.get('.tp-tree__root')
    expect(root.element.tagName).toBe('BUTTON')
    await root.trigger('click')
    expect(wrapper.emitted('focus-node')).toEqual([['root']])

    const diagramRow = wrapper.get('.tp-diagram')
    expect(diagramRow.attributes('role')).toBe('button')
    expect(diagramRow.attributes('tabindex')).toBe('0')
    await diagramRow.trigger('keydown', { key: 'Enter' })
    await diagramRow.trigger('keydown', { key: ' ' })
    await diagramRow.trigger('dblclick')
    expect(wrapper.emitted('open-diagram')).toEqual([
      ['diagram-ref'],
      ['diagram-ref'],
      ['diagram-ref'],
    ])
  })

  it('connects section and branch toggles to stable controlled targets', async () => {
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

    const diagramsToggle = wrapper.get('.tp-section__head--no-hover')
    expect(diagramsToggle.attributes('aria-expanded')).toBe('true')
    expect(diagramsToggle.attributes('aria-controls')).toBe('traceability-diagrams-panel')
    expect(wrapper.get('#traceability-diagrams-panel').attributes('id')).toBe(
      'traceability-diagrams-panel'
    )
    await diagramsToggle.trigger('click')
    expect(diagramsToggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('#traceability-diagrams-panel').attributes('id')).toBe(
      'traceability-diagrams-panel'
    )

    const treeToggle = wrapper.get('.tp-section__toggle')
    expect(treeToggle.attributes('aria-expanded')).toBe('true')
    expect(treeToggle.attributes('aria-controls')).toBe('traceability-tree-panel')
    expect(wrapper.get('#traceability-tree-panel').attributes('id')).toBe('traceability-tree-panel')

    const branchToggle = wrapper.get('.tb__link')
    expect(branchToggle.attributes('aria-expanded')).toBe('false')
    const branchTargetId = branchToggle.attributes('aria-controls')
    expect(branchTargetId).toBeTruthy()
    await branchToggle.trigger('click')
    expect(branchToggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get(`[id="${branchTargetId}"]`).attributes('id')).toBe(branchTargetId)
  })

  it('gives the same DAG node unique controlled ids on two paths', async () => {
    const branchState = (rows: EditorGraphNeighbor[]) => ({
      rows,
      loading: false,
      error: null,
      failedPage: null,
      nextPage: null,
      totalElements: rows.length,
      token: 1,
      generation: 1,
    })
    lazyState.branchStates.set('root', branchState([
      neighbor('root-a', 'root', 'a', 'a'),
      neighbor('root-b', 'root', 'b', 'b'),
    ]))
    lazyState.branchStates.set('a', branchState([
      neighbor('a-shared', 'a', 'shared', 'shared'),
    ]))
    lazyState.branchStates.set('b', branchState([
      neighbor('b-shared', 'b', 'shared', 'shared'),
    ]))
    lazyState.branchStates.set('shared', branchState([
      neighbor('shared-leaf', 'shared', 'leaf', 'leaf'),
    ]))
    const wrapper = mountPanel()
    await nextTick()

    for (const label of ['Root → a', 'Root → b', 'a → shared', 'b → shared']) {
      const toggle = wrapper.findAll('.tb__link').find(item => item.text().includes(label))
      expect(toggle, label).toBeDefined()
      await toggle!.trigger('click')
    }

    const sharedToggles = wrapper
      .findAll('.tb__link')
      .filter(item => item.text().includes('shared → leaf'))
    expect(sharedToggles).toHaveLength(2)
    const controlledIds = sharedToggles.map(item => item.attributes('aria-controls'))
    expect(new Set(controlledIds).size).toBe(2)
    for (const id of controlledIds) {
      expect(wrapper.findAll(`[id="${id}"]`)).toHaveLength(1)
    }
  })

  it('gives parallel links to the same child unique subtree ids', async () => {
    const branchState = (rows: EditorGraphNeighbor[]) => ({
      rows,
      loading: false,
      error: null,
      failedPage: null,
      nextPage: null,
      totalElements: rows.length,
      token: 1,
      generation: 1,
    })
    lazyState.branchStates.set('root', branchState([
      neighbor('parallel-1', 'root', 'child', 'child'),
      neighbor('parallel-2', 'root', 'child', 'child'),
    ]))
    lazyState.branchStates.set('child', branchState([
      neighbor('child-leaf', 'child', 'leaf', 'leaf'),
    ]))
    const wrapper = mountPanel()
    await nextTick()

    for (let index = 0; index < 2; index += 1) {
      const toggle = wrapper
        .findAll('.tb__link')
        .find(
          item =>
            item.text().includes('Root → child') &&
            item.attributes('aria-expanded') === 'false'
        )
      expect(toggle).toBeDefined()
      await toggle!.trigger('click')
      await nextTick()
    }

    const childToggles = wrapper
      .findAll('.tb__link')
      .filter(item => item.text().includes('Child → leaf'))
    expect(childToggles).toHaveLength(2)
    const controlledIds = childToggles.map(item => item.attributes('aria-controls'))
    expect(new Set(controlledIds).size).toBe(2)
    for (const id of controlledIds) {
      expect(wrapper.findAll(`[id="${id}"]`)).toHaveLength(1)
    }
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

  it('invalidates the full branch session when direction changes', async () => {
    const wrapper = mountPanel()
    await nextTick()

    await wrapper.get('.tp-nav__dir').trigger('click')
    await nextTick()

    expect(lazyState.changeFilter).toHaveBeenCalledWith({
      nodeId: 'root',
      direction: 'incoming',
      linkTypeId: null,
    })
    expect(lazyState.loadRootBranch).not.toHaveBeenCalled()
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
