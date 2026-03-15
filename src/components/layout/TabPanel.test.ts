import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import TabPanel from './TabPanel.vue'

const tabs = [
  { id: 'one', label: 'Tab One' },
  { id: 'two', label: 'Tab Two' },
  { id: 'three', label: 'Tab Three', icon: 'settings' },
]

describe('TabPanel', () => {
  it('renders all tab labels', () => {
    const wrapper = mount(TabPanel, {
      props: { tabs, modelValue: 'one' },
    })
    const buttons = wrapper.findAll('.tab-panel__tab')
    expect(buttons).toHaveLength(3)
    expect(buttons[0].find('.tab-panel__tab-label').text()).toBe('Tab One')
    expect(buttons[1].find('.tab-panel__tab-label').text()).toBe('Tab Two')
    expect(buttons[2].find('.tab-panel__tab-label').text()).toBe('Tab Three')
  })

  it('active tab has --active class', () => {
    const wrapper = mount(TabPanel, {
      props: { tabs, modelValue: 'two' },
    })
    const buttons = wrapper.findAll('.tab-panel__tab')
    expect(buttons[0].classes()).not.toContain('tab-panel__tab--active')
    expect(buttons[1].classes()).toContain('tab-panel__tab--active')
    expect(buttons[2].classes()).not.toContain('tab-panel__tab--active')
  })

  it('clicking tab emits update:modelValue with tab id', async () => {
    const wrapper = mount(TabPanel, {
      props: { tabs, modelValue: 'one' },
    })
    const buttons = wrapper.findAll('.tab-panel__tab')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['two'])
  })

  it('renders icon when tab has icon property', () => {
    const wrapper = mount(TabPanel, {
      props: { tabs, modelValue: 'one' },
    })
    const buttons = wrapper.findAll('.tab-panel__tab')
    // First two tabs have no icon
    expect(buttons[0].find('.ui-icon').exists()).toBe(false)
    expect(buttons[1].find('.ui-icon').exists()).toBe(false)
    // Third tab has an icon (rendered via global UiIcon stub)
    expect(buttons[2].find('.ui-icon').exists()).toBe(true)
    expect(buttons[2].find('.ui-icon').attributes('data-icon')).toBe('settings')
  })

  it('renders slot content in body', () => {
    const wrapper = mount(TabPanel, {
      props: { tabs, modelValue: 'one' },
      slots: { default: '<div class="panel-content">Content here</div>' },
    })
    const body = wrapper.find('.tab-panel__body')
    expect(body.find('.panel-content').exists()).toBe(true)
    expect(body.text()).toBe('Content here')
  })
})
