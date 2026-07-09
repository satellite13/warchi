import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BatchSaveConflictModal from './BatchSaveConflictModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params?.count === undefined ? key : `${key}:${params.count}`,
  }),
}))

const modalStub = {
  template: '<section class="base-modal"><slot /></section>',
}

function mountModal(overrides: Partial<InstanceType<typeof BatchSaveConflictModal>['$props']> = {}) {
  return mount(BatchSaveConflictModal, {
    props: {
      conflictCount: 1,
      rows: [
        {
          key: 'node-1',
          kindLabel: 'Node',
          primary: 'Customer',
          context: 'Type: Actor',
          detail: 'Server: now',
          compareRows: [
            {
              field: 'name',
              fieldLabel: 'Name',
              local: 'Customer',
              server: 'Client',
              differs: true,
            },
          ],
          compareServerLoading: false,
          compareServerError: null,
          compareOnlyTimestampDiff: false,
          compareTimestampOnlySinceDiagramOpen: false,
        },
      ],
      crossLinkWarnings: {
        loading: false,
        error: null,
        items: [],
      },
      ...overrides,
    },
    global: {
      stubs: {
        BaseModal: modalStub,
      },
    },
  })
}

describe('BatchSaveConflictModal', () => {
  it('renders conflict rows and compare fields', () => {
    const wrapper = mountModal()

    expect(wrapper.text()).toContain('models.batchSaveConflictIntro:1')
    expect(wrapper.text()).toContain('Node')
    expect(wrapper.text()).toContain('Customer')
    expect(wrapper.text()).toContain('Type: Actor')
    expect(wrapper.text()).toContain('Name')
    expect(wrapper.text()).toContain('Client')
  })

  it('renders cross-deleted link warning rows', () => {
    const wrapper = mountModal({
      crossLinkWarnings: {
        loading: false,
        error: null,
        items: [{ key: 'link-1', diagramNames: 'Main', edgeSummary: 'A -> B' }],
      },
    })

    expect(wrapper.text()).toContain('models.batchSaveConflictCrossDeletedLinksTitle')
    expect(wrapper.text()).toContain('Main')
    expect(wrapper.text()).toContain('A -> B')
  })

  it('emits modal action events', async () => {
    const wrapper = mountModal()

    await wrapper.find('.bsc__action--reload').trigger('click')
    await wrapper.find('.bsc__action--overwrite').trigger('click')
    await wrapper.find('.bsc__dismiss').trigger('click')

    expect(wrapper.emitted('reload')).toHaveLength(1)
    expect(wrapper.emitted('overwrite')).toHaveLength(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
