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

  it('uses SearchableSelect for notation component binding', async () => {
    const wrapper = mount(ModelPropertiesPanel, {
      props: {
        activeNotationId: 'not-1',
        selectedNode: {
          id: 'node-1',
          name: 'App',
          modelId: 'm1',
          ownerId: 'u1',
          nodeTypeId: 'nt-1',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: {},
          },
        },
        selectedLink: null,
        nodeBindingComponentId: 'cmp-1',
        linkBindingRelationId: null,
        availableComponents: [
          {
            id: 'cmp-1',
            name: 'Application Component',
            notationId: 'not-1',
            nodeTypeId: 'nt-1',
            version: '1.0.0',
            ownerId: 'u1',
          },
          {
            id: 'cmp-2',
            name: 'Application Service',
            notationId: 'not-1',
            nodeTypeId: 'nt-1',
            version: '1.0.0',
            ownerId: 'u1',
          },
        ],
        availableRelations: [],
        nodeScopedValues: {},
        linkScopedValues: {},
      },
      global: {
        stubs: {
          UiIcon: true,
          ToggleSwitch: true,
        },
      },
    })

    const select = wrapper.findComponent({ name: 'SearchableSelect' })
    expect(select.exists()).toBe(true)
    expect(select.props('modelValue')).toBe('cmp-1')
    expect(select.props('options')).toEqual([
      { id: 'cmp-1', label: 'Application Component' },
      { id: 'cmp-2', label: 'Application Service' },
    ])
    expect(wrapper.find('select').exists()).toBe(false)

    await select.vm.$emit('update:modelValue', 'cmp-2')
    expect(wrapper.emitted('bindNodeComponent')).toEqual([['cmp-2']])
  })

  it('uses SearchableSelect for notation relation binding', async () => {
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
        linkBindingRelationId: 'rel-1',
        availableComponents: [],
        availableRelations: [
          {
            id: 'rel-1',
            name: 'Serving',
            notationId: 'not-1',
            linkTypeId: 'lt-1',
            version: '1.0.0',
            ownerId: 'u1',
          },
          {
            id: 'rel-2',
            name: 'Aggregation',
            notationId: 'not-1',
            linkTypeId: 'lt-1',
            version: '1.0.0',
            ownerId: 'u1',
          },
        ],
        nodeScopedValues: {},
        linkScopedValues: {},
      },
      global: {
        stubs: {
          UiIcon: true,
          ToggleSwitch: true,
        },
      },
    })

    const select = wrapper.findComponent({ name: 'SearchableSelect' })
    expect(select.exists()).toBe(true)
    expect(select.props('modelValue')).toBe('rel-1')
    expect(select.props('options')).toEqual([
      { id: 'rel-1', label: 'Serving' },
      { id: 'rel-2', label: 'Aggregation' },
    ])
    expect(wrapper.find('select').exists()).toBe(false)

    await select.vm.$emit('update:modelValue', 'rel-2')
    expect(wrapper.emitted('bindLinkRelation')).toEqual([['rel-2']])
  })

  it('uses SearchableSelect for interactive diagram property', async () => {
    const wrapper = mount(ModelPropertiesPanel, {
      props: {
        activeNotationId: 'not-1',
        selectedNode: {
          id: 'node-1',
          name: 'App',
          modelId: 'm1',
          ownerId: 'u1',
          nodeTypeId: 'nt-1',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: {},
            componentProperties: {},
            typeProperties: { target: 'd1' },
          },
        },
        selectedLink: null,
        nodeBindingComponentId: null,
        linkBindingRelationId: null,
        availableComponents: [],
        availableRelations: [],
        nodeScopedValues: {},
        linkScopedValues: {},
        nodeTypeCustomProperties: [
          {
            id: 'p-diag',
            name: 'target',
            type: 'string',
            required: false,
            min: null,
            max: null,
            interactive: true,
            interactiveKind: 'diagram',
          },
        ],
        nodeTypeScopedValues: { target: 'd1' },
        diagrams: [
          { id: 'd1', label: 'Overview 1.0.0' },
          { id: 'd2', label: 'Landscape 1.0.0' },
        ],
      },
      global: {
        stubs: {
          UiIcon: true,
          ToggleSwitch: true,
        },
      },
    })

    const selects = wrapper.findAllComponents({ name: 'SearchableSelect' })
    const diagramSelect = selects.find(item =>
      (item.props('options') as { id: string }[]).some(option => option.id === 'd1')
    )
    expect(diagramSelect).toBeDefined()
    expect(diagramSelect!.props('modelValue')).toBe('d1')
    expect(diagramSelect!.props('allowEmpty')).toBe(true)
    expect(wrapper.find('select').exists()).toBe(false)

    await diagramSelect!.vm.$emit('update:modelValue', 'd2')
    expect(wrapper.emitted('setNodeTypePropertyValue')).toEqual([['target', 'd2']])
  })
})
