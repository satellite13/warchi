import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ModelVisualCompareView from './ModelVisualCompareView.vue'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'model-1' }, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/api/loadCompareSharedData', () => ({
  loadCompareSharedData: vi.fn(async () => ({
    notations: [],
    components: [],
    relations: [],
    relationRules: [],
  })),
}))

const searchableSelectStub = defineComponent({
  name: 'SearchableSelect',
  props: {
    modelValue: { type: String, default: '' },
    options: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props) {
    return () =>
      h('div', {
        'data-testid': 'diagram-searchable-select',
        'data-options-count': String((props.options as unknown[]).length),
      })
  },
})

const dualStub = defineComponent({
  name: 'DualDiagramCompareView',
  setup(_, { slots }) {
    return () =>
      h('div', { class: 'dual-stub' }, [
        slots['topbar-extra']?.(),
        slots['before-swap']?.(),
        slots['after-swap']?.(),
      ])
  },
})

describe('ModelVisualCompareView diagram select', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders SearchableSelect for diagram with options from diagram names', async () => {
    const { apiGet } = await import('@/composables/useApi')
    const apiGetMock = vi.mocked(apiGet)

    apiGetMock.mockImplementation(async (path: string) => {
      if (path.includes('/related-versions')) {
        return {
          success: true,
          data: {
            content: [
              { id: 'v-old', name: 'M', version: '1.0.0' },
              { id: 'v-new', name: 'M', version: '1.1.0' },
            ],
          },
        }
      }
      if (path.includes('/diagrams')) {
        return {
          success: true,
          data: {
            content: [
              { id: 'd1', name: 'Architecture Overview', version: '1.0.0' },
              { id: 'd2', name: 'Business Process', version: '1.0.0' },
            ],
          },
        }
      }
      return { success: true, data: { content: [] } }
    })

    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: {
          common: { search: 'Search...', nothingFound: 'Nothing found' },
          models: {
            compareVersionLeft: 'Left',
            compareVersionRight: 'Right',
            compareDiagramName: 'Diagram',
            compareSelectVersion: 'Select version',
          },
        },
      },
    })

    const wrapper = mount(ModelVisualCompareView, {
      global: {
        plugins: [i18n],
        stubs: {
          DualDiagramCompareView: dualStub,
          SearchableSelect: searchableSelectStub,
        },
      },
    })

    await flushPromises()
    await nextTick()

    const select = wrapper.find('[data-testid="diagram-searchable-select"]')
    expect(select.exists()).toBe(true)
    expect(Number(select.attributes('data-options-count'))).toBeGreaterThanOrEqual(2)
  })
})
