import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SaveToast from './SaveToast.vue'

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  }
})

function mountToast(props: Record<string, unknown> = {}) {
  return mount(SaveToast, {
    props,
    global: {
      stubs: {
        Teleport: { template: '<div><slot /></div>' },
        Transition: { template: '<div><slot /></div>' },
        UiIcon: { template: '<i class="ui-icon" :data-name="name" />', props: ['name'] },
      },
    },
  })
}

describe('SaveToast', () => {
  it('renders nothing when idle', () => {
    const wrapper = mountToast()
    expect(wrapper.find('.save-toast').exists()).toBe(false)
  })

  it('shows progress state with default and custom message', async () => {
    const wrapper = mountToast({ saving: true })
    expect(wrapper.find('.save-toast--progress').exists()).toBe(true)
    expect(wrapper.text()).toContain('common.saving')

    await wrapper.setProps({ progress: 'Step 2/3' })
    expect(wrapper.text()).toContain('Step 2/3')
  })

  it('shows success state', () => {
    const wrapper = mountToast({ success: true })
    expect(wrapper.find('.save-toast--success').exists()).toBe(true)
    expect(wrapper.text()).toContain('common.saved')
  })

  it('shows error state with message', () => {
    const wrapper = mountToast({ error: 'boom' })
    expect(wrapper.find('.save-toast--error').exists()).toBe(true)
    expect(wrapper.text()).toContain('boom')
  })

  it('emits cancel from a cancellable progress toast', async () => {
    const wrapper = mountToast({
      saving: true,
      cancellable: true,
      progress: 'Preparing…',
    })
    const button = wrapper.find('.save-toast__cancel')
    expect(button.exists()).toBe(true)
    await button.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('prefers saving over success and error', () => {
    const wrapper = mountToast({
      saving: true,
      success: true,
      error: 'boom',
      progress: 'Working…',
    })
    expect(wrapper.find('.save-toast--progress').exists()).toBe(true)
    expect(wrapper.find('.save-toast--success').exists()).toBe(false)
    expect(wrapper.find('.save-toast--error').exists()).toBe(false)
  })
})
