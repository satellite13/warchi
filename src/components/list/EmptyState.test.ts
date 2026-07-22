import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('renders catalog variant with title and description', () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: 'No models',
        description: 'Create one',
        icon: 'models',
        variant: 'catalog',
      },
      global: {
        stubs: { UiIcon: true },
      },
    })
    expect(wrapper.text()).toContain('No models')
    expect(wrapper.text()).toContain('Create one')
    expect(wrapper.find('.empty-state--catalog').exists()).toBe(true)
  })

  it('renders panel variant with UiIcon name', () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: 'Pick type',
        description: 'or create',
        icon: 'edit_note',
        variant: 'panel',
      },
      global: {
        stubs: {
          UiIcon: { template: '<i class="ui-icon" :data-name="name" />', props: ['name'] },
        },
      },
    })
    expect(wrapper.find('.empty-state--panel').exists()).toBe(true)
    expect(wrapper.find('.ui-icon').attributes('data-name')).toBe('edit_note')
  })
})
