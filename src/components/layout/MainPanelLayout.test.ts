import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MainPanelLayout from './MainPanelLayout.vue'

vi.mock('@/components/layout/ResizablePanelLayout.vue', () => ({
  default: {
    name: 'ResizablePanelLayout',
    props: [
      'storageKey',
      'defaultLeftWidth',
      'defaultRightWidth',
      'leftResizerTitle',
      'rightResizerTitle',
      'collapseLeftTitle',
      'expandLeftTitle',
      'collapseRightTitle',
      'expandRightTitle',
    ],
    template: `
      <div class="resizable">
        <div class="left"><slot name="left" /></div>
        <div class="main"><slot /></div>
        <div class="right"><slot name="right" /></div>
      </div>
    `,
  },
}))

describe('MainPanelLayout', () => {
  it('forwards config props and slots to ResizablePanelLayout', () => {
    const wrapper = mount(MainPanelLayout, {
      props: {
        storageKey: 'warchi:test',
        defaultRightWidth: 420,
        leftResizerTitle: 'L',
        rightResizerTitle: 'R',
        collapseLeftTitle: 'hide L',
        expandLeftTitle: 'show L',
        collapseRightTitle: 'hide R',
        expandRightTitle: 'show R',
      },
      slots: {
        left: '<aside class="aside-l" />',
        default: '<main class="canvas" />',
        right: '<aside class="aside-r" />',
      },
    })
    const shell = wrapper.findComponent({ name: 'ResizablePanelLayout' })
    expect(shell.props('storageKey')).toBe('warchi:test')
    expect(shell.props('defaultRightWidth')).toBe(420)
    expect(wrapper.find('.aside-l').exists()).toBe(true)
    expect(wrapper.find('.canvas').exists()).toBe(true)
    expect(wrapper.find('.aside-r').exists()).toBe(true)
  })
})
