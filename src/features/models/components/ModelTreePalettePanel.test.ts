import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { parseDiagramAttrs } from '../modelAttrs'
import ModelTreePalettePanel from './ModelTreePalettePanel.vue'
import type { ChildrenPageState, EditorDiagram, EditorNode } from '../types'
import type { ModelSearchHit } from '@/types/api'

vi.mock('vue-i18n', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

function makeNode(
  overrides: Partial<EditorNode> & { id: string; name: string; nodeTypeId?: string }
): EditorNode {
  return {
    modelId: 'm1',
    ownerId: 'o1',
    nodeTypeId: overrides.nodeTypeId ?? 'nt1',
    parentNodeId: null,
    parsedAttrs: {
      treeOrder: 0,
      notationComponents: {},
      componentProperties: {},
      typeProperties: {},
    },
    _isNew: false,
    _isDirty: false,
    _isDeleted: false,
    ...overrides,
  }
}

/** Give the scroll parent non-zero layout so @tanstack/vue-virtual renders rows. */
function mockTreeViewport(wrapper: VueWrapper, height = 480, width = 320): void {
  const tree = wrapper.get('.tree').element as HTMLElement
  const state = (tree as HTMLElement & { __virtScroll?: { top: number } }).__virtScroll ?? {
    top: 0,
  }
  ;(tree as HTMLElement & { __virtScroll?: { top: number } }).__virtScroll = state

  Object.defineProperty(tree, 'clientHeight', { configurable: true, get: () => height })
  Object.defineProperty(tree, 'clientWidth', { configurable: true, get: () => width })
  Object.defineProperty(tree, 'offsetHeight', { configurable: true, get: () => height })
  Object.defineProperty(tree, 'offsetWidth', { configurable: true, get: () => width })
  Object.defineProperty(tree, 'scrollHeight', {
    configurable: true,
    get: () =>
      Math.max(
        height,
        Number.parseInt(
          wrapper
            .find('.tree__virtual')
            .attributes('style')
            ?.match(/height:\s*(\d+)/)?.[1] ?? '0',
          10
        ) || height
      ),
  })
  Object.defineProperty(tree, 'scrollTop', {
    configurable: true,
    get: () => state.top,
    set: (value: number) => {
      state.top = value
      tree.dispatchEvent(new Event('scroll'))
    },
  })
  tree.scrollTo = ((options?: ScrollToOptions | number, y?: number) => {
    if (typeof options === 'number') {
      state.top = y ?? 0
    } else if (options && typeof options.top === 'number') {
      state.top = options.top
    }
    tree.dispatchEvent(new Event('scroll'))
  }) as typeof tree.scrollTo
  tree.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect
  tree.dispatchEvent(new Event('scroll'))
  window.dispatchEvent(new Event('resize'))
}

async function flushTree(wrapper: VueWrapper): Promise<void> {
  mockTreeViewport(wrapper)
  await nextTick()
  await nextTick()
}

function mountPanel(props: {
  nodes: EditorNode[]
  selectedNodeId?: string | null
  selectedDiagramId?: string | null
  treeRootNodeId?: string | null
  loadedChildrenFor?: Set<string>
  childrenPages?: Map<string, ChildrenPageState>
  childrenLoading?: Set<string>
  childrenErrors?: Map<string, string>
  searchHits?: ModelSearchHit[]
  searchQuery?: string
  searchLoading?: boolean
  searchError?: string | null
  treeFocusLoading?: boolean
  treeFocusError?: string | null
  diagrams?: EditorDiagram[]
}) {
  return mount(ModelTreePalettePanel, {
    props: {
      nodes: props.nodes,
      diagrams: props.diagrams ?? [],
      nodeTypes: [
        { id: 'dir', name: 'Directory', version: '1.0.0', ownerId: 'o1' } as never,
        { id: 'nt1', name: 'Application Component', version: '1.0.0', ownerId: 'o1' } as never,
      ],
      selectedNodeId: props.selectedNodeId ?? null,
      selectedDiagramId: props.selectedDiagramId ?? null,
      treeRootNodeId: props.treeRootNodeId,
      loadedChildrenFor: props.loadedChildrenFor,
      childrenPages: props.childrenPages,
      childrenLoading: props.childrenLoading,
      childrenErrors: props.childrenErrors,
      searchHits: props.searchHits,
      searchQuery: props.searchQuery,
      searchLoading: props.searchLoading,
      searchError: props.searchError,
      treeFocusLoading: props.treeFocusLoading,
      treeFocusError: props.treeFocusError,
    },
    // Needed so focusNode/focusDiagram and querySelector work against document
    attachTo: document.body,
    global: { stubs: { UiIcon: true } },
  })
}

describe('ModelTreePalettePanel', () => {
  it('renders tree panel root with empty nodes', () => {
    const wrapper = mount(ModelTreePalettePanel, {
      props: {
        nodes: [],
        diagrams: [],
        nodeTypes: [],
        selectedNodeId: null,
        selectedDiagramId: null,
      },
      global: {
        stubs: {
          UiIcon: true,
        },
      },
    })

    expect(wrapper.html().length).toBeGreaterThan(0)
  })

  it('emits the selected diagram id to open the copy wizard', async () => {
    const wrapper = mount(ModelTreePalettePanel, {
      props: {
        nodes: [],
        diagrams: [
          {
            id: 'diagram-1',
            name: 'Source diagram',
            version: '1.0.0',
            notationId: 'notation-1',
            ownerId: 'owner-1',
            modelId: 'model-1',
            nodeId: null,
            parsedAttrs: parseDiagramAttrs(null),
          },
        ],
        nodeTypes: [],
        selectedNodeId: null,
        selectedDiagramId: null,
      },
      global: {
        stubs: {
          UiIcon: true,
        },
      },
    })

    await wrapper.get('[text="models.diagramCopy.title"] button').trigger('click')

    expect(wrapper.emitted('copyDiagramToModel')).toEqual([['diagram-1']])
  })

  it('uses shared btn--icon for header and row actions', async () => {
    const wrapper = mount(ModelTreePalettePanel, {
      props: {
        nodes: [],
        diagrams: [
          {
            id: 'diagram-1',
            name: 'Source diagram',
            version: '1.0.0',
            notationId: 'notation-1',
            ownerId: 'owner-1',
            modelId: 'model-1',
            nodeId: null,
            parsedAttrs: parseDiagramAttrs(null),
          },
        ],
        nodeTypes: [],
        selectedNodeId: null,
        selectedDiagramId: null,
      },
      global: {
        stubs: {
          UiIcon: true,
        },
      },
    })

    const headerButtons = wrapper.findAll('.panel__header-actions button')
    expect(headerButtons.length).toBe(4)
    for (const button of headerButtons) {
      expect(button.classes()).toContain('btn--icon')
    }
    expect(wrapper.find('.mini-btn').exists()).toBe(false)
    expect(wrapper.find('.diagram-row .btn--icon--danger').exists()).toBe(true)
  })

  it('does not show the node type name as a tree caption', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'n1', name: 'CRM' })],
    })
    await flushTree(wrapper)

    expect(wrapper.get('[data-tree-node-id="n1"] .tree-node__name').text()).toBe('CRM')
    expect(wrapper.find('.tree-node__type').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Application Component')
  })

  it('requests children on first expand but not for a complete scope', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir', hasChildren: true })],
    })
    await flushTree(wrapper)

    const toggle = wrapper.get('[data-tree-node-id="folder"] .tree-node__toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-label')).toBe('models.expandTreeNode')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('aria-label')).toBe('models.collapseTreeNode')
    expect(wrapper.emitted('loadChildren')).toEqual([[{ kind: 'node', nodeId: 'folder' }]])

    await wrapper.setProps({ loadedChildrenFor: new Set(['node:folder']) })
    await wrapper.get('[data-tree-node-id="folder"] .tree-node__toggle').trigger('click')
    await wrapper.get('[data-tree-node-id="folder"] .tree-node__toggle').trigger('click')
    expect(wrapper.emitted('loadChildren')).toHaveLength(1)
  })

  it('hides the expand toggle when scoped hasChildren is false', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir', hasChildren: false })],
    })
    await flushTree(wrapper)

    expect(wrapper.find('[data-tree-node-id="folder"] .tree-node__toggle').exists()).toBe(false)
  })

  it('expands a complete-empty folder when it contains diagrams', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder', name: 'Diagrams', nodeTypeId: 'dir', hasChildren: false })],
      diagrams: [
        {
          id: 'diagram-1',
          name: 'Simple BPMN',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          modelId: 'm1',
          nodeId: 'folder',
          parsedAttrs: parseDiagramAttrs(null),
        },
      ],
    })
    await flushTree(wrapper)

    await wrapper.get('[data-tree-node-id="folder"] .tree-node__toggle').trigger('click')

    expect(wrapper.get('[data-tree-diagram-id="diagram-1"]').text()).toContain('Simple BPMN')
    expect(wrapper.emitted('loadChildren')).toBeUndefined()
  })

  it('can expand a hasChildren root row before node-type catalog arrives', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({
          id: 'uncatalogued-folder',
          name: 'Folder',
          nodeTypeId: 'not-loaded-yet',
          hasChildren: true,
        }),
      ],
    })
    await flushTree(wrapper)

    await wrapper
      .get('[data-tree-node-id="uncatalogued-folder"] .tree-node__toggle')
      .trigger('click')

    expect(wrapper.emitted('loadChildren')).toEqual([
      [{ kind: 'node', nodeId: 'uncatalogued-folder' }],
    ])
  })

  it('allows sibling-dependent actions to load incomplete scopes on demand', async () => {
    const wrapper = mountPanel({
      treeRootNodeId: 'hidden-root',
      nodes: [
        makeNode({
          id: 'root-child',
          name: 'Root child',
          nodeTypeId: 'dir',
          parentNodeId: 'hidden-root',
          hasChildren: true,
        }),
      ],
      loadedChildrenFor: new Set(),
    })
    await flushTree(wrapper)

    expect(wrapper.get('[data-tree-node-id="root-child"]').attributes('draggable')).toBe('true')
    expect(wrapper.get('[text="models.addRootNode"] button').attributes('disabled')).toBeUndefined()
    expect(
      wrapper
        .get('[data-tree-node-id="root-child"] [text="models.addChildNode"] button')
        .attributes('disabled')
    ).toBeUndefined()
  })

  it('keeps the known-empty child scope of a new local folder mutable', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({
          id: 'new-folder',
          name: 'New folder',
          nodeTypeId: 'dir',
          _isNew: true,
        }),
      ],
      loadedChildrenFor: new Set(['root']),
    })
    await flushTree(wrapper)

    expect(
      wrapper
        .get('[data-tree-node-id="new-folder"] [text="models.addChildNode"] button')
        .attributes('disabled')
    ).toBeUndefined()
  })

  it('keeps an authoritative hasChildren=false folder mutable without an expand toggle', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({
          id: 'persisted-empty-folder',
          name: 'Persisted empty folder',
          nodeTypeId: 'dir',
          hasChildren: false,
        }),
      ],
      loadedChildrenFor: new Set(['root']),
    })
    await flushTree(wrapper)

    expect(
      wrapper.find('[data-tree-node-id="persisted-empty-folder"] .tree-node__toggle').exists()
    ).toBe(false)
    expect(
      wrapper
        .get('[data-tree-node-id="persisted-empty-folder"] [text="models.addChildNode"] button')
        .attributes('disabled')
    ).toBeUndefined()
  })

  it('renders non-draggable local loading, error and load-more rows', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir', hasChildren: true })],
      childrenLoading: new Set(['node:folder']),
      childrenErrors: new Map([['node:folder', 'branch failed']]),
      childrenPages: new Map([
        ['node:folder', { loadedPages: new Set([0]), nextPage: 1, totalElements: 501 }],
      ]),
    })
    await flushTree(wrapper)
    await wrapper.get('[data-tree-node-id="folder"] .tree-node__toggle').trigger('click')
    await flushTree(wrapper)

    for (const selector of ['[data-tree-loading]', '[data-tree-error]', '[data-tree-load-more]']) {
      expect(wrapper.get(selector).attributes('draggable')).not.toBe('true')
    }
    for (const selector of ['[data-tree-loading]', '[data-tree-error]']) {
      expect(wrapper.get(selector).attributes('role')).toBe('status')
      expect(wrapper.get(selector).attributes('aria-live')).toBe('polite')
    }
    await wrapper.get('[data-tree-load-more] button').trigger('click')
    expect(wrapper.emitted('loadNextChildrenPage')).toEqual([[{ kind: 'node', nodeId: 'folder' }]])
  })

  it('pages a wide root scope with a root load-more row', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'root-child', name: 'Root child' })],
      childrenPages: new Map([
        ['root', { loadedPages: new Set([0]), nextPage: 1, totalElements: 501 }],
      ]),
    })
    await flushTree(wrapper)

    await wrapper.get('[data-tree-load-more] button').trigger('click')

    expect(wrapper.emitted('loadNextChildrenPage')).toEqual([[{ kind: 'root' }]])
  })
})

