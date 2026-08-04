import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ModelTreePalettePanel from './ModelTreePalettePanel.vue'
import type { EditorNode } from '../types'

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

function makeNode(
  overrides: Partial<EditorNode> & { id: string; name: string; nodeTypeId?: string },
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
    get: () => Math.max(height, Number.parseInt(wrapper.find('.tree__virtual').attributes('style')?.match(/height:\s*(\d+)/)?.[1] ?? '0', 10) || height),
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
}) {
  return mount(ModelTreePalettePanel, {
    props: {
      nodes: props.nodes,
      diagrams: [],
      nodeTypes: [
        { id: 'dir', name: 'Directory', version: '1.0.0', ownerId: 'o1' } as never,
        { id: 'nt1', name: 'Application Component', version: '1.0.0', ownerId: 'o1' } as never,
      ],
      selectedNodeId: props.selectedNodeId ?? null,
      selectedDiagramId: props.selectedDiagramId ?? null,
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

    const input = wrapper.get('.panel__search-input')
    await input.setValue('special')
    vi.advanceTimersByTime(200)
    await flushTree(wrapper)

    const rows = wrapper.findAll('[data-tree-node-id]')
    const ids = rows.map((r) => r.attributes('data-tree-node-id'))
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

    const input = wrapper.get('.panel__search-input')
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
    const input = wrapper.get('.panel__search-input')
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
    await wrapper.get('.panel__search-input').setValue('special')
    vi.advanceTimersByTime(200)
    await flushTree(wrapper)

    expect(wrapper.get('[data-tree-node-id="folder"] .tree-node__name').classes()).toContain(
      'tree-node__name--ancestor',
    )
    expect(wrapper.get('[data-tree-node-id="hit"] .tree-node__name').classes()).not.toContain(
      'tree-node__name--ancestor',
    )
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
        }),
      )
    }

    const wrapper = mountPanel({ nodes })
    await flushTree(wrapper)

    // Expand root folder
    await wrapper.get('[data-tree-node-id="root-folder"] .tree-node__toggle').trigger('click')
    await flushTree(wrapper)

    const rendered = wrapper.findAll('[data-tree-node-id]')
    expect(rendered.length).toBeGreaterThan(0)
    // Viewport 480 / row 40 ≈ 12 + overscan 10*2 ≈ well under 300
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
        }),
      )
    }

    const wrapper = mountPanel({ nodes })
    await flushTree(wrapper)
    await wrapper.get('[data-tree-node-id="folder"] .tree-node__toggle').trigger('click')
    await flushTree(wrapper)

    expect(wrapper.find('[data-tree-node-id="n-70"]').exists()).toBe(false)

    ;(wrapper.vm as unknown as { focusNode: (id: string) => void }).focusNode('n-70')
    await flushTree(wrapper)

    expect(wrapper.find('[data-tree-node-id="n-70"]').exists()).toBe(true)
  })
})
