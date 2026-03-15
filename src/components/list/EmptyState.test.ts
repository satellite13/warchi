import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('renders title', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No items' } })
    expect(wrapper.find('.empty-state__title').text()).toBe('No items')
  })

  it('renders description when provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No items', description: 'Try adding something' },
    })
    const desc = wrapper.find('.empty-state__description')
    expect(desc.exists()).toBe(true)
    expect(desc.text()).toBe('Try adding something')
  })

  it('hides description when not provided', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No items' } })
    expect(wrapper.find('.empty-state__description').exists()).toBe(false)
  })

  it('renders default slot as actions', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No items' },
      slots: { default: '<button>Add item</button>' },
    })
    const actions = wrapper.find('.empty-state__actions')
    expect(actions.exists()).toBe(true)
    expect(actions.find('button').text()).toBe('Add item')
  })

  it('hides actions div when no slot provided', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No items' } })
    expect(wrapper.find('.empty-state__actions').exists()).toBe(false)
  })

  it('renders SVG icon for models variant', () => {
    const wrapper = mount(EmptyState, { props: { title: 'Test', icon: 'models' } })
    expect(wrapper.find('svg.empty-state__icon').exists()).toBe(true)
  })

  it('renders SVG icon for search variant', () => {
    const wrapper = mount(EmptyState, { props: { title: 'Test', icon: 'search' } })
    expect(wrapper.find('svg.empty-state__icon').exists()).toBe(true)
  })

  it('renders SVG icon for error variant', () => {
    const wrapper = mount(EmptyState, { props: { title: 'Test', icon: 'error' } })
    expect(wrapper.find('svg.empty-state__icon').exists()).toBe(true)
  })

  it('defaults to models icon when no icon prop', () => {
    const wrapper = mount(EmptyState, { props: { title: 'Test' } })
    expect(wrapper.find('svg.empty-state__icon').exists()).toBe(true)
  })
})
