import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { loadAllDiagramReferences } from '@/features/models-validation/composables/useAllDiagramReferences'
import ValidationDuplicateGroup from './ValidationDuplicateGroup.vue'

const push = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/features/models-validation/composables/useAllDiagramReferences', () => ({
  loadAllDiagramReferences: vi.fn(),
}))

const loadRefsMock = vi.mocked(loadAllDiagramReferences)

function mountGroup(
  props: InstanceType<typeof ValidationDuplicateGroup>['$props']
) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        common: { loading: 'Loading...' },
        models: {
          validationReportCopies: '{count} copies',
          validationReportKeep: 'Keep this',
          validationReportMergeInto: 'Merge into selected',
        },
      },
    },
  })

  return mount(ValidationDuplicateGroup, {
    props,
    global: { plugins: [i18n] },
  })
}

describe('ValidationDuplicateGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadRefsMock.mockResolvedValue([{ id: 'd1', name: 'Landscape', version: '1', notationId: 'nt', nodeId: 'n1' }])
  })

  it('renders title, copies badge and muted parent, then emits merge', async () => {
    const wrapper = mountGroup({
      modelId: 'm1',
      kind: 'node',
      title: 'Application · CRM',
      count: 2,
      nodeMembers: [
        { id: 'n1', name: 'CRM', parentId: 'p1', parentName: 'Apps' },
        { id: 'n2', name: 'CRM', parentId: null, parentName: null },
      ],
    })

    expect(wrapper.text()).toContain('Application · CRM')
    expect(wrapper.text()).toContain('2 copies')
    expect(wrapper.text()).toContain('Apps')

    await wrapper.get('.validation-duplicate-group__merge').trigger('click')

    expect(wrapper.emitted('merge')?.[0]).toEqual([
      { keepId: 'n1', dropId: 'n2', kind: 'node' },
    ])
  })

  it('navigates to the editor on node name click', async () => {
    const wrapper = mountGroup({
      modelId: 'm1',
      kind: 'node',
      title: 'Application · CRM',
      count: 1,
      nodeMembers: [{ id: 'n1', name: 'CRM', parentId: null, parentName: null }],
    })

    await wrapper.get('.validation-duplicate-group__name').trigger('click')

    expect(push).toHaveBeenCalledWith({
      name: 'model-editor',
      params: { id: 'm1' },
      query: { nodeId: 'n1' },
    })
  })

  it('loads diagram chips on first expand and navigates with diagramId', async () => {
    const wrapper = mountGroup({
      modelId: 'm1',
      kind: 'node',
      title: 'Application · CRM',
      count: 1,
      nodeMembers: [{ id: 'n1', name: 'CRM', parentId: null, parentName: null }],
    })

    const details = wrapper.get('details')
    details.element.open = true
    await details.trigger('toggle')
    await flushPromises()

    expect(loadRefsMock).toHaveBeenCalledTimes(1)
    expect(loadRefsMock).toHaveBeenCalledWith('m1', { nodeId: 'n1' })
    expect(wrapper.text()).toContain('Landscape')

    await wrapper.get('.validation-duplicate-group__chip').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'model-editor',
      params: { id: 'm1' },
      query: { diagramId: 'd1', nodeId: 'n1' },
    })
  })

  it('emits merge and opens a link chip with linkId', async () => {
    loadRefsMock.mockResolvedValue([
      { id: 'd2', name: 'Flows', version: '1', notationId: 'nt', nodeId: null },
    ])

    const wrapper = mountGroup({
      modelId: 'm1',
      kind: 'link',
      title: 'CRM → ERP · Serving',
      count: 2,
      linkMembers: [{ id: 'l1' }, { id: 'l2' }],
    })

    await wrapper.get('.validation-duplicate-group__merge').trigger('click')
    expect(wrapper.emitted('merge')?.[0]).toEqual([
      { keepId: 'l1', dropId: 'l2', kind: 'link' },
    ])

    const details = wrapper.get('details')
    details.element.open = true
    await details.trigger('toggle')
    await flushPromises()

    expect(loadRefsMock).toHaveBeenCalledWith('m1', { linkId: 'l1' })
    await wrapper.get('.validation-duplicate-group__chip').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'model-editor',
      params: { id: 'm1' },
      query: { diagramId: 'd2', linkId: 'l1' },
    })
  })
})
