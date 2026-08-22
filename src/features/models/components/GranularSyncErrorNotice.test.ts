import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import GranularSyncErrorNotice from './GranularSyncErrorNotice.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      models: {
        granularSyncError: 'Could not refresh link. Local data is marked stale.',
        granularSyncRetry: 'Retry sync',
      },
    },
  },
})

describe('GranularSyncErrorNotice', () => {
  it('exposes the local sync failure and retry action', async () => {
    const wrapper = mount(GranularSyncErrorNotice, {
      props: { entity: 'link', message: 'offline' },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain('offline')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
