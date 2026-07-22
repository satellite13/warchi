import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DualDiagramCompareView from './DualDiagramCompareView.vue'

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  }
})

vi.mock('@/composables/useResizablePropsPanel', () => ({
  useResizablePropsPanel: () => ({
    propsPanelHeight: { value: 200 },
    startPropsPanelResize: vi.fn(),
  }),
}))

vi.mock('../composables/useComparisonDiff', async () => {
  const actual = await vi.importActual<typeof import('../composables/useComparisonDiff')>(
    '../composables/useComparisonDiff',
  )
  return {
    ...actual,
    useComparisonDiff: () => ({
      leftEditorNodes: [],
      leftEditorLinks: [],
      rightEditorNodes: [],
      rightEditorLinks: [],
      leftCanvasDiffState: {
        diffStateByModelNodeId: {},
        diffStateByModelLinkId: {},
        diffStateByEdgeInstanceId: {},
      },
      rightCanvasDiffState: {
        diffStateByModelNodeId: {},
        diffStateByModelLinkId: {},
        diffStateByEdgeInstanceId: {},
      },
      handleToggleBaseSide: vi.fn(),
      handleLeftSelectNodes: vi.fn(),
      handleLeftSelectLink: vi.fn(),
      handleLeftSelectEdgeInstanceId: vi.fn(),
      handleRightSelectNodes: vi.fn(),
      handleRightSelectLink: vi.fn(),
      handleRightSelectEdgeInstanceId: vi.fn(),
      selectedPropertyRows: [
        { key: 'name', base: 'A', target: 'B', changed: true },
      ],
      selectedElementDiffKind: 'modified',
      comparePropWasLabel: 'was',
      comparePropBecameLabel: 'became',
      isLeftBaseForProps: true,
      selectedElementLabel: 'Node /foo',
    }),
  }
})

const canvasStub = {
  name: 'ModelDiagramCanvas',
  template: '<div class="canvas-stub" />',
  methods: { fitToView: vi.fn() },
}

function mountCompare(options?: {
  error?: string | null
  swapDisabled?: boolean
  withDiagrams?: boolean
}) {
  const diagram = options?.withDiagrams
    ? ({
        id: 'd1',
        name: 'Main',
        version: '1.0.0',
        modelId: 'm1',
        ownerId: 'u1',
        attrs: null,
        parsedAttrs: { instances: { nodes: [], edges: [] } },
      } as never)
    : null

  return mount(DualDiagramCompareView, {
    props: {
      error: options?.error ?? null,
      propsPanelStorageKey: 'test:props',
      swapDisabled: options?.swapDisabled ?? false,
      leftData: null,
      rightData: null,
      leftDiagram: diagram,
      rightDiagram: diagram,
      sharedData: options?.withDiagrams
        ? ({
            components: [],
            relations: [],
            relationRules: [],
          } as never)
        : null,
    },
    slots: {
      'before-swap': '<div class="slot-before">before</div>',
      'after-swap': '<div class="slot-after">after</div>',
      'topbar-extra': '<div class="slot-extra">extra</div>',
    },
    global: {
      stubs: {
        MainLayout: {
          template:
            '<div class="main-layout"><slot name="header" /><slot /><slot name="footer" /></div>',
        },
        AppHeader: true,
        AppFooter: true,
        UiIcon: true,
        ModelDiagramCanvas: canvasStub,
      },
    },
  })
}

describe('DualDiagramCompareView', () => {
  it('renders selector slots and swap control in the top bar', () => {
    const wrapper = mountCompare()

    expect(wrapper.find('.slot-before').exists()).toBe(true)
    expect(wrapper.find('.slot-after').exists()).toBe(true)
    expect(wrapper.find('.slot-extra').exists()).toBe(true)
    expect(wrapper.find('.ddc__swap').exists()).toBe(true)
  })

  it('emits back when the back button is clicked', async () => {
    const wrapper = mountCompare()

    await wrapper.find('.ddc__back').trigger('click')

    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('disables swap when swapDisabled is true', () => {
    const wrapper = mountCompare({ swapDisabled: true })

    expect(wrapper.find('.ddc__swap').attributes('disabled')).toBeDefined()
  })

  it('shows error instead of canvas body', () => {
    const wrapper = mountCompare({ error: 'boom' })

    expect(wrapper.find('.ddc__error').text()).toBe('boom')
    expect(wrapper.find('.ddc__body').exists()).toBe(false)
  })

  it('shows properties panel when a selected element label is present', () => {
    const wrapper = mountCompare()

    expect(wrapper.find('.ddc__props').exists()).toBe(true)
    expect(wrapper.text()).toContain('Node /foo')
    expect(wrapper.text()).toContain('name')
  })
})
