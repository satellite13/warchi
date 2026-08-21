import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ModelDiagramScopeStatus from './ModelDiagramScopeStatus.vue'

describe('ModelDiagramScopeStatus', () => {
  it('shows local loading without blocking surrounding editor content', () => {
    const wrapper = mount(ModelDiagramScopeStatus, {
      props: {
        loading: true,
        loadingText: 'Loading 2/10',
        retryText: 'Retry',
      },
    })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.text()).toContain('Loading 2/10')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('shows a retryable local error', async () => {
    const wrapper = mount(ModelDiagramScopeStatus, {
      props: {
        loading: false,
        error: 'Scope failed',
        loadingText: 'Loading',
        retryText: 'Retry',
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toContain('Scope failed')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
