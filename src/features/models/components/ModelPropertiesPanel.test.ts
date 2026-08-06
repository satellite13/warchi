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

  it('shows link type properties section when link is selected', () => {
    const wrapper = mount(ModelPropertiesPanel, {
      props: {
        activeNotationId: 'not-1',
        selectedNode: null,
        selectedLink: {
          id: 'link-1',
          sourceId: 'n1',
          targetId: 'n2',
          modelId: 'm1',
          ownerId: 'u1',
          linkTypeId: 'lt-1',
          parsedAttrs: {
            notationRelations: {},
            relationProperties: {},
            typeProperties: { code: 'L1' },
          },
        },
        nodeBindingComponentId: null,
        linkBindingRelationId: null,
        availableComponents: [],
        availableRelations: [],
        nodeScopedValues: {},
        linkScopedValues: {},
        linkTypeCustomProperties: [
          {
            id: 'p1',
            name: 'code',
            type: 'string',
            required: false,
            min: null,
            max: null,
          },
        ],
        linkTypeScopedValues: { code: 'L1' },
      },
      global: {
        stubs: {
          UiIcon: true,
          SearchableSelect: true,
          ToggleSwitch: true,
        },
      },
    })

    expect(wrapper.text()).toContain('models.linkTypeProperties')
    expect(wrapper.find('input').element.value).toBe('L1')
  })

  it('emits setLinkTypePropertyValue when link type field changes', async () => {
    const wrapper = mount(ModelPropertiesPanel, {
      props: {
        activeNotationId: 'not-1',
        selectedNode: null,
        selectedLink: {
          id: 'link-1',
          sourceId: 'n1',
          targetId: 'n2',
          modelId: 'm1',
          ownerId: 'u1',
          linkTypeId: 'lt-1',
          parsedAttrs: {
            notationRelations: {},
            relationProperties: {},
            typeProperties: {},
          },
        },
        nodeBindingComponentId: null,
        linkBindingRelationId: null,
        availableComponents: [],
        availableRelations: [],
        nodeScopedValues: {},
        linkScopedValues: {},
        linkTypeCustomProperties: [
          {
            id: 'p1',
            name: 'code',
            type: 'string',
            required: false,
            min: null,
            max: null,
          },
        ],
        linkTypeScopedValues: {},
      },
      global: {
        stubs: {
          UiIcon: true,
          SearchableSelect: true,
          ToggleSwitch: true,
        },
      },
    })

    await wrapper.find('input').setValue('NEW')

    expect(wrapper.emitted('setLinkTypePropertyValue')).toEqual([['code', 'NEW']])
  })
})
