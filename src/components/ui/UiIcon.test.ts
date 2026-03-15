import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import UiIcon from './UiIcon.vue'

describe('UiIcon', () => {
  const mountIcon = (props: { name: string; alt?: string }) =>
    mount(UiIcon, { props, global: { stubs: {} } })

  it('renders img with correct src based on name', () => {
    const wrapper = mountIcon({ name: 'search' })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('/icons/search.svg')
  })

  it('has ui-icon class', () => {
    const wrapper = mountIcon({ name: 'search' })
    expect(wrapper.find('img').classes()).toContain('ui-icon')
  })

  it('defaults alt to empty string when not provided', () => {
    const wrapper = mountIcon({ name: 'search' })
    expect(wrapper.find('img').attributes('alt')).toBe('')
  })

  it('uses alt prop when provided', () => {
    const wrapper = mountIcon({ name: 'search', alt: 'Search icon' })
    expect(wrapper.find('img').attributes('alt')).toBe('Search icon')
  })

  it('updates src when name prop changes', async () => {
    const wrapper = mountIcon({ name: 'search' })
    await wrapper.setProps({ name: 'edit' })
    expect(wrapper.find('img').attributes('src')).toBe('/icons/edit.svg')
  })
})
