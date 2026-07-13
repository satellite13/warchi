import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import A5BindingsEditor from './A5BindingsEditor.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('A5BindingsEditor', () => {
  it('adds group and emits update:modelValue', async () => {
    const wrapper = mount(A5BindingsEditor, {
      props: {
        modelValue: [],
        componentProperties: [{ id: '1', name: 'status', type: 'enum', required: false, min: null, max: null }],
        nodeTypeProperties: [],
        targetOptions: [{ id: 'shape1', label: 'shape1' }],
      },
    })

    await wrapper.find('button').trigger('click')
    const events = wrapper.emitted('update:modelValue')
    expect(events?.length).toBeGreaterThan(0)
    const lastPayload = events?.at(-1)?.[0] as Array<{ propertyName: string }>
    expect(lastPayload[0]?.propertyName).toBe('status')
  })
})

