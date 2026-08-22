import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import RemoteCascadeConflictNotice from './RemoteCascadeConflictNotice.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      models: {
        remoteCascadeConflictTitle: 'Remote node deletion conflicts with {count} local link(s).',
        remoteCascadeConflictHelp:
          'Discard those links or reload the model, then retry saving.',
        remoteCascadeDiscard: 'Discard affected links',
        remoteCascadeReload: 'Reload model',
      },
    },
  },
})

describe('RemoteCascadeConflictNotice', () => {
  it('shows an accessible conflict with discard and reload actions', async () => {
    const wrapper = mount(RemoteCascadeConflictNotice, {
      props: { count: 2 },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Remote node deletion conflicts with 2 local link(s).'
    )
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('discard')).toHaveLength(1)
    expect(wrapper.emitted('reload')).toHaveLength(1)
  })
})
