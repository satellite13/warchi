import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import EntityCatalog from './EntityCatalog.vue'
import ListHeader from '../list/ListHeader.vue'
import type { EntityListConfig } from '../../composables/useEntityList'

vi.mock('vue-i18n', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key, locale: ref('ru') }),
  }
})

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../../composables/useAuth', () => ({
  useAuth: () => ({ currentUser: ref(null) }),
}))

vi.mock('../../composables/useEntityList', () => ({
  useEntityList: () => ({
    ownerEmails: ref(new Map()),
    isLoading: ref(false),
    errorMessage: ref(null),
    searchQuery: ref(''),
    filteredItems: ref([]),
    itemCount: ref(0),
    showCreateModal: ref(false),
    newItemName: ref(''),
    newItemVersion: ref(''),
    sourceVersionId: ref(null),
    sourceVersions: ref([]),
    isCreating: ref(false),
    createError: ref(null),
    showDeleteModal: ref(false),
    itemToDelete: ref(null),
    isDeleting: ref(false),
    deleteError: ref(null),
    showRenameModal: ref(false),
    renameName: ref(''),
    renameError: ref(null),
    isRenaming: ref(false),
    openCreateModal: vi.fn(),
    openCreateModalFromVersion: vi.fn(),
    closeCreateModal: vi.fn(),
    openDeleteModal: vi.fn(),
    closeDeleteModal: vi.fn(),
    openRenameModal: vi.fn(),
    closeRenameModal: vi.fn(),
    renameItem: vi.fn(),
    getSelectedItem: vi.fn(),
    handleVersionChange: vi.fn(),
    createItem: vi.fn(),
    deleteItem: vi.fn(),
    showIconModal: ref(false),
    iconPickerValue: ref(''),
    isUpdatingIcon: ref(false),
    iconUpdateError: ref(null),
    openIconModal: vi.fn(),
    closeIconModal: vi.fn(),
    submitIconChange: vi.fn(),
  }),
}))

function mountCatalog(props: Record<string, unknown> = {}) {
  return mount(EntityCatalog, {
    props: {
      entityListConfig: {} as EntityListConfig<never>,
      editorRouteName: 'model-editor',
      i18nPrefix: 'models',
      icon: 'dashboard',
      resourceType: 'model',
      ...props,
    },
    global: {
      stubs: {
        UiIcon: { template: '<i class="ui-icon" :data-name="name" />', props: ['name'] },
        AppTooltip: { template: '<span><slot /></span>' },
      },
    },
  })
}

describe('EntityCatalog', () => {
  it('shows search and count header by default', () => {
    const wrapper = mountCatalog()

    expect(wrapper.findComponent(ListHeader).exists()).toBe(true)
  })

  it('hides search and count header when showSearch is false', () => {
    const wrapper = mountCatalog({ showSearch: false })

    expect(wrapper.findComponent(ListHeader).exists()).toBe(false)
  })
})
