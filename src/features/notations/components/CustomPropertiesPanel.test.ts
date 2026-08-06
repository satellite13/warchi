import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CustomPropertiesPanel from './CustomPropertiesPanel.vue'
import type { EditorRelation } from '../types'

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

const makeRelation = (): EditorRelation => ({
  id: 'rel-1',
  name: 'Serving',
  version: '1.0.0',
  notationId: 'notation-1',
  ownerId: 'owner-1',
  linkTypeId: 'lt-1',
  attrs: null,
  parsedAttrs: {
    tags: [],
    customProperties: [],
    diagramStyle: {},
  },
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

  it('shows composite label section for relations', () => {
    const wrapper = mount(CustomPropertiesPanel, {
      props: {
        selectedItem: makeRelation(),
        typeProperties: [],
      },
      global: {
        stubs: {
          UiIcon: true,
          PropertyRow: true,
          CollapseSection: {
            template: '<div class="collapse-section"><slot /></div>',
            props: ['label'],
          },
          TypeSelectSection: true,
          RelationRulesSection: true,
          IconPicker: true,
        },
      },
    })

    expect(wrapper.text()).toContain('diagram.compositeLabel')
    expect(wrapper.find('.properties-panel__label-template-input').exists()).toBe(true)
  })
})
