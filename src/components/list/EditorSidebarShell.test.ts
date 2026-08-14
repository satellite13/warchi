import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import EditorSidebarShell from './EditorSidebarShell.vue'

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  }
})

function mountShell(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(EditorSidebarShell, {
    props: {
      title: 'Types',
      searchPlaceholder: 'Search…',
      ...props,
    },
    slots: {
      default: '<div class="slot-list">items</div>',
      ...slots,
    },
    global: {
      stubs: {
        UiIcon: { template: '<i class="ui-icon" :data-name="name" />', props: ['name'] },
      },
    },
  })
}

describe('EditorSidebarShell', () => {
  it('renders title, optional count, and action slot', () => {
    const wrapper = mountShell(
      { count: 3 },
      { actions: '<button class="btn--icon" type="button">+</button>' },
    )

    expect(wrapper.find('.ess__title').text()).toBe('Types')
    expect(wrapper.find('.ess__count').text()).toBe('3')
    expect(wrapper.find('.btn--icon').exists()).toBe(true)
  })

  it('hides count when zero or omitted', () => {
    expect(mountShell({ count: 0 }).find('.ess__count').exists()).toBe(false)
    expect(mountShell().find('.ess__count').exists()).toBe(false)
  })

  it('shows loading instead of default slot', () => {
    const wrapper = mountShell({ isLoading: true })

    expect(wrapper.find('.ess__loading').exists()).toBe(true)
    expect(wrapper.text()).toContain('common.loading')
    expect(wrapper.find('.slot-list').exists()).toBe(false)
  })

  it('supports v-model:searchQuery and clear via SearchInput', async () => {
    const wrapper = mountShell({ searchQuery: 'abc' })

    const input = wrapper.find('.search-input')
    expect((input.element as HTMLInputElement).value).toBe('abc')
    expect(wrapper.find('.search-box--compact').exists()).toBe(true)

    await wrapper.find('.clear-button').trigger('click')
    expect(wrapper.emitted('update:searchQuery')?.at(-1)).toEqual([''])
  })

  it('renders search-extra and applies fill class', () => {
    const wrapper = mountShell({ fill: true }, { 'search-extra': '<select class="sort-extra"></select>' })
    expect(wrapper.find('.ess--fill').exists()).toBe(true)
    expect(wrapper.find('.sort-extra').exists()).toBe(true)
  })

  it('renders footer slot', () => {
    const wrapper = mountShell({}, { footer: '<div class="slot-footer">batch</div>' })
    expect(wrapper.find('.slot-footer').text()).toBe('batch')
  })
})
