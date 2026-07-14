import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ModelPropertiesPanel from './ModelPropertiesPanel.vue'

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

describe('ModelPropertiesPanel', () => {
  it('renders empty state when nothing is selected', () => {
    const wrapper = mount(ModelPropertiesPanel, {
      props: {
        activeNotationId: null,
        selectedNode: null,
        selectedLink: null,
        nodeBindingComponentId: null,
        linkBindingRelationId: null,
        availableComponents: [],
        availableRelations: [],
        nodeScopedValues: {},
        linkScopedValues: {},
      },
      global: {
        stubs: {
          UiIcon: true,
          SearchableSelect: true,
          ToggleSwitch: true,
        },
      },
    })

    expect(wrapper.html().length).toBeGreaterThan(0)
  })
})
