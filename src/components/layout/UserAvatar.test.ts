import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import UserAvatar from './UserAvatar.vue'

describe('UserAvatar', () => {
  it('renders initials from label', () => {
    const wrapper = mount(UserAvatar, { props: { label: 'John Doe' } })
    expect(wrapper.text()).toBe('JD')
  })

  it('defaults to md size class', () => {
    const wrapper = mount(UserAvatar, { props: { label: 'Test' } })
    expect(wrapper.find('span').classes()).toContain('avatar--md')
  })

  it('applies sm size class', () => {
    const wrapper = mount(UserAvatar, { props: { label: 'Test', size: 'sm' } })
    expect(wrapper.find('span').classes()).toContain('avatar--sm')
  })

  it('applies lg size class', () => {
    const wrapper = mount(UserAvatar, { props: { label: 'Test', size: 'lg' } })
    expect(wrapper.find('span').classes()).toContain('avatar--lg')
  })

  it('shows title attribute with label', () => {
    const wrapper = mount(UserAvatar, { props: { label: 'Jane Smith' } })
    expect(wrapper.find('span').attributes('title')).toBe('Jane Smith')
  })

  it('shows "?" for undefined label', () => {
    const wrapper = mount(UserAvatar, { props: {} })
    expect(wrapper.text()).toBe('?')
  })

  it('shows "?" for empty string label', () => {
    const wrapper = mount(UserAvatar, { props: { label: '' } })
    expect(wrapper.text()).toBe('?')
  })

  it('has avatar base class', () => {
    const wrapper = mount(UserAvatar, { props: { label: 'A B' } })
    expect(wrapper.find('span').classes()).toContain('avatar')
  })
})
