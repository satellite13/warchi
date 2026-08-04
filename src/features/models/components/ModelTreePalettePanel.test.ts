import { mount } from '@vue/test-utils'
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
    // Needed so focusNode/focusDiagram document.querySelector + scrollIntoView work
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

    const input = wrapper.get('.panel__search-input')
    await input.setValue('special')
    vi.advanceTimersByTime(200)
    await nextTick()

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
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' }),
        makeNode({ id: 'hit', name: 'SpecialChild', parentNodeId: 'folder' }),
      ],
      selectedNodeId: 'hit',
    })

    const input = wrapper.get('.panel__search-input')
    await input.setValue('special')
    vi.advanceTimersByTime(200)
    await nextTick()

    await input.setValue('')
    // clear path sets debounced query sync when trimmed empty (no debounce wait required)
    await nextTick()
    await nextTick()

    expect(wrapper.props('selectedNodeId')).toBe('hit')
    // After clear, hierarchical full tree should show hit when folder expanded
    expect(wrapper.find('[data-tree-node-id="hit"]').exists()).toBe(true)
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('does not clear search on select click', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' }),
        makeNode({ id: 'hit', name: 'SpecialChild', parentNodeId: 'folder' }),
      ],
    })
    const input = wrapper.get('.panel__search-input')
    await input.setValue('special')
    vi.advanceTimersByTime(200)
    await nextTick()

    await wrapper.get('[data-tree-node-id="hit"] .tree-node__select').trigger('click')
    expect((input.element as HTMLInputElement).value).toBe('special')
    expect(wrapper.emitted('selectNode')?.[0]).toEqual(['hit'])
  })
})
