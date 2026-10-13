import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
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

const grantsState = vi.hoisted(() => ({ keys: null as Set<string> | null }))

vi.mock('@/composables/useFeatureGrants', () => ({
  useFeatureGrants: () => ({
    hasGrant: (key: string) => !grantsState.keys || grantsState.keys.has(key),
  }),
}))

afterEach(() => {
  grantsState.keys = null
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
  modelSyncManaged?: boolean
  viewsFolderId?: string | null
  isAdminUser?: boolean
  currentUserId?: string | null
  clipboardAvailable?: boolean
  navigationOnlyMode?: boolean
  canEdit?: boolean
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
      modelSyncManaged: props.modelSyncManaged,
      viewsFolderId: props.viewsFolderId,
      isAdminUser: props.isAdminUser,
      currentUserId: props.currentUserId,
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
      clipboardAvailable: props.clipboardAvailable ?? false,
      navigationOnlyMode: props.navigationOnlyMode ?? false,
      canEdit: props.canEdit,
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
    const wrapper = mountPanel({
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
    })
    await flushTree(wrapper)

    await wrapper.get('[data-test="row-menu-trigger"]').trigger('click')
    await wrapper.get('[data-test="row-menu-copy"]').trigger('click')

    expect(wrapper.emitted('copyDiagramToModel')).toEqual([['diagram-1']])
  })

  it('hides diagram copy-to-model action without model.diagram.create grant', async () => {
    grantsState.keys = new Set(['model.diagram.create'].filter(() => false))

    const wrapper = mountPanel({
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
    })
    await flushTree(wrapper)

    await wrapper.get('[data-test="row-menu-trigger"]').trigger('click')

    expect(wrapper.find('[data-test="row-menu-copy"]').exists()).toBe(false)
  })

  it('shows diagram copy-to-model action with model.diagram.create grant', async () => {
    grantsState.keys = new Set(['model.diagram.create'])

    const wrapper = mountPanel({
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
    })
    await flushTree(wrapper)

    await wrapper.get('[data-test="row-menu-trigger"]').trigger('click')

    expect(wrapper.find('[data-test="row-menu-copy"]').exists()).toBe(true)
  })

  it('renders header creation actions in order diagram, folder, node', async () => {
    const wrapper = mountPanel({ nodes: [] })
    await flushTree(wrapper)

    const texts = wrapper
      .findAll('.panel__header-actions [text]')
      .map(button => button.attributes('text'))
    expect(texts.indexOf('models.createDiagramTitle')).toBeGreaterThanOrEqual(0)
    expect(texts.indexOf('models.createDiagramTitle')).toBeLessThan(
      texts.indexOf('models.addRootFolder')
    )
    expect(texts.indexOf('models.addRootFolder')).toBeLessThan(texts.indexOf('models.addRootNode'))
  })

  it('renders folder row creation actions in order diagram, folder, node', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
    })
    await flushTree(wrapper)

    const texts = wrapper
      .get('[data-tree-node-id="folder-a"]')
      .findAll('[text]')
      .map(tooltip => tooltip.attributes('text'))
    expect(texts.indexOf('models.createDiagramTitle')).toBeGreaterThanOrEqual(0)
    expect(texts.indexOf('models.createDiagramTitle')).toBeLessThan(
      texts.indexOf('models.addChildFolder')
    )
    expect(texts.indexOf('models.addChildFolder')).toBeLessThan(
      texts.indexOf('models.addChildNode')
    )
  })

  it('moves folder rename and delete under the more menu', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
    })
    await flushTree(wrapper)

    const row = wrapper.get('[data-tree-node-id="folder-a"]')
    expect(row.find('[text="models.renameFolder"]').exists()).toBe(false)
    expect(row.find('[text="common.delete"]').exists()).toBe(false)

    await row.get('[data-test="row-menu-trigger"]').trigger('click')

    const menu = row.get('[data-test="row-menu"]')
    expect(menu.find('[data-test="row-menu-rename"]').exists()).toBe(true)
    expect(menu.find('[data-test="row-menu-delete"]').exists()).toBe(true)

    await menu.get('[data-test="row-menu-delete"]').trigger('click')

    expect(wrapper.emitted('deleteNode')).toEqual([['folder-a']])
    expect(row.find('[data-test="row-menu"]').exists()).toBe(false)
  })

  it('starts folder rename from the more menu', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
    })
    await flushTree(wrapper)

    const row = wrapper.get('[data-tree-node-id="folder-a"]')
    expect(row.find('input').exists()).toBe(false)

    await row.get('[data-test="row-menu-trigger"]').trigger('click')
    await row.get('[data-test="row-menu-rename"]').trigger('click')

    expect(row.find('input').exists()).toBe(true)
  })

  it('closes the more menu on outside click', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
    })
    await flushTree(wrapper)

    const row = wrapper.get('[data-tree-node-id="folder-a"]')
    await row.get('[data-test="row-menu-trigger"]').trigger('click')
    expect(row.find('[data-test="row-menu"]').exists()).toBe(true)

    document.body.click()
    await nextTick()

    expect(row.find('[data-test="row-menu"]').exists()).toBe(false)
  })

  it('closes the open more menu when the cursor moves to another tree row', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' }),
        makeNode({ id: 'plain-b', name: 'Plain B' }),
      ],
    })
    await flushTree(wrapper)

    const source = wrapper.get('[data-tree-node-id="folder-a"]')
    await source.get('[data-test="row-menu-trigger"]').trigger('click')
    expect(source.find('[data-test="row-menu"]').exists()).toBe(true)

    // Курсор уходит на другую строку — меню закрывается, «налезания» текста нет.
    await wrapper.get('[data-tree-node-id="plain-b"]').trigger('mouseenter')
    expect(source.find('[data-test="row-menu"]').exists()).toBe(false)
  })

  it('keeps the menu open when the cursor re-enters the same row', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
    })
    await flushTree(wrapper)

    const row = wrapper.get('[data-tree-node-id="folder-a"]')
    await row.get('[data-test="row-menu-trigger"]').trigger('click')
    expect(row.find('[data-test="row-menu"]').exists()).toBe(true)

    // Мышь вернулась на ту же строку (попап выпал за её пределы) — меню живёт.
    await row.trigger('mouseenter')
    expect(row.find('[data-test="row-menu"]').exists()).toBe(true)
  })

  it('elevates the virtual row above neighbours while its more menu is open', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' }),
        makeNode({ id: 'plain-b', name: 'Plain B' }),
      ],
    })
    await flushTree(wrapper)

    const item = (nodeId: string) =>
      wrapper.get(`[data-tree-node-id="${nodeId}"]`).element.closest('.tree__virtual-item')!

    // Пока меню закрыты, ни одна строка не поднята.
    expect(item('folder-a').classList.contains('tree__virtual-item--menu-open')).toBe(false)

    await wrapper
      .get('[data-tree-node-id="folder-a"] [data-test="row-menu-trigger"]')
      .trigger('click')
    expect(item('folder-a').classList.contains('tree__virtual-item--menu-open')).toBe(true)
    expect(item('plain-b').classList.contains('tree__virtual-item--menu-open')).toBe(false)

    // Закрытие меню (клик по триггеру снова) снимает подъём.
    await wrapper
      .get('[data-tree-node-id="folder-a"] [data-test="row-menu-trigger"]')
      .trigger('click')
    expect(item('folder-a').classList.contains('tree__virtual-item--menu-open')).toBe(false)
  })

  it('elevates the diagram row while its more menu is open', async () => {
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

    const item = wrapper
      .get('[data-tree-diagram-id="diagram-1"]')
      .element.closest('.tree__virtual-item')!
    expect(item.classList.contains('tree__virtual-item--menu-open')).toBe(false)

    await wrapper
      .get('[data-tree-diagram-id="diagram-1"] [data-test="row-menu-trigger"]')
      .trigger('click')
    expect(item.classList.contains('tree__virtual-item--menu-open')).toBe(true)
  })

  it('truncates diagram names to one line with ellipsis and exposes full name in tooltip', async () => {
    const wrapper = mountPanel({
      nodes: [],
      diagrams: [
        {
          id: 'diagram-1',
          name: 'P0602 SyndPlatform Deployment Diagram',
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

    const name = wrapper.get('[data-tree-diagram-id="diagram-1"] .diagram-row__name')
    expect(name.text()).toBe('P0602 SyndPlatform Deployment Diagram')

    // Полное имя доступно тултипу (AppTooltip-стаб рендерит text как атрибут).
    const tip = wrapper.get('[data-tree-diagram-id="diagram-1"] .app-tooltip-stub')
    expect(tip.attributes('text')).toBe('P0602 SyndPlatform Deployment Diagram')
  })

  it('exposes full node names in tooltip for truncation', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'n1', name: 'Very Long Node Name That Will Truncate' })],
    })
    await flushTree(wrapper)

    const name = wrapper.get('[data-tree-node-id="n1"] .tree-node__name')
    expect(name.text()).toBe('Very Long Node Name That Will Truncate')

    const tip = wrapper.get('[data-tree-node-id="n1"] .app-tooltip-stub')
    expect(tip.attributes('text')).toBe('Very Long Node Name That Will Truncate')
  })

  it('moves diagram row secondary actions under the more menu', async () => {
    const wrapper = mountPanel({
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
    })
    await flushTree(wrapper)

    const row = wrapper.get('[data-tree-diagram-id="diagram-1"]')
    expect(row.find('.diagram-row__edit-btn').exists()).toBe(false)
    expect(row.find('.btn--icon--danger').exists()).toBe(false)
    expect(row.find('[text="models.diagramCopy.title"]').exists()).toBe(false)
    expect(row.find('[text="common.addToFavorites"]').exists()).toBe(true)

    await row.get('[data-test="row-menu-trigger"]').trigger('click')

    const menu = row.get('[data-test="row-menu"]')
    expect(menu.find('[data-test="row-menu-rename"]').exists()).toBe(true)
    expect(menu.find('[data-test="row-menu-delete"]').exists()).toBe(true)
    expect(menu.find('[data-test="row-menu-copy"]').exists()).toBe(true)

    await menu.get('[data-test="row-menu-copy"]').trigger('click')

    expect(wrapper.emitted('copyDiagramToModel')).toEqual([['diagram-1']])
  })

  it('uses shared btn--icon for header and row actions', async () => {
    const wrapper = mountPanel({
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
    })
    await flushTree(wrapper)

    const headerButtons = wrapper.findAll('.panel__header-actions button')
    expect(headerButtons.length).toBe(4)
    for (const button of headerButtons) {
      expect(button.classes()).toContain('btn--icon')
    }
    expect(wrapper.find('.mini-btn').exists()).toBe(false)

    const diagramRow = wrapper.get('[data-tree-diagram-id="diagram-1"]')
    expect(diagramRow.get('[data-test="row-menu-trigger"]').classes()).toContain('btn--icon')
    await diagramRow.get('[data-test="row-menu-trigger"]').trigger('click')
    expect(diagramRow.find('[data-test="row-menu-delete"]').exists()).toBe(true)
  })

  it('hides root create buttons when the tree root is locked by the sync', async () => {
    const wrapper = mount(ModelTreePalettePanel, {
      props: {
        nodes: [],
        diagrams: [],
        nodeTypes: [],
        selectedNodeId: null,
        selectedDiagramId: null,
        rootLocked: true,
      },
      global: { stubs: { UiIcon: true } },
    })

    expect(wrapper.find('[text="models.addRootFolder"]').exists()).toBe(false)
    expect(wrapper.find('[text="models.addRootNode"]').exists()).toBe(false)
    expect(wrapper.find('[text="models.createDiagramTitle"]').exists()).toBe(false)
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

  it('hides mutate and create buttons on a locked folder but keeps diagram creation', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({
          id: 'locked',
          name: 'Locked Folder',
          nodeTypeId: 'dir',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: { locked: true },
          },
        }),
      ],
    })
    await flushTree(wrapper)

    const row = wrapper.get('[data-tree-node-id="locked"]')
    expect(row.find('[text="models.addChildFolder"]').exists()).toBe(false)
    expect(row.find('[text="models.addChildNode"]').exists()).toBe(false)
    expect(row.find('[text="models.renameFolder"]').exists()).toBe(false)
    expect(row.find('[text="common.delete"]').exists()).toBe(false)
    expect(row.find('[text="models.createDiagramTitle"]').exists()).toBe(true)
    expect(row.attributes('draggable')).toBe('false')
  })

  it('hides diagram create buttons without the model.diagram.create grant', async () => {
    grantsState.keys = new Set([
      'model.tree.createRoot',
      'model.tree.createChildFolder',
      'model.tree.renameDeleteMoveFolder',
    ])
    const withoutGrant = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
    })
    await flushTree(withoutGrant)

    expect(withoutGrant.find('[text="models.createDiagramTitle"]').exists()).toBe(false)
    expect(
      withoutGrant
        .get('[data-tree-node-id="folder-a"]')
        .find('[text="models.createDiagramTitle"]')
        .exists()
    ).toBe(false)
    withoutGrant.unmount()

    grantsState.keys = new Set([...(grantsState.keys ?? []), 'model.diagram.create'])
    const withGrant = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
    })
    await flushTree(withGrant)

    expect(withGrant.find('[text="models.createDiagramTitle"]').exists()).toBe(true)
    expect(
      withGrant
        .get('[data-tree-node-id="folder-a"]')
        .find('[text="models.createDiagramTitle"]')
        .exists()
    ).toBe(true)
  })

  it('accepts diagram drops into a locked folder that allows diagrams', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({
          id: 'views',
          name: 'Views Folder',
          nodeTypeId: 'dir',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: { locked: true },
          },
        }),
      ],
      diagrams: [
        {
          id: 'diagram-1',
          name: 'Moved diagram',
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

    await wrapper.get('[data-tree-node-id="views"]').trigger('drop', {
      dataTransfer: {
        types: ['application/x-model-diagram-id'],
        getData: (type: string) => (type === 'application/x-model-diagram-id' ? 'diagram-1' : ''),
      },
    })

    expect(wrapper.emitted('moveDiagram')).toEqual([['diagram-1', 'views']])
  })

  const lockedViewsNode = () =>
    makeNode({
      id: 'views',
      name: 'Views',
      nodeTypeId: 'dir',
      parsedAttrs: {
        treeOrder: 0,
        notationComponents: {},
        componentProperties: {},
        typeProperties: { locked: true },
      },
    })

  const dropNodeEvent = (nodeId: string) => ({
    dataTransfer: {
      types: ['application/x-model-node-id'],
      getData: (type: string) => (type === 'application/x-model-node-id' ? nodeId : ''),
    },
  })

  it('shows only the folder button on locked Views folders of a sync-managed model', async () => {
    const wrapper = mountPanel({
      nodes: [
        lockedViewsNode(),
        makeNode({ id: 'user-folder', name: 'My diagrams', nodeTypeId: 'dir' }),
      ],
      modelSyncManaged: true,
      viewsFolderId: 'views',
    })
    await flushTree(wrapper)

    const viewsRow = wrapper.get('[data-tree-node-id="views"]')
    expect(viewsRow.find('[text="models.addChildFolder"]').exists()).toBe(true)
    expect(viewsRow.find('[text="models.addChildNode"]').exists()).toBe(false)

    // В sync-моделях элементы не создаются вручную — кнопка «+узел» скрыта везде
    const userRow = wrapper.get('[data-tree-node-id="user-folder"]')
    expect(userRow.find('[text="models.addChildFolder"]').exists()).toBe(true)
    expect(userRow.find('[text="models.addChildNode"]').exists()).toBe(false)
  })

  it('hides the root node button without the model.tree.createRootNode grant', async () => {
    grantsState.keys = new Set([
      'model.tree.createRoot',
      'model.tree.createChildFolder',
      'model.tree.renameDeleteMoveFolder',
      'model.diagram.create',
      'model.tree.createNode',
    ])
    const withoutGrant = mountPanel({ nodes: [] })
    expect(withoutGrant.find('[text="models.addRootNode"]').exists()).toBe(false)
    expect(withoutGrant.find('[text="models.addRootFolder"]').exists()).toBe(true)
    withoutGrant.unmount()

    grantsState.keys = new Set([...(grantsState.keys ?? []), 'model.tree.createRootNode'])
    const withGrant = mountPanel({ nodes: [] })
    expect(withGrant.find('[text="models.addRootNode"]').exists()).toBe(true)
  })

  it('shows the diagram button only inside the Views branch of a sync-managed model', async () => {
    const wrapper = mountPanel({
      nodes: [
        lockedViewsNode(),
        makeNode({ id: 'app-folder', name: 'App Folder', nodeTypeId: 'dir' }),
      ],
      modelSyncManaged: true,
      viewsFolderId: 'views',
    })
    await flushTree(wrapper)

    // Views-папка — кнопка диаграмм есть
    expect(
      wrapper.get('[data-tree-node-id="views"]').find('[text="models.createDiagramTitle"]').exists()
    ).toBe(true)

    // Обычная папка вне Views — кнопки нет
    expect(
      wrapper
        .get('[data-tree-node-id="app-folder"]')
        .find('[text="models.createDiagramTitle"]')
        .exists()
    ).toBe(false)

    // Корневая кнопка диаграмм скрыта в sync-модели (как и все корневые)
    expect(wrapper.find('[text="models.addRootFolder"]').exists()).toBe(false)
    expect(wrapper.find('[text="models.addRootNode"]').exists()).toBe(false)
    expect(wrapper.find('.panel__header-actions [text="models.createDiagramTitle"]').exists()).toBe(
      false
    )
  })

  it('keeps locked non-Views folders closed for folder creation in a sync-managed model', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({
          id: 'locked-app',
          name: 'Locked App Folder',
          nodeTypeId: 'dir',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: { locked: true },
          },
        }),
      ],
      modelSyncManaged: true,
      viewsFolderId: 'views',
    })
    await flushTree(wrapper)

    const row = wrapper.get('[data-tree-node-id="locked-app"]')
    expect(row.find('[text="models.addChildFolder"]').exists()).toBe(false)
    expect(row.find('[text="models.addChildNode"]').exists()).toBe(false)
  })

  it('passes node drops in locked Views folders, auto-created and root drops to the move handler', async () => {
    const wrapper = mountPanel({
      nodes: [
        lockedViewsNode(),
        makeNode({ id: 'user-folder', name: 'My diagrams', nodeTypeId: 'dir' }),
        makeNode({ id: 'element', name: 'Element' }),
        makeNode({
          id: 'auto-element',
          name: 'P123 - product',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: {},
            dpc: { kind: 'appProduct', id: '123', autoCreated: true },
          },
        }),
      ],
      modelSyncManaged: true,
      viewsFolderId: 'views',
    })
    await flushTree(wrapper)

    // Папка в locked Views-папку — валидный дроп
    await wrapper.get('[data-tree-node-id="views"]').trigger('drop', dropNodeEvent('user-folder'))
    expect(wrapper.emitted('moveNode')).toContainEqual(['user-folder', 'views', 'inside'])

    // Остальные спорные дропы тоже эмитятся — reject + сообщение делает handleMoveNode
    await wrapper.get('[data-tree-node-id="views"]').trigger('drop', dropNodeEvent('element'))
    expect(wrapper.emitted('moveNode')).toContainEqual(['element', 'views', 'inside'])

    await wrapper.get('[data-tree-node-id="user-folder"]').trigger('drop', {
      dataTransfer: {
        types: ['application/x-model-node-id'],
        getData: (type: string) => (type === 'application/x-model-node-id' ? 'auto-element' : ''),
      },
    })
    expect(wrapper.emitted('moveNode')).toContainEqual(['auto-element', 'user-folder', 'inside'])

    await wrapper.get('.tree').trigger('drop', dropNodeEvent('user-folder'))
    expect(wrapper.emitted('moveNode')).toContainEqual(['user-folder', null, 'inside'])
  })

  it('does not highlight a locked Views folder as inside target for element drags', async () => {
    const wrapper = mountPanel({
      nodes: [
        lockedViewsNode(),
        makeNode({ id: 'user-folder', name: 'My diagrams', nodeTypeId: 'dir' }),
        makeNode({ id: 'element', name: 'Element' }),
      ],
      modelSyncManaged: true,
      viewsFolderId: 'views',
    })
    await flushTree(wrapper)

    const viewsRow = wrapper.get('[data-tree-node-id="views"]')
    // dragover не может прочитать data — различаем маркером типа перетаскиваемого узла;
    // clientY=0 попадает в среднюю зону строки (внутрь)
    await viewsRow.trigger('dragover', {
      dataTransfer: { types: ['application/x-model-node-id'] },
      clientY: 0,
    })
    expect(viewsRow.classes()).not.toContain('tree-node__row--drop-inside')

    await viewsRow.trigger('dragover', {
      dataTransfer: { types: ['application/x-model-node-id', 'application/x-model-node-folder'] },
      clientY: 0,
    })
    expect(viewsRow.classes()).toContain('tree-node__row--drop-inside')
  })

  it('restricts diagram dragging to the author in a sync-managed model', async () => {
    const diagram = {
      id: 'diagram-1',
      name: 'Author diagram',
      version: '1.0.0',
      notationId: 'notation-1',
      ownerId: 'author-1',
      modelId: 'model-1',
      nodeId: null,
      parsedAttrs: parseDiagramAttrs(null),
    }

    const nonAuthor = mountPanel({
      nodes: [],
      diagrams: [diagram],
      modelSyncManaged: true,
      currentUserId: 'other-1',
    })
    expect(nonAuthor.get('[data-tree-diagram-id="diagram-1"]').attributes('draggable')).toBe(
      'false'
    )

    const author = mountPanel({
      nodes: [],
      diagrams: [diagram],
      modelSyncManaged: true,
      currentUserId: 'author-1',
    })
    expect(author.get('[data-tree-diagram-id="diagram-1"]').attributes('draggable')).toBe('true')

    const admin = mountPanel({
      nodes: [],
      diagrams: [diagram],
      modelSyncManaged: true,
      currentUserId: 'admin-1',
      isAdminUser: true,
    })
    expect(admin.get('[data-tree-diagram-id="diagram-1"]').attributes('draggable')).toBe('true')
  })

  it('hides the delete button on auto-created elements', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({
          id: 'auto-element',
          name: 'P123 - product',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: {},
            dpc: { kind: 'appProduct', id: '123', autoCreated: true },
          },
        }),
        makeNode({ id: 'plain-element', name: 'Manual node' }),
      ],
    })
    await flushTree(wrapper)

    const autoRow = wrapper.get('[data-tree-node-id="auto-element"]')
    expect(autoRow.find('[data-test="row-menu-trigger"]').exists()).toBe(false)
    // Автосозданные элементы перетаскиваются (можно бросить на холст диаграммы)…
    expect(autoRow.attributes('draggable')).toBe('true')

    const plainRow = wrapper.get('[data-tree-node-id="plain-element"]')
    await plainRow.get('[data-test="row-menu-trigger"]').trigger('click')
    expect(plainRow.find('[data-test="row-menu-delete"]').exists()).toBe(true)
    expect(plainRow.find('[data-test="row-menu-rename"]').exists()).toBe(false)
  })

  it('emits tree drops of auto-created elements for the move handler to reject', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' }),
        makeNode({
          id: 'auto-element',
          name: 'P123 - product',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: {},
            dpc: { kind: 'appProduct', id: '123', autoCreated: true },
          },
        }),
      ],
    })
    await flushTree(wrapper)

    await wrapper.get('[data-tree-node-id="folder-a"]').trigger('drop', {
      dataTransfer: {
        types: ['application/x-model-node-id'],
        getData: (type: string) => (type === 'application/x-model-node-id' ? 'auto-element' : ''),
      },
    })

    expect(wrapper.emitted('moveNode')).toEqual([['auto-element', 'folder-a', 'inside']])
  })

  it('hides the child-node button without the model.tree.createNode grant', async () => {
    grantsState.keys = new Set([
      'model.tree.createRoot',
      'model.tree.createChildFolder',
      'model.tree.renameDeleteMoveFolder',
      'model.diagram.create',
    ])
    const withoutGrant = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
    })
    await flushTree(withoutGrant)

    const row = withoutGrant.get('[data-tree-node-id="folder-a"]')
    expect(row.find('[text="models.addChildNode"]').exists()).toBe(false)
    expect(row.find('[text="models.addChildFolder"]').exists()).toBe(true)
    expect(row.find('[text="models.createDiagramTitle"]').exists()).toBe(true)
    withoutGrant.unmount()

    grantsState.keys = new Set([...(grantsState.keys ?? []), 'model.tree.createNode'])
    const withGrant = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
    })
    await flushTree(withGrant)

    expect(
      withGrant.get('[data-tree-node-id="folder-a"]').find('[text="models.addChildNode"]').exists()
    ).toBe(true)
  })

  it('hides the diagram button on a noDiagrams folder but keeps mutate buttons', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({
          id: 'nodiagrams',
          name: 'No Diagrams Folder',
          nodeTypeId: 'dir',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: { noDiagrams: true },
          },
        }),
      ],
    })
    await flushTree(wrapper)

    const row = wrapper.get('[data-tree-node-id="nodiagrams"]')
    expect(row.find('[text="models.createDiagramTitle"]').exists()).toBe(false)
    expect(row.find('[text="models.addChildFolder"]').exists()).toBe(true)
    expect(row.find('[text="models.addChildNode"]').exists()).toBe(true)

    await row.get('[data-test="row-menu-trigger"]').trigger('click')
    expect(row.find('[data-test="row-menu-rename"]').exists()).toBe(true)
    expect(row.find('[data-test="row-menu-delete"]').exists()).toBe(true)
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

    // No toggle button — but a spacer keeps the row aligned with expandable rows.
    expect(wrapper.find('[data-tree-node-id="folder"] button.tree-node__toggle').exists()).toBe(
      false
    )
    expect(wrapper.find('[data-tree-node-id="folder"] span.tree-node__toggle').exists()).toBe(true)
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
      wrapper.find('[data-tree-node-id="persisted-empty-folder"] button.tree-node__toggle').exists()
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
    ).toBe('Diagrams / Apps')
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

  it('shows paste in folder row menu only when clipboard is available', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
    })
    await flushTree(wrapper)

    await wrapper
      .get('[data-tree-node-id="folder-a"] [data-test="row-menu-trigger"]')
      .trigger('click')
    // Папка — ручная нода: «Копировать» доступно и без буфера…
    expect(wrapper.find('[data-test="row-menu-copy"]').exists()).toBe(true)
    // …а «Вставить» — только когда в буфере есть узел.
    expect(wrapper.find('[data-test="row-menu-paste"]').exists()).toBe(false)

    // Close the popup (outside click) before asserting on the second mount.
    await document.body.click()

    const withClipboard = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
      clipboardAvailable: true,
    })
    await flushTree(withClipboard)

    await withClipboard
      .get('[data-tree-node-id="folder-a"] [data-test="row-menu-trigger"]')
      .trigger('click')
    expect(withClipboard.find('[data-test="row-menu-copy"]').exists()).toBe(true)
    expect(withClipboard.find('[data-test="row-menu-paste"]').exists()).toBe(true)
    withClipboard.unmount()
  })

  it('shows copy in row menu of manual nodes and hides both items on auto-created nodes', async () => {
    const autoNode = makeNode({
      id: 'auto-element',
      name: 'P123 - product',
      parsedAttrs: {
        treeOrder: 0,
        notationComponents: {},
        componentProperties: {},
        typeProperties: {},
        dpc: { kind: 'appProduct', id: '123', autoCreated: true },
      },
    })
    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' }),
        autoNode,
        makeNode({ id: 'manual-node', name: 'Manual node' }),
      ],
      clipboardAvailable: true,
    })
    await flushTree(wrapper)

    // Автосозданным узлам row-menu недоступен целиком (как delete в 0.25.20),
    // поэтому copy/paste скрыты де-факто — проверяем отсутствие триггера.
    expect(
      wrapper.find('[data-tree-node-id="auto-element"] [data-test="row-menu-trigger"]').exists()
    ).toBe(false)

    const manual = wrapper.get('[data-tree-node-id="manual-node"]')
    await manual.get('[data-test="row-menu-trigger"]').trigger('click')
    expect(manual.find('[data-test="row-menu-copy"]').exists()).toBe(true)
    expect(manual.find('[data-test="row-menu-paste"]').exists()).toBe(false)

    await manual.find('[data-test="row-menu-copy"]')!.trigger('click')
    expect(wrapper.emitted('copyNode')).toEqual([['manual-node']])

    // Paste is offered on folders; the popup reopened after the outside-click close.
    const folder = wrapper.get('[data-tree-node-id="folder-a"]')
    await folder.get('[data-test="row-menu-trigger"]').trigger('click')
    await folder.find('[data-test="row-menu-paste"]')!.trigger('click')
    expect(wrapper.emitted('pasteNode')).toEqual([['folder-a']])
  })

  it('hides paste in navigation-only mode', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' })],
      clipboardAvailable: true,
      navigationOnlyMode: true,
    })
    await flushTree(wrapper)

    await wrapper
      .get('[data-tree-node-id="folder-a"] [data-test="row-menu-trigger"]')
      .trigger('click')
    expect(wrapper.find('[data-test="row-menu-paste"]').exists()).toBe(false)
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

