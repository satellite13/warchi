import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SidebarListItem from './SidebarListItem.vue'

function mountItem(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(SidebarListItem, {
    props: {
      title: 'Item',
      ...props,
    },
    slots,
    global: {
      stubs: {
        UiIcon: { template: '<i class="ui-icon" :data-name="name" />', props: ['name'] },
        LazyIconImg: {
          template: '<img class="lazy-icon" :data-icon-id="iconId" />',
          props: ['iconId', 'alt', 'imgClass', 'eager'],
        },
      },
    },
  })
}

describe('SidebarListItem', () => {
  it('renders title and optional subtitle', () => {
    const wrapper = mountItem({ title: 'Alpha', subtitle: 'desc' })
    expect(wrapper.find('.sli__title').text()).toBe('Alpha')
    expect(wrapper.find('.sli__subtitle').text()).toBe('desc')
  })

  it('marks active and accent states', () => {
    const wrapper = mountItem({ active: true, tone: 'accent' })
    expect(wrapper.find('.sli--active').exists()).toBe(true)
    expect(wrapper.find('.sli--accent').exists()).toBe(true)
  })

  it('shows lock and new badge', () => {
    const wrapper = mountItem({ locked: true, lockTitle: 'no edit', isNew: true, newLabel: 'new' })
    expect(wrapper.find('.sli__lock').attributes('title')).toBe('no edit')
    expect(wrapper.find('.sli__new').text()).toBe('new')
  })

  it('emits click from keyboard and mouse', async () => {
    const wrapper = mountItem()
    await wrapper.trigger('click')
    await wrapper.trigger('keydown.enter')
    expect(wrapper.emitted('click')).toHaveLength(2)
  })

  it('renders as div when requested', () => {
    const wrapper = mountItem({ as: 'div' })
    expect(wrapper.element.tagName).toBe('DIV')
  })
})
