import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import SafeMarkdownPreview from './SafeMarkdownPreview.vue'

vi.mock('md-editor-v3', () => ({
  MdPreview: defineComponent({
    props: {
      modelValue: { type: String, required: true },
      sanitize: { type: Function, required: true },
      language: { type: String, required: false, default: undefined },
    },
    setup(props) {
      return () =>
        h('div', {
          class: 'md-preview-stub',
          innerHTML: props.sanitize(props.modelValue),
        })
    },
  }),
}))

describe('SafeMarkdownPreview', () => {
  it('sanitizes markdown preview html through the shared sanitizer', () => {
    const wrapper = mount(SafeMarkdownPreview, {
      props: {
        modelValue: '<img src="x" onerror="alert(1)"><a href="https://example.com" target="_blank">ok</a>',
        language: 'ru-RU',
      },
    })

    expect(wrapper.html()).not.toContain('onerror')
    expect(wrapper.html()).toContain('rel="noopener noreferrer"')
  })
})
