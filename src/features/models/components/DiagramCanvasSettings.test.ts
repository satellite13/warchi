import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DiagramCanvasSettings from './DiagramCanvasSettings.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('DiagramCanvasSettings', () => {
  it('opens the panel from the header button and emits setting actions', async () => {
    const wrapper = mount(DiagramCanvasSettings, {
      props: {
        buttons: [{ icon: 'grid_on', event: 'toggle-grid', title: 'Сетка', active: true }],
        linkTypes: [{ value: 'bezier', label: 'Кривая', icon: 'line_curve' }],
        defaultEdgeType: 'bezier',
      },
      global: {
        stubs: {
          UiIcon: { template: '<i class="ui-icon" />', props: ['name'] },
        },
      },
    })

    expect(wrapper.find('.diagram-canvas-settings__panel').exists()).toBe(false)
    await wrapper.find('.diagram-canvas-settings__toggle').trigger('click')
    expect(wrapper.find('.diagram-canvas-settings__panel').exists()).toBe(true)

    await wrapper.find('.diagram-canvas-settings__item').trigger('click')
    expect(wrapper.emitted('action')).toEqual([['toggle-grid']])
  })
})
