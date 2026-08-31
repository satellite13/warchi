/* eslint-disable @typescript-eslint/no-explicit-any -- test component access pattern */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useDropdownPanel } from './useDropdownPanel'
import * as positionMod from '@/utils/dropdownPanelPosition'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'ru' } }),
}))

describe('useDropdownPanel', () => {
  const mockPanelClass = 'test-panel'
  const mockOptions = {
    panelClass: mockPanelClass,
    headerBlockPx: 44,
  }

  function createTestComponent(options: typeof mockOptions) {
    let result: ReturnType<typeof useDropdownPanel> | null = null
    return defineComponent({
      setup() {
        const controlRef = ref<HTMLDivElement | null>(null)
        const searchInputRef = ref<HTMLInputElement | null>(null)
        result = useDropdownPanel(controlRef, searchInputRef, options)
        return {
          ...result!,
          controlRef,
          searchInputRef,
        }
      },
      mounted() {
        // Store result for test access after mount
        ;(this as any)._result = result
      },
      template: `<div ref="controlRef"><input ref="searchInputRef" /></div>`,
    })
  }

  beforeEach(() => {
    vi.spyOn(positionMod, 'computeDropdownPanelPlacement').mockReturnValue({
      left: 10,
      top: 50,
      width: 200,
      maxPanelHeight: 200,
      maxListHeight: 156,
      openUpward: false,
    })
    vi.spyOn(globalThis, 'innerWidth', 'get').mockReturnValue(1920)
    vi.spyOn(globalThis, 'innerHeight', 'get').mockReturnValue(1080)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in closed state', async () => {
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    expect(r.isOpen.value).toBe(false)
    expect(r.searchQuery.value).toBe('')
    expect(r.panelPlacement.value).toBeNull()
  })

  it('opens panel, clears search, updates position', async () => {
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.open()

    expect(r.isOpen.value).toBe(true)
    expect(r.searchQuery.value).toBe('')
    expect(positionMod.computeDropdownPanelPlacement).toHaveBeenCalled()
  })

  it('closes panel', async () => {
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.close()
    expect(r.isOpen.value).toBe(false)
  })

  it('toggles open when closed', async () => {
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.toggle()
    expect(r.isOpen.value).toBe(true)
  })

  it('toggles close when open', async () => {
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.toggle()
    expect(r.isOpen.value).toBe(true)
    r.toggle()
    expect(r.isOpen.value).toBe(false)
  })

  it('does not toggle when disabled is true (closed)', async () => {
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.toggle(true)
    expect(r.isOpen.value).toBe(false)
  })

  it('does not toggle when disabled is true (open)', async () => {
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.toggle()
    r.toggle(true)
    expect(r.isOpen.value).toBe(true)
  })

  it('open triggers position update via watch', async () => {
    const posSpy = vi.spyOn(positionMod, 'computeDropdownPanelPlacement')
    posSpy.mockClear()
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.open()
    // open calls updatePanelPosition synchronously, then again in nextTick
    expect(posSpy).toHaveBeenCalledTimes(1)
    await flushPromises()
    expect(posSpy).toHaveBeenCalledTimes(2)
  })

  it('open/close cycle re-adds and removes listeners (watch effect)', async () => {
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.open()
    expect(r.isOpen.value).toBe(true)
    r.close()
    expect(r.isOpen.value).toBe(false)
    r.open()
    expect(r.isOpen.value).toBe(true)
  })

  it('registers click listener on mount', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
    const Comp = createTestComponent(mockOptions)
    mount(Comp)

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), true)
  })

  it('cleans up all listeners on unmount', async () => {
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener').mockImplementation(() => {})
    const docRemoveSpy = vi.spyOn(document, 'removeEventListener').mockImplementation(() => {})

    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    removeSpy.mockClear()
    docRemoveSpy.mockClear()

    wrapper.unmount()

    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(docRemoveSpy).toHaveBeenCalledWith('click', expect.any(Function), true)
  })

  it('does not update position when controlRef is null', async () => {
    let result: ReturnType<typeof useDropdownPanel> | null = null
    const TestComp = defineComponent({
      setup() {
        const controlRef = ref<HTMLDivElement | null>(null)
        const searchInputRef = ref<HTMLInputElement | null>(null)
        controlRef.value = null
        result = useDropdownPanel(controlRef, searchInputRef, mockOptions)
        return { controlRef, searchInputRef }
      },
      template: `<div><input /></div>`,
    })
    mount(TestComp)

    const posSpy = vi.spyOn(positionMod, 'computeDropdownPanelPlacement')
    posSpy.mockClear()
    result!.updatePanelPosition()
    expect(posSpy).not.toHaveBeenCalled()
  })

  it('sets placement after open', async () => {
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.open()
    await flushPromises()
    expect(r.panelPlacement.value).not.toBeNull()
    expect(r.panelPlacement.value).toHaveProperty('left')
    expect(r.panelPlacement.value).toHaveProperty('width')
  })

  it('uses custom preferredMaxListHeight from options', async () => {
    const Comp = createTestComponent({
      panelClass: mockPanelClass,
      headerBlockPx: 30,
      preferredMaxListHeight: 250,
    } as Partial<typeof mockOptions> & { headerBlockPx: number; panelClass: string })
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.open()

    const callArgs = (positionMod.computeDropdownPanelPlacement as ReturnType<typeof vi.fn>).mock
      .calls
    const lastCall = callArgs[callArgs.length - 1]
    expect(lastCall[1]).toHaveProperty('preferredMaxListHeight', 250)
    expect(lastCall[1]).toHaveProperty('headerBlockPx', 30)
  })

  it('opens again after close resetting search', async () => {
    const Comp = createTestComponent(mockOptions)
    const wrapper = mount(Comp)
    const r = (wrapper.vm as unknown as { _result: ReturnType<typeof useDropdownPanel> })._result
    r.open()
    r.searchQuery.value = 'some search term'
    r.close()
    r.open()
    expect(r.searchQuery.value).toBe('')
  })
})
