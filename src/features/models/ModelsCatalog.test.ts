import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ModelsCatalog from './ModelsCatalog.vue'

const grantsState = { hasGrant: vi.fn<(key: string) => boolean>() }

vi.mock('vue-i18n', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  }
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/composables/useFeatureGrants', () => ({
  useFeatureGrants: () => grantsState,
}))

vi.mock('./composables/useModelPackage', () => ({
  downloadModelPackage: vi.fn(),
  retryModelPackageImport: vi.fn(),
  uploadModelPackage: vi.fn(),
}))

vi.mock('@/components/catalog/EntityCatalog.vue', () => ({
  default: {
    name: 'EntityCatalog',
    props: ['showSearch', 'canRename', 'canDelete'],
    template: '<div class="catalog-stub" data-test="entity-catalog" />',
  },
}))

function mountCatalog() {
  return mount(ModelsCatalog, {
    global: {
      stubs: {
        UiIcon: { template: '<i class="ui-icon" :data-name="name" />', props: ['name'] },
        ModelPackageConflictModal: { template: '<div />' },
      },
    },
  })
}

describe('ModelsCatalog', () => {
  it('hides catalog search for users without model.create grant', () => {
    grantsState.hasGrant.mockImplementation(key => key !== 'model.create')

    const wrapper = mountCatalog()
    const catalog = wrapper.findComponent({ name: 'EntityCatalog' })

    expect(catalog.props('showSearch')).toBe(false)
  })

  it('keeps catalog search for users with model.create grant', () => {
    grantsState.hasGrant.mockImplementation(key => key === 'model.create')

    const wrapper = mountCatalog()
    const catalog = wrapper.findComponent({ name: 'EntityCatalog' })

    expect(catalog.props('showSearch')).toBe(true)
  })

  it('hides rename and delete for users without model.create grant', () => {
    grantsState.hasGrant.mockImplementation(key => key !== 'model.create')

    const wrapper = mountCatalog()
    const catalog = wrapper.findComponent({ name: 'EntityCatalog' })

    expect(catalog.props('canRename')).toBe(false)
    expect(catalog.props('canDelete')).toBe(false)
  })

  it('keeps rename and delete for users with model.create grant', () => {
    grantsState.hasGrant.mockImplementation(key => key === 'model.create')

    const wrapper = mountCatalog()
    const catalog = wrapper.findComponent({ name: 'EntityCatalog' })

    expect(catalog.props('canRename')).toBe(true)
    expect(catalog.props('canDelete')).toBe(true)
  })
})
