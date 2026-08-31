import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import AppTooltip from '@/components/ui/AppTooltip.vue'
import AppLogo from './AppLogo.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      auth: { cardSubtitle: 'Architecture repository' },
    },
  },
})

describe('AppLogo', () => {
  it('hides the wordmark and keeps a tooltip when showTitle is false', () => {
    const wrapper = mount(AppLogo, {
      props: { size: 'sm', showTitle: false },
      global: { plugins: [i18n], components: { AppTooltip } },
    })

    expect(wrapper.find('.logo__title').exists()).toBe(false)
    expect(wrapper.find('.logo__text').exists()).toBe(false)
    expect(wrapper.find('.logo').classes()).toContain('logo--icon-only')
    expect(wrapper.findComponent(AppTooltip).props('text')).toBe('wArchi')
  })
})
