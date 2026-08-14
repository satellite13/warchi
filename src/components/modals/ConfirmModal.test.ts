import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ConfirmModal from './ConfirmModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('ConfirmModal', () => {
  it('emits confirm and close', async () => {
    const wrapper = mount(ConfirmModal, {
      props: { title: 'Delete', message: 'Sure?', danger: true },
      global: {
        stubs: {
          BaseModal: {
            template: '<div><slot /><slot name="footer" /></div>',
          },
        },
      },
    })
    expect(wrapper.text()).toContain('Sure?')
    await wrapper.find('.btn--danger').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    await wrapper.find('.btn--secondary').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
