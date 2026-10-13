import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import IconToolbar from './IconToolbar.vue'

describe('IconToolbar dropdown caret', () => {
  const mountToolbar = () =>
    mount(IconToolbar, {
      props: {
        buttons: [
          { icon: 'pan_tool', event: 'pan', title: 'Pan' },
          {
            icon: 'more_vert',
            event: 'menu-view',
            title: 'View',
            dropdown: [{ icon: 'fit_screen', label: 'Fit', event: 'fit' }],
          },
          {
            icon: 'ios_share',
            event: 'menu-export',
            title: 'Export',
            dropdown: [{ icon: 'image', label: 'PNG', event: 'png' }],
          },
        ],
      },
      global: {
        stubs: {
          // Стаб с data-icon, чтобы проверять иконки кнопок и кареток.
          UiIcon: { template: '<i :data-icon="name" />', props: ['name'] },
        },
      },
    })

  it('renders no caret triangle on dropdown buttons', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('.icon-toolbar__caret').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('data-icon="arrow_drop_down"')
  })

  it('keeps dropdown buttons functional: click opens menu, item click emits action', async () => {
    const wrapper = mountToolbar()
    const viewBtn = wrapper
      .findAll('button.icon-toolbar__btn--dd')
      .find(b => b.attributes('title') === 'View')
    expect(viewBtn).toBeTruthy()
    await viewBtn!.trigger('click')
    const item = wrapper.findAll('.icon-toolbar__menu-item').find(w => w.text().includes('Fit'))
    expect(item).toBeTruthy()
    await item!.trigger('click')
    expect(wrapper.emitted('action')).toEqual([['fit']])
  })
})
