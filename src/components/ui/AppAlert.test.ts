import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppAlert from './AppAlert.vue'

describe('AppAlert', () => {
  it('renders nothing when message is empty', () => {
    const wrapper = mount(AppAlert, {
      props: { type: 'error', message: '' },
    })
    expect(wrapper.find('.app-alert').exists()).toBe(false)
  })

  it('renders error and success variants', () => {
    const error = mount(AppAlert, {
      props: { type: 'error', message: 'Failed' },
    })
    expect(error.find('.app-alert--error').text()).toContain('Failed')

    const success = mount(AppAlert, {
      props: { type: 'success', message: 'Saved' },
    })
    expect(success.find('.app-alert--success').text()).toContain('Saved')
  })

  it('renders info variant for page status', () => {
    const wrapper = mount(AppAlert, {
      props: { type: 'info', message: 'Import finished' },
    })
    expect(wrapper.find('.app-alert--info').text()).toContain('Import finished')
  })
})
