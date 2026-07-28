import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ListDetailEditorLayout from './ListDetailEditorLayout.vue'

vi.mock('vue-i18n', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  }
})

describe('ListDetailEditorLayout', () => {
  it('shows empty state when nothing selected', () => {
    const wrapper = mount(ListDetailEditorLayout, {
      props: {
        hasSelection: false,
        emptyTitle: 'Pick one',
        emptyHint: 'or create',
        emptyIcon: 'edit_note',
      },
      global: {
        stubs: {
          UiIcon: { template: '<i class="ui-icon" :data-name="name" />', props: ['name'] },
        },
      },
    })

    expect(wrapper.text()).toContain('Pick one')
    expect(wrapper.text()).toContain('or create')
    expect(wrapper.find('.ldel__content').exists()).toBe(false)
  })

  it('renders default and aside slots when selected', () => {
    const wrapper = mount(ListDetailEditorLayout, {
      props: { hasSelection: true },
      slots: {
        default: '<div class="center">center</div>',
        aside: '<aside class="aside">aside</aside>',
        sidebar: '<nav class="side">side</nav>',
      },
      global: {
        stubs: {
          UiIcon: { template: '<i />' },
        },
      },
    })

    expect(wrapper.find('.center').exists()).toBe(true)
    expect(wrapper.find('.aside').exists()).toBe(true)
    expect(wrapper.find('.side').exists()).toBe(true)
    expect(wrapper.find('.ldel__empty').exists()).toBe(false)
  })
})
