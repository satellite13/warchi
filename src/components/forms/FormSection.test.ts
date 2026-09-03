import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FormSection from './FormSection.vue'

describe('FormSection', () => {
  it('renders title and default slot', () => {
    const wrapper = mount(FormSection, {
      props: { title: 'Main' },
      slots: { default: '<p class="body">content</p>' },
    })
    expect(wrapper.find('.form-section__title').text()).toBe('Main')
    expect(wrapper.find('.body').text()).toBe('content')
    expect(wrapper.find('.form-section__header').exists()).toBe(false)
  })

  it('renders header-actions slot in header row', () => {
    const wrapper = mount(FormSection, {
      props: { title: 'Properties' },
      slots: {
        'header-actions': '<button class="add">+</button>',
        default: '<div class="body" />',
      },
    })
    expect(wrapper.find('.form-section__header').exists()).toBe(true)
    expect(wrapper.find('.add').exists()).toBe(true)
  })
})
