import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DiagramEditorHeaderShell from './DiagramEditorHeaderShell.vue'

function mountShell(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(DiagramEditorHeaderShell, {
    props: {
      backTitle: 'Back',
      ...props,
    },
    slots: {
      title: '<span class="title-slot">Title</span>',
      toolbar: '<div class="toolbar-slot">tb</div>',
      ...slots,
    },
    global: {
      stubs: {
        UiIcon: { template: '<i class="ui-icon" :data-name="name" />', props: ['name'] },
        AppLogo: { template: '<div class="app-logo" />' },
      },
    },
  })
}

describe('DiagramEditorHeaderShell', () => {
  it('renders back, logo, title, version and toolbar', async () => {
    const wrapper = mountShell({ version: '1.2.0' })
    expect(wrapper.find('.deh__version').text()).toBe('1.2.0')
    expect(wrapper.find('.title-slot').text()).toBe('Title')
    expect(wrapper.find('.toolbar-slot').exists()).toBe(true)
    await wrapper.find('.deh__back').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('uses canvas chrome when canvasMode is on', () => {
    const wrapper = mountShell({ canvasMode: true })
    expect(wrapper.find('.deh-canvas').exists()).toBe(true)
    expect(wrapper.find('.deh').exists()).toBe(false)
    expect(wrapper.find('.toolbar-slot').exists()).toBe(true)
  })
})
