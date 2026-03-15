import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import EntityCreateModal from './EntityCreateModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const BaseModalStub = {
  template:
    '<div class="base-modal"><div class="base-modal__title">{{ title }}</div><slot /><slot name="footer" /></div>',
  props: ['title'],
  emits: ['close'],
}

const NameVersionFormStub = {
  template: '<div class="name-version-form-stub" />',
  props: [
    'name',
    'version',
    'nameLabel',
    'versionLabel',
    'namePlaceholder',
    'versionPlaceholder',
    'nameId',
    'versionId',
    'disabled',
  ],
  emits: ['update:name', 'update:version'],
}

const defaultProps = {
  title: 'Create Model',
  name: '',
  version: '1.0.0',
  nameLabel: 'Name',
  versionLabel: 'Version',
}

const mountModal = (props = {}) =>
  mount(EntityCreateModal, {
    props: { ...defaultProps, ...props },
    global: {
      stubs: {
        BaseModal: BaseModalStub,
        NameVersionForm: NameVersionFormStub,
      },
    },
  })

describe('EntityCreateModal', () => {
  it('renders title via BaseModal', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.base-modal__title').text()).toBe('Create Model')
  })

  it('shows NameVersionForm with name and version props', () => {
    const wrapper = mountModal({ name: 'Test', version: '2.0.0' })
    const stub = wrapper.findComponent(NameVersionFormStub)
    expect(stub.exists()).toBe(true)
    expect(stub.props('name')).toBe('Test')
    expect(stub.props('version')).toBe('2.0.0')
  })

  it('emits update:name when NameVersionForm emits update:name', async () => {
    const wrapper = mountModal()
    const stub = wrapper.findComponent(NameVersionFormStub)
    await stub.vm.$emit('update:name', 'New Name')
    expect(wrapper.emitted('update:name')).toBeTruthy()
    expect(wrapper.emitted('update:name')![0]).toEqual(['New Name'])
  })

  it('emits update:version when NameVersionForm emits update:version', async () => {
    const wrapper = mountModal()
    const stub = wrapper.findComponent(NameVersionFormStub)
    await stub.vm.$emit('update:version', '3.0.0')
    expect(wrapper.emitted('update:version')).toBeTruthy()
    expect(wrapper.emitted('update:version')![0]).toEqual(['3.0.0'])
  })

  it('shows source version select when sourceVersions provided', () => {
    const wrapper = mountModal({
      sourceVersions: [
        { id: 'v1', version: '1.0.0' },
        { id: 'v2', version: '2.0.0' },
      ],
    })
    const select = wrapper.find('#source-version')
    expect(select.exists()).toBe(true)
    const options = wrapper.findAll('option')
    expect(options.length).toBe(3)
  })

  it('does not show source version select when sourceVersions is empty', () => {
    const wrapper = mountModal()
    expect(wrapper.find('#source-version').exists()).toBe(false)
  })

  it('submit button triggers submit emit', async () => {
    const wrapper = mountModal()
    const form = wrapper.find('form')
    await form.trigger('submit')
    expect(wrapper.emitted('submit')).toBeTruthy()
  })

  it('cancel button triggers close emit', async () => {
    const wrapper = mountModal()
    const cancelBtn = wrapper.find('.btn--secondary')
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('shows error message when error prop set', () => {
    const wrapper = mountModal({ error: 'Something went wrong' })
    expect(wrapper.find('.form-error').exists()).toBe(true)
    expect(wrapper.find('.form-error').text()).toBe('Something went wrong')
  })

  it('does not show error when error is null', () => {
    const wrapper = mountModal({ error: null })
    expect(wrapper.find('.form-error').exists()).toBe(false)
  })

  it('disables submit button when isSubmitting', () => {
    const wrapper = mountModal({ isSubmitting: true })
    const submitBtn = wrapper.find('.btn--primary')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables cancel button when isSubmitting', () => {
    const wrapper = mountModal({ isSubmitting: true })
    const cancelBtn = wrapper.find('.btn--secondary')
    expect((cancelBtn.element as HTMLButtonElement).disabled).toBe(true)
  })
})
