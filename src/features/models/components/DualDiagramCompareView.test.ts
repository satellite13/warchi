import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DualDiagramCompareView from './DualDiagramCompareView.vue'
import { nextTick } from 'vue'

const SYNC_KEY = 'warchi:compare-sync-viewports'

type Viewport = { zoom: number; offsetX: number; offsetY: number }

const LEFT_FIT_VP: Viewport = { zoom: 1.1, offsetX: 10, offsetY: 20 }
const RIGHT_FIT_VP: Viewport = { zoom: 1.9, offsetX: 99, offsetY: 88 }

let nextCanvasSide: 'left' | 'right' = 'left'

function makeCanvasStub() {
  return {
    name: 'ModelDiagramCanvas',
    template: '<div class="canvas-stub" />',
    data() {
      return {
        _viewport: { zoom: 1, offsetX: 0, offsetY: 0 } as Viewport,
        setViewportCalls: [] as Viewport[],
        _compareSide: 'left' as 'left' | 'right',
      }
    },
    created() {
      const self = this as { _compareSide: 'left' | 'right' }
      self._compareSide = nextCanvasSide
      nextCanvasSide = nextCanvasSide === 'left' ? 'right' : 'left'
    },
    methods: {
      fitToView() {
        const self = this as {
          _compareSide: 'left' | 'right'
          _viewport: Viewport
          $emit: (e: string, p: Viewport) => void
        }
        const vp = self._compareSide === 'left' ? LEFT_FIT_VP : RIGHT_FIT_VP
        self._viewport = { ...vp }
        self.$emit('viewport-change', { ...vp })
      },
      getViewport(): Viewport {
        return { ...(this as { _viewport: Viewport })._viewport }
      },
      setViewport(state: Viewport) {
        const self = this as {
          _viewport: Viewport
          setViewportCalls: Viewport[]
          $emit: (e: string, p: Viewport) => void
        }
        self._viewport = { ...state }
        self.setViewportCalls.push({ ...state })
        self.$emit('viewport-change', { ...state })
      },
    },
  }
}

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

function mountCompare(options?: {
  error?: string | null
  swapDisabled?: boolean
  withDiagrams?: boolean
  syncStorage?: '1' | '0' | null
}) {
  nextCanvasSide = 'left'

  if (options?.syncStorage === null) {
    localStorage.removeItem(SYNC_KEY)
  } else if (options?.syncStorage !== undefined) {
    localStorage.setItem(SYNC_KEY, options.syncStorage)
  }

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
        ModelDiagramCanvas: makeCanvasStub(),
      },
    },
  })
}

function canvasStubs(wrapper: ReturnType<typeof mountCompare>) {
  const canvases = wrapper.findAllComponents({ name: 'ModelDiagramCanvas' })
  return {
    left: canvases[0]!,
    right: canvases[1]!,
  }
}

describe('DualDiagramCompareView', () => {
  beforeEach(() => {
    localStorage.removeItem(SYNC_KEY)
  })

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

  describe('viewport sync', () => {
    it('defaults sync ON and renders toggle checked', () => {
      const wrapper = mountCompare({ withDiagrams: true })
      const input = wrapper.find('.ddc__sync-input')
      expect(input.exists()).toBe(true)
      expect((input.element as HTMLInputElement).checked).toBe(true)
    })

    it('restores sync OFF from localStorage', () => {
      localStorage.setItem(SYNC_KEY, '0')
      const wrapper = mountCompare({ withDiagrams: true })
      expect((wrapper.find('.ddc__sync-input').element as HTMLInputElement).checked).toBe(false)
    })

    it('persists toggle to localStorage', async () => {
      const wrapper = mountCompare({ withDiagrams: true })
      await wrapper.find('.ddc__sync-input').setValue(false)
      expect(localStorage.getItem(SYNC_KEY)).toBe('0')
      await wrapper.find('.ddc__sync-input').setValue(true)
      expect(localStorage.getItem(SYNC_KEY)).toBe('1')
    })

    it('copies viewport from left to right when sync is on', async () => {
      const wrapper = mountCompare({ withDiagrams: true })
      const { left, right } = canvasStubs(wrapper)
      const vp = { zoom: 2, offsetX: 40, offsetY: -10 }
      left.vm._viewport = vp
      await left.vm.$emit('viewport-change', vp)
      await nextTick()
      expect(right.vm.setViewportCalls.at(-1)).toEqual(vp)
    })

    it('does not sync when toggle is off', async () => {
      localStorage.setItem(SYNC_KEY, '0')
      const wrapper = mountCompare({ withDiagrams: true })
      const { left, right } = canvasStubs(wrapper)
      const before = right.vm.setViewportCalls.length
      await left.vm.$emit('viewport-change', { zoom: 3, offsetX: 1, offsetY: 2 })
      await nextTick()
      expect(right.vm.setViewportCalls.length).toBe(before)
    })

    it('snaps opposite to last active when sync is turned on', async () => {
      localStorage.setItem(SYNC_KEY, '0')
      const wrapper = mountCompare({ withDiagrams: true })
      const { left, right } = canvasStubs(wrapper)

      right.vm._viewport = { zoom: 1.5, offsetX: 9, offsetY: 8 }
      await right.vm.$emit('viewport-change', right.vm._viewport)
      await nextTick()

      await wrapper.find('.ddc__sync-input').setValue(true)
      await nextTick()

      expect(left.vm.setViewportCalls.at(-1)).toEqual({ zoom: 1.5, offsetX: 9, offsetY: 8 })
    })

    it('does not loop when setViewport emits viewport-change on target', async () => {
      const wrapper = mountCompare({ withDiagrams: true })
      const { left, right } = canvasStubs(wrapper)
      const leftBefore = left.vm.setViewportCalls.length
      await left.vm.$emit('viewport-change', { zoom: 2, offsetX: 5, offsetY: 6 })
      await nextTick()
      expect(left.vm.setViewportCalls.length).toBe(leftBefore)
    })

    it('after paired fitToView, left fit wins (right snapped to left)', async () => {
      const wrapper = mountCompare({ withDiagrams: true })
      await nextTick()
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      await nextTick()

      const { left, right } = canvasStubs(wrapper)
      expect(left.vm.getViewport()).toEqual(LEFT_FIT_VP)
      expect(right.vm.getViewport()).toEqual(LEFT_FIT_VP)
      expect(right.vm.setViewportCalls.at(-1)).toEqual(LEFT_FIT_VP)
      expect(left.vm.setViewportCalls.some((vp: Viewport) => vp.zoom === RIGHT_FIT_VP.zoom)).toBe(
        false,
      )
    })
  })
})
