import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import EntityRenameModal from './EntityRenameModal.vue'

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
  title: 'Rename Model',
  name: 'Old Name',
}

const mountModal = (props = {}) =>
  mount(EntityRenameModal, {
    props: { ...defaultProps, ...props },
    global: {
      stubs: {
        BaseModal: BaseModalStub,
      },
    },
  })

describe('EntityRenameModal', () => {
  it('shows input with current name', () => {
    const wrapper = mountModal()
    const input = wrapper.find<HTMLInputElement>('input[type="text"]')
    expect(input.element.value).toBe('Old Name')
  })

  it('input changes emit update:name', async () => {
    const wrapper = mountModal()
    const input = wrapper.find('input[type="text"]')
    await input.setValue('New Name')
    expect(wrapper.emitted('update:name')).toBeTruthy()
    expect(wrapper.emitted('update:name')![0]).toEqual(['New Name'])
  })

  it('submit emits submit', async () => {
    const wrapper = mountModal()
    const form = wrapper.find('form')
    await form.trigger('submit')
    expect(wrapper.emitted('submit')).toBeTruthy()
  })

  it('cancel emits close', async () => {
    const wrapper = mountModal()
    const cancelBtn = wrapper.find('.btn--secondary')
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('shows error message when error prop set', () => {
    const wrapper = mountModal({ error: 'Name already exists' })
    expect(wrapper.find('.rename-form__error').exists()).toBe(true)
    expect(wrapper.find('.rename-form__error').text()).toBe('Name already exists')
  })

  it('does not show error when error is null', () => {
    const wrapper = mountModal({ error: null })
    expect(wrapper.find('.rename-form__error').exists()).toBe(false)
  })

  it('disables submit when name is empty', () => {
    const wrapper = mountModal({ name: '   ' })
    const submitBtn = wrapper.find('.btn--primary')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables input when isRenaming', () => {
    const wrapper = mountModal({ isRenaming: true })
    const input = wrapper.find<HTMLInputElement>('input[type="text"]')
    expect(input.element.disabled).toBe(true)
  })
})
