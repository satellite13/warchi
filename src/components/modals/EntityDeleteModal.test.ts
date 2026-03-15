import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import EntityDeleteModal from './EntityDeleteModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const BaseModalStub = {
  template:
    '<div class="base-modal"><div class="base-modal__title">{{ title }}</div><slot /><slot name="footer" /></div>',
  props: ['title'],
  emits: ['close'],
}

const defaultProps = {
  title: 'Delete Model',
  entityLabel: 'model',
  entityName: 'My Model',
}

const mountModal = (props = {}) =>
  mount(EntityDeleteModal, {
    props: { ...defaultProps, ...props },
    global: {
      stubs: {
        BaseModal: BaseModalStub,
      },
    },
  })

describe('EntityDeleteModal', () => {
  it('renders entity name in confirmation text', () => {
    const wrapper = mountModal()
    expect(wrapper.find('strong').text()).toBe('My Model')
  })

  it('renders title via BaseModal', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.base-modal__title').text()).toBe('Delete Model')
  })

  it('confirm button emits confirm', async () => {
    const wrapper = mountModal()
    const confirmBtn = wrapper.find('.btn--danger')
    await confirmBtn.trigger('click')
    expect(wrapper.emitted('confirm')).toBeTruthy()
  })

  it('cancel button emits close', async () => {
    const wrapper = mountModal()
    const cancelBtn = wrapper.find('.btn--secondary')
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('shows error when error prop set', () => {
    const wrapper = mountModal({ error: 'Delete failed' })
    expect(wrapper.find('.form-error').exists()).toBe(true)
    expect(wrapper.find('.form-error').text()).toBe('Delete failed')
  })

  it('does not show error when error is null', () => {
    const wrapper = mountModal({ error: null })
    expect(wrapper.find('.form-error').exists()).toBe(false)
  })

  it('disables confirm button when isDeleting', () => {
    const wrapper = mountModal({ isDeleting: true })
    const confirmBtn = wrapper.find('.btn--danger')
    expect((confirmBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables cancel button when isDeleting', () => {
    const wrapper = mountModal({ isDeleting: true })
    const cancelBtn = wrapper.find('.btn--secondary')
    expect((cancelBtn.element as HTMLButtonElement).disabled).toBe(true)
  })
})
