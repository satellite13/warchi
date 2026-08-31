import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CreateNodeModal from './CreateNodeModal.vue'
import ChoiceListModal from './ChoiceListModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/components/forms/SearchableSelect.vue', () => ({
  default: {
    name: 'SearchableSelect',
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<div class="searchable-select-stub" />',
  },
}))

const BaseModalStub = {
  name: 'BaseModal',
  props: ['title', 'maxWidth'],
  emits: ['close'],
  template: `
    <section class="base-modal">
      <header>{{ title }}</header>
      <slot />
      <footer><slot name="footer" /></footer>
    </section>
  `,
}

describe('ModelEditor extracted modals', () => {
  it('CreateNodeModal emits create when allowed', async () => {
    const wrapper = mount(CreateNodeModal, {
      props: {
        title: 'New node',
        kind: 'folder',
        name: 'Folder',
        nodeTypeId: '',
        nodeTypeOptions: [],
        canCreate: true,
      },
      global: {
        stubs: { BaseModal: BaseModalStub },
      },
    })
    await wrapper.get('button.btn--primary').trigger('click')
    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('ChoiceListModal emits select id', async () => {
    const wrapper = mount(ChoiceListModal, {
      props: {
        title: 'Select',
        options: [
          { id: 'a', name: 'Alpha' },
          { id: 'b', name: 'Beta' },
        ],
      },
      global: {
        stubs: { BaseModal: BaseModalStub },
      },
    })
    const buttons = wrapper.findAll('button.choice-item')
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['b'])
  })
})
