import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import UserAvatar from './UserAvatar.vue'
import AppTooltip from '../ui/AppTooltip.vue'

const mountAvatar = (props: { label?: string; size?: 'sm' | 'md' | 'lg' } = {}) =>
  mount(UserAvatar, {
    props,
    global: { components: { AppTooltip } },
  })

describe('UserAvatar', () => {
  it('renders initials from label', () => {
    const wrapper = mountAvatar({ label: 'John Doe' })
    expect(wrapper.find('.avatar').text()).toBe('JD')
  })

  it('defaults to md size class', () => {
    const wrapper = mountAvatar({ label: 'Test' })
    expect(wrapper.find('.avatar').classes()).toContain('avatar--md')
  })

  it('applies sm size class', () => {
    const wrapper = mountAvatar({ label: 'Test', size: 'sm' })
    expect(wrapper.find('.avatar').classes()).toContain('avatar--sm')
  })

  it('applies lg size class', () => {
    const wrapper = mountAvatar({ label: 'Test', size: 'lg' })
    expect(wrapper.find('.avatar').classes()).toContain('avatar--lg')
  })

  it('wraps avatar in AppTooltip with label as text', () => {
    const wrapper = mountAvatar({ label: 'Jane Smith' })
    const tooltip = wrapper.findComponent(AppTooltip)
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.props('text')).toBe('Jane Smith')
    expect(tooltip.props('placement')).toBe('bottom')
  })

  it('passes empty text to AppTooltip for undefined label', () => {
    const wrapper = mountAvatar()
    expect(wrapper.findComponent(AppTooltip).props('text')).toBe('')
  })

  it('shows "?" for undefined label', () => {
    const wrapper = mountAvatar()
    expect(wrapper.find('.avatar').text()).toBe('?')
  })

  it('shows "?" for empty string label', () => {
    const wrapper = mountAvatar({ label: '' })
    expect(wrapper.find('.avatar').text()).toBe('?')
  })

  it('has avatar base class', () => {
    const wrapper = mountAvatar({ label: 'A B' })
    expect(wrapper.find('.avatar').classes()).toContain('avatar')
  })
})
