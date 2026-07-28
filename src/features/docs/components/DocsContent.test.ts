import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import DocsContent from './DocsContent.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('DocsContent', () => {
  it('uses the shared markdown sanitizer for rendered docs html', () => {
    const wrapper = mount(DocsContent, {
      props: {
        isLoading: false,
        content: `
<a href="https://example.com" target="_blank">external</a>
<img src="x" onerror="alert(1)">
        `,
      },
    })

    expect(wrapper.html()).toContain('rel="noopener noreferrer"')
    expect(wrapper.html()).not.toContain('onerror')
  })
})
