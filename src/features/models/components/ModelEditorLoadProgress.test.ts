import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import ModelEditorLoadProgress from './ModelEditorLoadProgress.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      models: {
        modelLoadNodes: 'Loading elements… {loaded}/{total}',
        modelLoadLinks: 'Loading links… {loaded}/{total}',
      },
    },
  },
})

describe('ModelEditorLoadProgress', () => {
  it('renders accessible real progress and switches to a non-blocking banner', async () => {
    const wrapper = mount(ModelEditorLoadProgress, {
      props: {
        progress: {
          generation: 1,
          modelId: 'model-1',
          phase: 'nodes',
          percent: 35,
          loaded: 50,
          total: 100,
          blocking: true,
        },
      },
      global: { plugins: [i18n] },
    })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('35')
    expect(wrapper.text()).toContain('Loading elements… 50/100')
    expect(wrapper.classes()).toContain('model-load-progress--blocking')

    await wrapper.setProps({
      progress: {
        generation: 1,
        modelId: 'model-1',
        phase: 'links',
        percent: 92,
        loaded: 75,
        total: 100,
        blocking: false,
      },
    })

    expect(wrapper.text()).toContain('Loading links… 75/100')
    expect(wrapper.classes()).toContain('model-load-progress--background')
  })
})