describe('focusNode highlight flash', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('scrolls to the node row and flashes highlight when node is outside viewport', async () => {
    const nodes: EditorNode[] = [makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' })]
    for (let i = 0; i < 80; i += 1) {
      nodes.push(
        makeNode({
          id: `node-${i}`,
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

    expect(wrapper.find('[data-tree-node-id="node-48"]').exists()).toBe(false)

    const vm = wrapper.vm as unknown as {
      focusNode: (id: string) => Promise<void>
      highlightFlash: string | null
    }
    await vm.focusNode('node-48')
    await flushPromises()
    await flushTree(wrapper)

    // после focusNode нода видима и подсвечена
    expect(wrapper.find('[data-tree-node-id="node-48"]').exists()).toBe(true)
    expect(vm.highlightFlash).toBe('node-48')
  })

  it('does not scroll or flash when node is absent from tree rows', async () => {
    const wrapper = mountPanel({
      nodes: [makeNode({ id: 'a', name: 'A' }), makeNode({ id: 'b', name: 'B' })],
    })
    await flushTree(wrapper)

    const vm = wrapper.vm as unknown as {
      focusNode: (id: string) => Promise<void>
      highlightFlash: string | null
    }
    await vm.focusNode('missing-id')
    await flushPromises()

    expect(vm.highlightFlash).toBeNull()
  })

  it('view-only ACL (viewer/reader) cannot drag tree nodes onto a diagram or mutate diagrams', async () => {
    const wrapper = mountPanel({
      canEdit: false,
      nodes: [
        makeNode({ id: 'folder-a', name: 'Folder A', nodeTypeId: 'dir' }),
        makeNode({
          id: 'auto-element',
          name: 'P123 - product',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: { autoCreated: true },
          },
        }),
      ],
      diagrams: [
        {
          id: 'diagram-1',
          name: 'Overview',
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

    expect(wrapper.get('[data-tree-node-id="auto-element"]').attributes('draggable')).toBe('false')
    expect(wrapper.get('[data-tree-node-id="folder-a"]').attributes('draggable')).toBe('false')
    expect(wrapper.find('[data-test="row-menu-trigger"]').exists()).toBe(false)
    expect(wrapper.find('[text="models.createDiagramTitle"]').exists()).toBe(false)
    expect(wrapper.find('[text="models.renameDiagram"]').exists()).toBe(false)
    expect(wrapper.find('[text="common.delete"]').exists()).toBe(false)
  })

  it('editor ACL can drag auto-created nodes from the tree (drop onto diagram)', async () => {
    grantsState.keys = new Set(['model.diagram.create', 'model.comments'])
    const wrapper = mountPanel({
      canEdit: true,
      nodes: [
        makeNode({
          id: 'auto-element',
          name: 'P123 - product',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: { autoCreated: true },
          },
        }),
      ],
    })
    await flushTree(wrapper)

    expect(wrapper.get('[data-tree-node-id="auto-element"]').attributes('draggable')).toBe('true')
    expect(wrapper.find('[text="models.addChildNode"]').exists()).toBe(false)
  })
})
