import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MatrixFiltersShell from './MatrixFiltersShell.vue'
import MatrixFilterGroup from './MatrixFilterGroup.vue'

describe('MatrixFiltersShell', () => {
  it('applies padding and bordered modifiers', () => {
    const wrapper = mount(MatrixFiltersShell, {
      props: { padding: 'sm', bordered: true },
      slots: {
        default: '<div class="group" />',
        toggles: '<div class="toggle" />',
      },
    })
    expect(wrapper.classes()).toContain('matrix-filters-shell--pad-sm')
    expect(wrapper.classes()).toContain('matrix-filters-shell--bordered')
    expect(wrapper.find('.toggle').exists()).toBe(true)
  })
})

describe('MatrixFilterGroup', () => {
  it('renders label and optional actions', () => {
    const wrapper = mount(MatrixFilterGroup, {
      props: { label: 'Rows' },
      slots: {
        actions: '<button class="all">all</button>',
        default: '<select class="control" />',
      },
    })
    expect(wrapper.find('.matrix-filter-group__label').text()).toBe('Rows')
    expect(wrapper.find('.all').exists()).toBe(true)
    expect(wrapper.find('.control').exists()).toBe(true)
  })
})
