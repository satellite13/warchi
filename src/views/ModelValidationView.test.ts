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
        common: { loading: 'Loading...' },
        toolbar: { backToModels: 'Back' },
        models: {
          validationReportTitle: 'Model validation',
          validationReportEmpty: 'No duplicates found',
          validationReportNodes: 'Instances',
          validationReportLinks: 'Links',
          validationReportCopies: '{count} copies',
          validationReportKeep: 'Keep this',
          validationReportMergeInto: 'Merge into selected',
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

    expect(wrapper.text()).toContain('Instances 1')
    expect(wrapper.text()).toContain('Links 1')
    expect(wrapper.text()).toContain('Application · CRM')
    expect(wrapper.text()).toContain('2 copies')
    expect(wrapper.text()).toContain('CRM → ERP · Serving')
    expect(wrapper.text()).toContain('3 copies')
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
