import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ToggleSwitch from './ToggleSwitch.vue'

describe('ToggleSwitch', () => {
  it('checkbox checked matches modelValue true', () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: true } })
    const input = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
    expect(input.element.checked).toBe(true)
  })

  it('checkbox checked matches modelValue false', () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false } })
    const input = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
    expect(input.element.checked).toBe(false)
  })

  it('emits update:modelValue on change', async () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false } })
    const input = wrapper.find('input[type="checkbox"]')
    await input.setValue(true)
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([true])
  })

  it('applies disabled state to input', () => {
    const wrapper = mount(ToggleSwitch, {
      props: { modelValue: false, disabled: true },
    })
    const input = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
    expect(input.element.disabled).toBe(true)
  })

  it('adds toggle-switch--disabled class when disabled', () => {
    const wrapper = mount(ToggleSwitch, {
      props: { modelValue: false, disabled: true },
    })
    expect(wrapper.find('label').classes()).toContain('toggle-switch--disabled')
  })

  it('does not have toggle-switch--disabled class when enabled', () => {
    const wrapper = mount(ToggleSwitch, {
      props: { modelValue: false, disabled: false },
    })
    expect(wrapper.find('label').classes()).not.toContain('toggle-switch--disabled')
  })

  it('track has --on class when modelValue is true', () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: true } })
    expect(wrapper.find('.toggle-switch__track').classes()).toContain('toggle-switch__track--on')
  })

  it('track does not have --on class when modelValue is false', () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false } })
    expect(wrapper.find('.toggle-switch__track').classes()).not.toContain(
      'toggle-switch__track--on',
    )
  })

  it('renders label slot when provided', () => {
    const wrapper = mount(ToggleSwitch, {
      props: { modelValue: false },
      slots: { default: 'Enable feature' },
    })
    expect(wrapper.find('.toggle-switch__label').exists()).toBe(true)
    expect(wrapper.find('.toggle-switch__label').text()).toBe('Enable feature')
  })

  it('does not render label span when no slot provided', () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false } })
    expect(wrapper.find('.toggle-switch__label').exists()).toBe(false)
  })
})
