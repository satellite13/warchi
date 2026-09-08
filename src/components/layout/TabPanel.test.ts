import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, it, expect, vi } from 'vitest'
import TabPanel from './TabPanel.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: { scrollLeft: 'Scroll left', scrollRight: 'Scroll right' },
    },
  },
})

function mountPanel(
  props: { tabs: typeof tabs; modelValue: string },
  slots?: Record<string, string>
) {
  return mount(TabPanel, {
    props,
    slots,
    global: { plugins: [i18n] },
  })
}

const tabs = [
  { id: 'one', label: 'Tab One' },
  { id: 'two', label: 'Tab Two' },
  { id: 'three', label: 'Tab Three', icon: 'settings' },
]

describe('TabPanel', () => {
  it('renders all tab labels', () => {
    const wrapper = mountPanel({ tabs, modelValue: 'one' })
    const buttons = wrapper.findAll('.tab-panel__tab')
    expect(buttons).toHaveLength(3)
    expect(buttons[0].find('.tab-panel__tab-label').text()).toBe('Tab One')
    expect(buttons[1].find('.tab-panel__tab-label').text()).toBe('Tab Two')
    expect(buttons[2].find('.tab-panel__tab-label').text()).toBe('Tab Three')
  })

  it('active tab has --active class', () => {
    const wrapper = mountPanel({ tabs, modelValue: 'two' })
    const buttons = wrapper.findAll('.tab-panel__tab')
    expect(buttons[0].classes()).not.toContain('tab-panel__tab--active')
    expect(buttons[1].classes()).toContain('tab-panel__tab--active')
    expect(buttons[2].classes()).not.toContain('tab-panel__tab--active')
  })

  it('clicking tab emits update:modelValue with tab id', async () => {
    const wrapper = mountPanel({ tabs, modelValue: 'one' })
    const buttons = wrapper.findAll('.tab-panel__tab')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['two'])
  })

  it('renders icon when tab has icon property', () => {
    const wrapper = mountPanel({ tabs, modelValue: 'one' })
    const buttons = wrapper.findAll('.tab-panel__tab')
    // First two tabs have no icon
    expect(buttons[0].find('.ui-icon').exists()).toBe(false)
    expect(buttons[1].find('.ui-icon').exists()).toBe(false)
    // Third tab has an icon (rendered via global UiIcon stub)
    expect(buttons[2].find('.ui-icon').exists()).toBe(true)
    expect(buttons[2].find('.ui-icon').attributes('data-icon')).toBe('settings')
  })

  it('renders slot content in body', () => {
    const wrapper = mountPanel(
      { tabs, modelValue: 'one' },
      { default: '<div class="panel-content">Content here</div>' }
    )
    const body = wrapper.find('.tab-panel__body')
    expect(body.find('.panel-content').exists()).toBe(true)
    expect(body.text()).toBe('Content here')
  })

  it('hides arrows when tabs fit', () => {
    const wrapper = mountPanel({ tabs, modelValue: 'one' })
    expect(wrapper.find('.tab-panel__arrow--left').exists()).toBe(false)
    expect(wrapper.find('.tab-panel__arrow--right').exists()).toBe(false)
  })

  it('shows right arrow when tabs overflow and scrolls on click', async () => {
    class ResizeObserverStub {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb
        instances.push(this)
      }
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      trigger(): void {
        this.cb([], this as unknown as ResizeObserver)
      }
    }
    const instances: ResizeObserverStub[] = []
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)

    const wrapper = mountPanel({ tabs, modelValue: 'one' })
    const header = wrapper.find('.tab-panel__header').element as HTMLElement
    Object.defineProperty(header, 'scrollWidth', { value: 500, configurable: true })
    Object.defineProperty(header, 'clientWidth', { value: 200, configurable: true })
    const scrollBy = vi.fn()
    header.scrollBy = scrollBy as unknown as typeof header.scrollBy

    instances[0].trigger()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tab-panel__arrow--right').exists()).toBe(true)
    expect(wrapper.find('.tab-panel__arrow--left').exists()).toBe(false)

    await wrapper.find('.tab-panel__arrow--right').trigger('click')
    expect(scrollBy).toHaveBeenCalledWith({ left: 160, behavior: 'smooth' })
    vi.unstubAllGlobals()
  })
})
