import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ModelDiagramCanvasHud from './ModelDiagramCanvasHud.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      diagram: {
        openOrCreateDiagram: 'Open or create a diagram',
        selectDiagramInTree: 'Select a diagram in the tree',
        showNotationPalette: 'Show palette',
        hidePalette: 'Hide palette',
        palette: 'Palette',
        noNotationComponents: 'No components',
        note: 'Note',
        container: 'Container',
      },
    },
  },
})

describe('ModelDiagramCanvasHud', () => {
  it('renders placeholder when there is no active diagram', () => {
    const wrapper = mount(ModelDiagramCanvasHud, {
      props: {
        hasActiveDiagram: false,
        readOnly: false,
        navigationOnlyMode: false,
        paletteVisible: true,
        activeNotationId: null,
        components: [],
        remotePointerStyle: null,
      },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('Open or create a diagram')
    expect(wrapper.find('.canvas-palette').exists()).toBe(false)
  })

  it('renders palette when diagram is active and not read-only', async () => {
    const wrapper = mount(ModelDiagramCanvasHud, {
      props: {
        hasActiveDiagram: true,
        readOnly: false,
        navigationOnlyMode: false,
        paletteVisible: true,
        activeNotationId: 'not-1',
        components: [],
        remotePointerStyle: null,
      },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.canvas-palette').exists()).toBe(true)
    await wrapper.find('.canvas-palette__hide').trigger('click')
    expect(wrapper.emitted('paletteVisibleChange')?.[0]).toEqual([false])
  })
})
