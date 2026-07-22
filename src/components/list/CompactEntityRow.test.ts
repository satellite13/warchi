import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CompactEntityRow from './CompactEntityRow.vue'

vi.mock('@/utils/gradientColors', () => ({
  getGradient: () => 'linear-gradient(red, blue)',
}))

describe('CompactEntityRow', () => {
  it('renders name, version and meta', () => {
    const wrapper = mount(CompactEntityRow, {
      props: {
        id: 'id-1',
        name: 'Model A',
        version: '1.2.0',
        meta: '2h ago',
      },
    })

    expect(wrapper.text()).toContain('Model A')
    expect(wrapper.text()).toContain('v1.2.0')
    expect(wrapper.text()).toContain('2h ago')
  })

  it('emits click', async () => {
    const wrapper = mount(CompactEntityRow, {
      props: { id: 'id-1', name: 'X' },
    })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
