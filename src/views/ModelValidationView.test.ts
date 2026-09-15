import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { apiGet } from '@/composables/useApi'
import { fetchValidationReport } from '@/features/models-validation/api'
import ModelValidationView from './ModelValidationView.vue'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

vi.mock('@/features/models-validation/api', () => ({
  fetchValidationReport: vi.fn(),
  fetchAutoMergeLock: vi.fn().mockResolvedValue({ success: true, data: { locked: false } }),
  acquireAutoMergeLock: vi.fn(),
  releaseAutoMergeLock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'model-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

const apiGetMock = vi.mocked(apiGet)
const fetchReportMock = vi.mocked(fetchValidationReport)

function mountView() {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        common: { loading: 'Loading...', saved: 'Saved' },
        toolbar: { backToModels: 'Back' },
        models: {
          validationReportTitle: 'Model validation',
          validationReportEmpty: 'No duplicates found',
          validationReportNodes: 'Instances',
          validationReportLinks: 'Links',
          validationReportCopies: '{count} copies',
          validationReportGroupHint: 'The radio button chooses the copy that will remain.',
          validationReportKeepAria: 'Keep this copy',
          validationReportKeep: 'Will remain',
          validationReportMergeInto: 'Merge into remaining',
          validationReportInFolder: 'in folder {name}',
          validationReportLoadError: 'Failed to load validation report',
        },
      },
    },
  })

  return mount(ModelValidationView, {
    global: {
      plugins: [i18n],
      stubs: {
        MainLayout: {
          template: '<div><slot name="header" /><slot /><slot name="footer" /></div>',
        },
        AppHeader: true,
        AppFooter: true,
        ValidationMergeWizard: {
          props: ['modelId', 'kind', 'keepId', 'dropId'],
          template:
            '<div class="wizard-stub" @click="$emit(\'merged\')" @dblclick="$emit(\'refresh\')">wizard</div>',
        },
      },
    },
  })
}

describe('ModelValidationView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGetMock.mockResolvedValue({
      success: true,
      data: { id: 'model-1', name: 'Landscape', version: '1.0.0', ownerId: 'u1' },
    })
  })

  it('shows empty state when there are no duplicates', async () => {
    fetchReportMock.mockResolvedValue({
      success: true,
      data: {
        modelId: 'model-1',
        generatedAt: '2026-08-22T12:00:00.000Z',
        duplicateNodes: [],
        duplicateLinks: [],
      },
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No duplicates found')
    expect(wrapper.text()).toContain('Landscape 1.0.0')
  })

  it('renders stub section counts for duplicate groups', async () => {
    fetchReportMock.mockResolvedValue({
      success: true,
      data: {
        modelId: 'model-1',
        generatedAt: '2026-08-22T12:00:00.000Z',
        duplicateNodes: [
          {
            nodeTypeId: 'nt1',
            nodeTypeName: 'Application',
            name: 'CRM',
            count: 2,
            nodes: [],
          },
        ],
        duplicateLinks: [
          {
            sourceId: 'n1',
            sourceName: 'CRM',
            targetId: 'n2',
            targetName: 'ERP',
            linkTypeId: 'lt1',
            linkTypeName: 'Serving',
            count: 3,
            links: [],
          },
        ],
      },
    })

    const wrapper = mountView()
    await flushPromises()

    const tabs = wrapper.findAll('.model-validation__tab')
    expect(tabs).toHaveLength(4)
    expect(tabs[0].text()).toContain('Instances')
    expect(tabs[0].text()).toContain('1')
    expect(tabs[1].text()).toContain('Links')
    expect(tabs[1].text()).toContain('1')

    // Group content opens on the active tab.
    expect(wrapper.text()).toContain('Application · CRM')
    expect(wrapper.text()).toContain('2 copies')
    expect(wrapper.text()).not.toContain('CRM → ERP · Serving')

    await tabs[1].trigger('click')

    expect(wrapper.text()).toContain('CRM → ERP · Serving')
    expect(wrapper.text()).toContain('3 copies')
  })

  it('opens the merge wizard and reloads the report after merge', async () => {
    fetchReportMock.mockResolvedValue({
      success: true,
      data: {
        modelId: 'model-1',
        generatedAt: '2026-08-22T12:00:00.000Z',
        duplicateNodes: [
          {
            nodeTypeId: 'nt1',
            nodeTypeName: 'Application',
            name: 'CRM',
            count: 2,
            nodes: [
              { id: 'n1', name: 'CRM', parentId: null, parentName: null },
              { id: 'n2', name: 'CRM', parentId: null, parentName: null },
            ],
          },
        ],
        duplicateLinks: [],
      },
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.validation-duplicate-group__merge').trigger('click')

    expect(wrapper.find('.wizard-stub').exists()).toBe(true)

    await wrapper.get('.wizard-stub').trigger('click')
    await flushPromises()

    expect(fetchReportMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Saved')
    expect(wrapper.find('.wizard-stub').exists()).toBe(false)
  })

  it('shows load error with server message', async () => {
    fetchReportMock.mockResolvedValue({
      success: false,
      error: { status: 500, message: 'boom' },
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to load validation report: boom')
  })
})
