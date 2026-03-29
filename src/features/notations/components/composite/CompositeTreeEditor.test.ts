import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import CompositeTreeEditor from './CompositeTreeEditor.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('CompositeTreeEditor', () => {
  it('adds child nodes and emits updated tree', async () => {
    const wrapper = mount(CompositeTreeEditor, {
      props: {
        modelValue: {
          id: 'root',
          type: 'container',
          children: [],
        },
      },
    })

    await wrapper.find('button').trigger('click')
    const events = wrapper.emitted('update:modelValue')
    expect(events?.length).toBeGreaterThan(0)
    const nextTree = events?.at(-1)?.[0] as { children?: unknown[] }
    expect((nextTree.children ?? []).length).toBeGreaterThan(0)
  })
})