describe('ModelTreePalettePanel search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('shows matching node under ancestor with depth, hides non-matching sibling', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' }),
        makeNode({ id: 'hit', name: 'SpecialChild', parentNodeId: 'folder' }),
        makeNode({ id: 'miss', name: 'OtherChild', parentNodeId: 'folder' }),
      ],
    })
    await flushTree(wrapper)

    const input = wrapper.get('.search-input')
    await input.setValue('special')
    vi.advanceTimersByTime(200)
    await flushTree(wrapper)

    const rows = wrapper.findAll('[data-tree-node-id]')
    const ids = rows.map(r => r.attributes('data-tree-node-id'))
    expect(ids).toContain('folder')
    expect(ids).toContain('hit')
    expect(ids).not.toContain('miss')

    const hit = wrapper.get('[data-tree-node-id="hit"]')
    expect(hit.attributes('style')).toMatch(/--tree-depth:\s*1/)
    const folder = wrapper.get('[data-tree-node-id="folder"]')
    expect(folder.attributes('style')).toMatch(/--tree-depth:\s*0/)
  })

  it('expands ancestors and keeps selection when search is cleared', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' }),
        makeNode({ id: 'hit', name: 'SpecialChild', parentNodeId: 'folder' }),
      ],
      selectedNodeId: 'hit',
    })
    await flushTree(wrapper)

    const input = wrapper.get('.search-input')
    await input.setValue('special')
    vi.advanceTimersByTime(200)
    await flushTree(wrapper)

    await input.setValue('')
    // clear path sets debounced query sync when trimmed empty (no debounce wait required)
    await flushTree(wrapper)

    expect(wrapper.props('selectedNodeId')).toBe('hit')
    // After clear, hierarchical full tree should show hit when folder expanded
    expect(wrapper.find('[data-tree-node-id="hit"]').exists()).toBe(true)
  })

  it('does not clear search on select click', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' }),
        makeNode({ id: 'hit', name: 'SpecialChild', parentNodeId: 'folder' }),
      ],
    })
    await flushTree(wrapper)
    const input = wrapper.get('.search-input')
    await input.setValue('special')
    vi.advanceTimersByTime(200)
    await flushTree(wrapper)

    await wrapper.get('[data-tree-node-id="hit"] .tree-node__select').trigger('click')
    expect((input.element as HTMLInputElement).value).toBe('special')
    expect(wrapper.emitted('selectNode')?.[0]).toEqual(['hit'])
  })

  it('mutes non-matching ancestor names during search', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' }),
        makeNode({ id: 'hit', name: 'SpecialChild', parentNodeId: 'folder' }),
      ],
    })
    await flushTree(wrapper)
    await wrapper.get('.search-input').setValue('special')
    vi.advanceTimersByTime(200)
    await flushTree(wrapper)

    expect(wrapper.get('[data-tree-node-id="folder"] .tree-node__name').classes()).toContain(
      'tree-node__name--ancestor'
    )
    expect(wrapper.get('[data-tree-node-id="hit"] .tree-node__name').classes()).not.toContain(
      'tree-node__name--ancestor'
    )
  })

  it('renders server hits instead of scanning only materialized nodes', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'local-hit', name: 'Special local node' })],
      searchHits: [{ kind: 'node', id: 'server-hit', name: 'Special server node' }],
    })
    await flushTree(wrapper)
    await wrapper.get('.search-input').setValue('special')
    await vi.advanceTimersByTimeAsync(200)
    await flushTree(wrapper)

    expect(wrapper.emitted('searchQueryChange')).toEqual([['special']])
    expect(wrapper.find('[data-tree-node-id="local-hit"]').exists()).toBe(false)
    expect(wrapper.get('[data-tree-search-hit-id="server-hit"]').text()).toContain(
      'Special server node'
    )

    await wrapper.get('[data-tree-search-hit-id="server-hit"] button').trigger('click')
    expect(wrapper.emitted('selectSearchHit')).toEqual([
      [{ kind: 'node', id: 'server-hit', name: 'Special server node' }],
    ])
  })

  it('syncs the search input when the parent clears searchQuery', async () => {
    const wrapper = mountPanel({
      nodes: [],
      searchHits: [],
      searchQuery: 'diagram',
    })
    await flushTree(wrapper)
    expect((wrapper.get('.search-input').element as HTMLInputElement).value).toBe('diagram')

    await wrapper.setProps({ searchQuery: '' })
    await flushTree(wrapper)

    expect((wrapper.get('.search-input').element as HTMLInputElement).value).toBe('')
  })

  it('renders search hit icons, breadcrumbs, and emits the full hit object', async () => {
    const wrapper = mountPanel({
      nodes: [],
      searchHits: [
        {
          kind: 'node',
          id: 'folder-hit',
          name: 'Diagrams',
          nodeTypeId: 'dir',
          pathNames: ['Apps', 'Diagrams'],
        },
        {
          kind: 'node',
          id: 'node-hit',
          name: 'Service',
          nodeTypeId: 'nt1',
          pathNames: ['Apps', 'Service'],
        },
        {
          kind: 'diagram',
          id: 'diagram-hit',
          name: 'Simple BPMN',
          pathNames: ['Apps', 'Diagrams', 'Simple BPMN'],
        },
        {
          kind: 'diagram',
          id: 'broken-hit',
          name: 'Broken',
          pathNames: null,
        },
      ],
    })
    await flushTree(wrapper)
    await wrapper.get('.search-input').setValue('hit')
    await vi.advanceTimersByTimeAsync(200)
    await flushTree(wrapper)

    expect(
      wrapper.get('[data-tree-search-hit-id="folder-hit"] ui-icon-stub').attributes('name')
    ).toBe('folder')
    expect(
      wrapper.get('[data-tree-search-hit-id="diagram-hit"] ui-icon-stub').attributes('name')
    ).toBe('dashboard')
    expect(
      wrapper.get('[data-tree-search-hit-id="node-hit"] .tree-search-hit__breadcrumb').text()
    ).toBe('Apps')
    expect(
      wrapper.get('[data-tree-search-hit-id="diagram-hit"] .tree-search-hit__breadcrumb').text()
    ).toBe('Apps / Diagrams')
    expect(
      wrapper.find('[data-tree-search-hit-id="broken-hit"] .tree-search-hit__breadcrumb').exists()
    ).toBe(false)

    await wrapper.get('[data-tree-search-hit-id="diagram-hit"] button').trigger('click')
    expect(wrapper.emitted('selectSearchHit')?.at(-1)).toEqual([
      {
        kind: 'diagram',
        id: 'diagram-hit',
        name: 'Simple BPMN',
        pathNames: ['Apps', 'Diagrams', 'Simple BPMN'],
      },
    ])
  })

  it('keeps search loading/error/retry local and caps only rendered server rows', async () => {
    const searchHits: ModelSearchHit[] = Array.from({ length: 300 }, (_, index) => ({
      kind: 'node',
      id: `hit-${index}`,
      name: `Hit ${index}`,
    }))
    const wrapper = mountPanel({
      nodes: [],
      searchHits,
      searchLoading: true,
      searchError: 'search failed',
    })
    await flushTree(wrapper)
    await wrapper.get('.search-input').setValue('hit')
    await vi.advanceTimersByTimeAsync(200)
    await flushTree(wrapper)

    expect(wrapper.find('[data-tree-search-loading]').exists()).toBe(true)
    expect(wrapper.get('[data-tree-search-error]').text()).toContain('models.treeSearchError')
    expect(wrapper.text()).toContain('models.searchResultsTruncated')
    await wrapper.get('[data-tree-search-error] button').trigger('click')
    expect(wrapper.emitted('retrySearch')).toHaveLength(1)
  })

  it('shows deep-link tree focus error with an empty search and retries only tree focus', async () => {
    const wrapper = mountPanel({
      nodes: [],
      searchHits: [],
      treeFocusLoading: false,
      treeFocusError: 'ancestors failed',
    })
    await flushTree(wrapper)

    expect((wrapper.get('.search-input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.get('[data-tree-focus-error]').text()).toContain('ancestors failed')
    await wrapper.get('[data-tree-focus-error] button').trigger('click')

    expect(wrapper.emitted('retryTreeFocus')).toHaveLength(1)
    expect(wrapper.emitted('retrySearch')).toBeUndefined()
  })
})

describe('ModelTreePalettePanel virtualization', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders only a window of rows for a large expanded tree', async () => {
    const nodes: EditorNode[] = [makeNode({ id: 'root-folder', name: 'Root', nodeTypeId: 'dir' })]
    for (let i = 0; i < 300; i += 1) {
      nodes.push(
        makeNode({
          id: `n-${i}`,
          name: `Node ${i}`,
          parentNodeId: 'root-folder',
          parsedAttrs: {
            treeOrder: i,
            notationComponents: {},
            componentProperties: {},
            typeProperties: {},
          },
        })
      )
    }

    const wrapper = mountPanel({ nodes })
    await flushTree(wrapper)

    // Expand root folder
    await wrapper.get('[data-tree-node-id="root-folder"] .tree-node__toggle').trigger('click')
    await flushTree(wrapper)

    const rendered = wrapper.findAll('[data-tree-node-id]')
    expect(rendered.length).toBeGreaterThan(0)
    // Viewport 480 / row 42 ≈ 12 + overscan 10*2 ≈ well under 300
    expect(rendered.length).toBeLessThan(80)
    expect(rendered.length).toBeLessThan(nodes.length)
  })

  it('focusNode brings a far row into the virtual window', async () => {
    const nodes: EditorNode[] = [makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' })]
    for (let i = 0; i < 80; i += 1) {
      nodes.push(
        makeNode({
          id: `n-${i}`,
          name: `Node ${i}`,
          parentNodeId: 'folder',
          parsedAttrs: {
            treeOrder: i,
            notationComponents: {},
            componentProperties: {},
            typeProperties: {},
          },
        })
      )
    }

    const wrapper = mountPanel({ nodes })
    await flushTree(wrapper)
    await wrapper.get('[data-tree-node-id="folder"] .tree-node__toggle').trigger('click')
    await flushTree(wrapper)

    expect(wrapper.find('[data-tree-node-id="n-70"]').exists()).toBe(false)

    const focusing = (
      wrapper.vm as unknown as { focusNode: (id: string) => Promise<void> }
    ).focusNode('n-70')
    expect(focusing).toBeInstanceOf(Promise)
    await focusing
    await flushTree(wrapper)

    expect(wrapper.find('[data-tree-node-id="n-70"]').exists()).toBe(true)
  })

  it('does not scroll a diagram after its route generation becomes stale', async () => {
    const wrapper = mountPanel({
      nodes: [],
      diagrams: [
        {
          id: 'diagram-1',
          name: 'Diagram',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          modelId: 'model-1',
          nodeId: null,
          parsedAttrs: parseDiagramAttrs(null),
        },
      ],
    })
    await flushTree(wrapper)
    const tree = wrapper.get('.tree').element as HTMLElement
    const scrollTo = vi.spyOn(tree, 'scrollTo')
    let current = true

    const focusing = (
      wrapper.vm as unknown as {
        focusDiagram: (id: string, isCurrent: () => boolean) => Promise<void>
      }
    ).focusDiagram('diagram-1', () => current)
    current = false
    await focusing

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
