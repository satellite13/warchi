import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ModelPropertiesPanel from './ModelPropertiesPanel.vue'

vi.mock('vue-i18n', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

describe('ModelPropertiesPanel auto-created hiding', () => {
  const autoCreatedNode = {
    id: 'auto-node',
    name: 'P123 - product',
    modelId: 'm1',
    ownerId: 'u1',
    nodeTypeId: 'nt-1',
    parentNodeId: null,
    parsedAttrs: {
      treeOrder: 0,
      notationComponents: {},
      componentProperties: {},
      typeProperties: { 'auto-created': true },
      dpc: { kind: 'appProduct', id: '123', autoCreated: true },
    },
  } as never

  /** Нода с type-level схемой, включающей свойство auto-created (как пишет org-tree-sync) */
  function mountWithTypeSchema(wrapperProps: Record<string, unknown>) {
    return mount(ModelPropertiesPanel, {
      props: {
        activeNotationId: 'not-1',
        selectedLink: null,
        nodeBindingComponentId: null,
        linkBindingRelationId: null,
        availableComponents: [],
        availableRelations: [],
        nodeScopedValues: {},
        linkScopedValues: {},
        nodeTypeCustomProperties: [
          { id: 'p1', name: 'Owner', type: 'string', required: false, min: null, max: null },
          {
            id: 'p2',
            name: 'auto-created',
            type: 'boolean',
            required: false,
            min: null,
            max: null,
          },
          { id: 'p3', name: 'autoCreated', type: 'boolean', required: false, min: null, max: null },
        ],
        nodeTypeScopedValues: { 'auto-created': true, autoCreated: true, Owner: 'ACME' },
        ...wrapperProps,
      },
      global: {
        stubs: { UiIcon: true, SearchableSelect: true, ToggleSwitch: true },
      },
    })
  }

  it('hides auto-created/autoCreated from editable node type properties', () => {
    const wrapper = mountWithTypeSchema({ selectedNode: autoCreatedNode })

    // «среди видимых свойств» — имена полей; подсказка nodeLocked не в счёт.
    const fieldNames = wrapper.findAll('.mp-field__name').map(node => node.text())
    expect(fieldNames).not.toContain('auto-created')
    expect(fieldNames).not.toContain('autoCreated')
    // Соседние пользовательские свойства остаются видимыми.
    expect(fieldNames).toContain('Owner')
  })

  function sectionInput(wrapper: VueWrapper, titleKey: string) {
    const section = wrapper
      .findAll('.mp-section')
      .find(item => item.find('.mp-section__title').text() === titleKey)
    return section?.find('input') ?? null
  }

  const notationProps = {
    nodeBindingComponentId: 'cmp-1',
    availableComponents: [
      {
        id: 'cmp-1',
        name: 'Application Component',
        notationId: 'not-1',
        nodeTypeId: 'nt-1',
        version: '1.0.0',
        ownerId: 'u1',
      },
    ],
    nodeCustomProperties: [
      { id: 'np1', name: 'Alias', type: 'string', required: false, min: null, max: null },
    ],
    nodeScopedValues: { Alias: 'shown' },
  }

  it('locks type properties of auto-created nodes but keeps notation properties editable', async () => {
    const wrapper = mountWithTypeSchema({
      selectedNode: autoCreatedNode,
      ...notationProps,
    })

    const typeInput = sectionInput(wrapper, 'models.nodeTypeProperties')
    const notationInput = sectionInput(wrapper, 'models.notationComponentProperties')
    expect(typeInput?.exists()).toBe(true)
    expect(notationInput?.exists()).toBe(true)
    expect(typeInput!.attributes('readonly')).toBeDefined()
    expect(notationInput!.attributes('readonly')).toBeUndefined()

    await typeInput!.setValue('NOPE')
    await notationInput!.setValue('diagram-alias')
    expect(wrapper.emitted('setNodeTypePropertyValue')).toBeUndefined()
    expect(wrapper.emitted('setNodeScopedValue')).toEqual([['Alias', 'diagram-alias']])
  })

  it('locks type properties when the AutoCreate flag lives only in typeProperties', async () => {
    const wrapper = mountWithTypeSchema({
      selectedNode: {
        ...autoCreatedNode,
        parsedAttrs: {
          treeOrder: 0,
          notationComponents: {},
          componentProperties: {},
          typeProperties: { autoCreated: true, Owner: 'ACME' },
        },
      },
      ...notationProps,
    })

    expect(sectionInput(wrapper, 'models.nodeTypeProperties')?.attributes('readonly')).toBeDefined()
    expect(
      sectionInput(wrapper, 'models.notationComponentProperties')?.attributes('readonly')
    ).toBeUndefined()
  })

  it('locks both type and notation properties in view-only mode (viewer/reader)', async () => {
    const wrapper = mountWithTypeSchema({
      selectedNode: autoCreatedNode,
      readOnly: true,
      ...notationProps,
    })

    expect(sectionInput(wrapper, 'models.nodeTypeProperties')?.attributes('readonly')).toBeDefined()
    expect(
      sectionInput(wrapper, 'models.notationComponentProperties')?.attributes('readonly')
    ).toBeDefined()

    await sectionInput(wrapper, 'models.notationComponentProperties')!.setValue('nope')
    expect(wrapper.emitted('setNodeScopedValue')).toBeUndefined()
  })

  it('lets palette-created (manual) nodes edit type and notation properties', async () => {
    const wrapper = mountWithTypeSchema({
      selectedNode: {
        id: 'manual-node',
        name: 'Service A',
        modelId: 'm1',
        ownerId: 'u1',
        nodeTypeId: 'nt-1',
        parentNodeId: null,
        parsedAttrs: {
          treeOrder: 0,
          notationComponents: {},
          componentProperties: {},
          typeProperties: { Owner: 'ACME' },
        },
      } as never,
      ...notationProps,
    })

    const typeInput = sectionInput(wrapper, 'models.nodeTypeProperties')
    const notationInput = sectionInput(wrapper, 'models.notationComponentProperties')
    expect(typeInput?.attributes('readonly')).toBeUndefined()
    expect(notationInput?.attributes('readonly')).toBeUndefined()

    await typeInput!.setValue('NEW')
    await notationInput!.setValue('alias-2')
    expect(wrapper.emitted('setNodeTypePropertyValue')).toEqual([['Owner', 'NEW']])
    expect(wrapper.emitted('setNodeScopedValue')).toEqual([['Alias', 'alias-2']])
  })

  it('hides auto-created property even on manual nodes (system property, never user-editable)', () => {
    const manualNode = {
      id: 'manual-node',
      name: 'Service A',
      modelId: 'm1',
      ownerId: 'u1',
      nodeTypeId: 'nt-1',
      parentNodeId: null,
      parsedAttrs: {
        treeOrder: 0,
        notationComponents: {},
        componentProperties: {},
        typeProperties: { 'auto-created': false },
      },
    } as never
    const wrapper = mountWithTypeSchema({ selectedNode: manualNode })

    const fieldNames = wrapper.findAll('.mp-field__name').map(node => node.text())
    expect(fieldNames).not.toContain('auto-created')
    expect(fieldNames).not.toContain('autoCreated')
    expect(fieldNames).toContain('Owner')
  })
})
