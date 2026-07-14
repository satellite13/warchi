import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CustomPropertiesPanel from './CustomPropertiesPanel.vue'

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

describe('CustomPropertiesPanel', () => {
  it('renders empty panel when no item is selected', () => {
    const wrapper = mount(CustomPropertiesPanel, {
      props: {
        selectedItem: null,
      },
      global: {
        stubs: {
          UiIcon: true,
          PropertyRow: true,
          CollapseSection: true,
          TypeSelectSection: true,
          RelationRulesSection: true,
          IconPicker: true,
        },
      },
    })

    expect(wrapper.html().length).toBeGreaterThan(0)
  })
})
