import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import LinkReuseModal from './LinkReuseModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const modalStub = {
  template: '<section class="base-modal"><slot /></section>',
  emits: ['close'],
}

const options = [
  {
    id: 'link-1',
    linkTypeName: 'Influences',
    customProperties: [{ name: 'weight', value: 'high' }],
  },
  {
    id: 'link-2',
    linkTypeName: 'Depends on',
    customProperties: [],
  },
]

function mountModal() {
  return mount(LinkReuseModal, {
    props: { options },
    global: {
      stubs: { BaseModal: modalStub },
    },
  })
}

describe('LinkReuseModal', () => {
  it('renders every reusable link with its type and properties', () => {
    const wrapper = mountModal()

    expect(wrapper.text()).toContain('Influences')
    expect(wrapper.text()).toContain('weight: high')
    expect(wrapper.text()).toContain('Depends on')
    expect(wrapper.text()).toContain('models.reuseLinkNoCustomProperties')
  })

  it('emits the selected existing link', async () => {
    const wrapper = mountModal()

    await wrapper.find('[data-link-id="link-1"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['link-1']])
  })

  it('emits creation of a new link', async () => {
    const wrapper = mountModal()

    await wrapper.find('.link-reuse-modal__create-new').trigger('click')

    expect(wrapper.emitted('create-new')).toHaveLength(1)
  })

  it('emits close when the modal is dismissed', () => {
    const wrapper = mountModal()

    wrapper.findComponent(modalStub).vm.$emit('close')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
