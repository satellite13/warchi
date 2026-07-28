import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CollapsibleSection from './CollapsibleSection.vue'

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  }
})

function mountSection(
  props: Record<string, unknown> = {},
  slots: Record<string, string> = {},
) {
  return mount(CollapsibleSection, {
    props: {
      title: 'Section',
      open: true,
      ...props,
    },
    slots: {
      default: '<div class="slot-body">body</div>',
      ...slots,
    },
    global: {
      stubs: {
        UiIcon: { template: '<i class="ui-icon" :data-name="name" />', props: ['name'] },
        Transition: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('CollapsibleSection', () => {
  it('renders title and body when open', () => {
    const wrapper = mountSection({ open: true })
    expect(wrapper.text()).toContain('Section')
    expect(wrapper.find('.slot-body').exists()).toBe(true)
  })

  it('hides body when closed', () => {
    const wrapper = mountSection({ open: false })
    expect(wrapper.find('.slot-body').exists()).toBe(false)
  })

  it('emits toggle from the header control', async () => {
    const wrapper = mountSection({ variant: 'panel' })
    await wrapper.find('.cs__toggle').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('applies variant class and style pill', () => {
    const wrapper = mountSection({ variant: 'style', pill: 'icon', open: true })
    expect(wrapper.find('.cs--style').exists()).toBe(true)
    expect(wrapper.find('.cs__pill').text()).toBe('icon')
  })

  it('renders header slots for aside variant', () => {
    const wrapper = mountSection(
      { variant: 'aside' },
      {
        'header-leading': '<span class="leading">L</span>',
        'header-extra': '<span class="extra">E</span>',
      },
    )
    expect(wrapper.find('.leading').exists()).toBe(true)
    expect(wrapper.find('.extra').exists()).toBe(true)
    expect(wrapper.find('.cs--aside').exists()).toBe(true)
  })
})
