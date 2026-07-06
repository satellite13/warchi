import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    currentUser: ref({ id: 'user-1', email: 'test@test.com' }),
  }),
}))

vi.mock('../utils/resolveOwnerNames', () => ({
  resolveOwnerDisplayNames: vi.fn(async () => new Map()),
  normalizeOwnerId: (id: string | null | undefined) => (id ?? '').trim().toLowerCase(),
}))

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('./useApi', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}))

// We need to mock onMounted so it doesn't auto-call loadItems
vi.mock('vue', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    onMounted: vi.fn(),
  }
})

import { useEntityList, type EntityListConfig } from './useEntityList'
import type { VersionedEntity } from '../types/entities'

function makeConfig(overrides?: Partial<EntityListConfig>): EntityListConfig {
  return {
    endpoint: 'models',
    entityName: 'Модель',
    entityNamePlural: 'модели',
    conflictMessage: 'Конфликт имени и версии',
    notFoundMessage: 'Не найден',
    buildRenameRequest: (item, newName) => ({ ...item, name: newName }),
    ...overrides,
  }
}

function makeItem(id: string, name: string, version: string, ownerId = 'user-1'): VersionedEntity {
  return { id, name, version, ownerId }
}

describe('useEntityList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ success: true, data: { content: [] } })
  })

  describe('loadItems', () => {
    it('fetches from endpoint and populates items', async () => {
      const items = [makeItem('1', 'Alpha', '1.0.0'), makeItem('2', 'Beta', '2.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()

      expect(mockApiGet).toHaveBeenCalledWith('/models?page=0&size=50')
      expect(list.items.value).toHaveLength(2)
      expect(list.isLoading.value).toBe(false)
      expect(list.errorMessage.value).toBeNull()
    })

    it('reads arepos ListResponse items field', async () => {
      const items = [makeItem('1', 'Alpha', '1.0.0')]
      mockApiGet.mockResolvedValue({
        success: true,
        data: { items, total: 1, page: 0, size: 50 },
      })

      const list = useEntityList(makeConfig())
      await list.loadItems()

      expect(list.items.value).toHaveLength(1)
      expect(list.items.value[0]?.name).toBe('Alpha')
    })

    it('sets error on failure', async () => {
      mockApiGet.mockResolvedValue({ success: false, error: { message: 'Server error' } })

      const list = useEntityList(makeConfig())
      await list.loadItems()

      expect(list.errorMessage.value).toBe('Server error')
      expect(list.items.value).toHaveLength(0)
    })

    it('handles non-array content gracefully', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: { content: null } })

      const list = useEntityList(makeConfig())
      await list.loadItems()

      expect(list.items.value).toEqual([])
    })
  })

  describe('filteredItems', () => {
    it('groups items by name and sorts by version descending', async () => {
      const items = [
        makeItem('1', 'Alpha', '1.0.0'),
        makeItem('2', 'Alpha', '2.0.0'),
        makeItem('3', 'Beta', '1.0.0'),
      ]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()
      await nextTick()

      const groups = list.filteredItems.value
      expect(groups).toHaveLength(2)

      const alphaGroup = groups.find((g) => g.name === 'Alpha')
      expect(alphaGroup).toBeDefined()
      expect(alphaGroup!.versions[0].version).toBe('2.0.0')
      expect(alphaGroup!.versions[1].version).toBe('1.0.0')
    })
  })

  describe('searchQuery', () => {
    it('filters groups by search query', async () => {
      const items = [
        makeItem('1', 'Alpha', '1.0.0'),
        makeItem('2', 'Beta', '1.0.0'),
      ]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()
      await nextTick()

      expect(list.filteredItems.value).toHaveLength(2)

      list.searchQuery.value = 'alp'
      await nextTick()

      expect(list.filteredItems.value).toHaveLength(1)
      expect(list.filteredItems.value[0].name).toBe('Alpha')
    })

    it('returns all groups when search is empty', async () => {
      const items = [makeItem('1', 'Alpha', '1.0.0'), makeItem('2', 'Beta', '1.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()
      await nextTick()

      list.searchQuery.value = ''
      await nextTick()

      expect(list.filteredItems.value).toHaveLength(2)
    })
  })

  describe('createItem', () => {
    it('calls apiPost and returns created item', async () => {
      const created = makeItem('new-1', 'Gamma', '1.0.0')
      mockApiPost.mockResolvedValue({ success: true, data: created })

      const list = useEntityList(makeConfig())
      list.newItemName.value = 'Gamma'
      list.newItemVersion.value = '1.0.0'

      const result = await list.createItem('user-1', 'Test User')

      expect(list.createError.value).toBeNull()
      expect(mockApiPost).toHaveBeenCalledWith('/models', {
        name: 'Gamma',
        version: '1.0.0',
        ownerId: 'user-1',
      })
      expect(result).toEqual(created)
    })

    it('returns null and sets error for empty name', async () => {
      const list = useEntityList(makeConfig())
      list.newItemName.value = ''
      list.newItemVersion.value = '1.0.0'

      const result = await list.createItem('user-1')

      expect(result).toBeNull()
      expect(list.createError.value).toBeTruthy()
      expect(mockApiPost).not.toHaveBeenCalled()
    })

    it('returns null and sets error for empty version', async () => {
      const list = useEntityList(makeConfig())
      list.newItemName.value = 'Test'
      list.newItemVersion.value = ''

      const result = await list.createItem('user-1')

      expect(result).toBeNull()
      expect(list.createError.value).toBeTruthy()
    })

    it('returns null when no ownerId provided', async () => {
      const list = useEntityList(makeConfig())
      list.newItemName.value = 'Test'
      list.newItemVersion.value = '1.0.0'

      const result = await list.createItem('')

      expect(result).toBeNull()
      expect(list.createError.value).toBe('Пользователь не авторизован')
    })

    it('uses copy endpoint when sourceVersionId is set', async () => {
      const created = makeItem('new-2', 'Gamma', '1.1.0')
      mockApiPost.mockResolvedValue({ success: true, data: created })

      const list = useEntityList(makeConfig())
      list.newItemName.value = 'Gamma'
      list.newItemVersion.value = '1.1.0'
      list.sourceVersionId.value = 'source-1'

      await list.createItem('user-1')

      expect(mockApiPost).toHaveBeenCalledWith(
        '/models/source-1/copy',
        expect.objectContaining({ name: 'Gamma', version: '1.1.0' })
      )
    })
  })

  describe('deleteItem', () => {
    it('calls apiDelete and removes item from list', async () => {
      mockApiDelete.mockResolvedValue({ success: true })
      const items = [makeItem('1', 'Alpha', '1.0.0'), makeItem('2', 'Beta', '1.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()

      list.openDeleteModal(list.items.value[0])
      const result = await list.deleteItem()

      expect(result).toBe(true)
      expect(mockApiDelete).toHaveBeenCalledWith('/models/1')
      expect(list.items.value).toHaveLength(1)
      expect(list.items.value[0].id).toBe('2')
    })

    it('returns false when no item to delete', async () => {
      const list = useEntityList(makeConfig())
      const result = await list.deleteItem()
      expect(result).toBe(false)
    })

    it('sets error on delete failure', async () => {
      mockApiDelete.mockResolvedValue({
        success: false,
        error: { status: 500, message: 'Internal error' },
      })
      const items = [makeItem('1', 'Alpha', '1.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()

      list.openDeleteModal(list.items.value[0])
      const result = await list.deleteItem()

      expect(result).toBe(false)
      expect(list.deleteError.value).toBe('Internal error')
    })
  })

  describe('renameItem', () => {
    it('calls apiPut and updates items', async () => {
      const renamed = makeItem('1', 'NewName', '1.0.0')
      mockApiPut.mockResolvedValue({ success: true, data: renamed })
      const items = [makeItem('1', 'OldName', '1.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()

      list.openRenameModal(list.items.value[0])
      list.renameName.value = 'NewName'
      await list.renameItem()

      expect(mockApiPut).toHaveBeenCalledWith('/models/1', expect.objectContaining({ name: 'NewName' }))
      expect(list.items.value[0].name).toBe('NewName')
    })
  })

  describe('openCreateModal / closeCreateModal', () => {
    it('toggles showCreateModal state', () => {
      const list = useEntityList(makeConfig())

      expect(list.showCreateModal.value).toBe(false)

      list.openCreateModal()
      expect(list.showCreateModal.value).toBe(true)
      expect(list.newItemName.value).toBe('')
      expect(list.newItemVersion.value).toBe('1.0.0')
      expect(list.createError.value).toBeNull()

      list.closeCreateModal()
      expect(list.showCreateModal.value).toBe(false)
    })
  })

  describe('openDeleteModal / closeDeleteModal', () => {
    it('toggles showDeleteModal state', async () => {
      const items = [makeItem('1', 'Alpha', '1.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()

      expect(list.showDeleteModal.value).toBe(false)

      list.openDeleteModal(list.items.value[0])
      expect(list.showDeleteModal.value).toBe(true)
      expect(list.itemToDelete.value).toEqual(items[0])

      list.closeDeleteModal()
      expect(list.showDeleteModal.value).toBe(false)
      expect(list.itemToDelete.value).toBeNull()
    })
  })

  describe('validateCreate', () => {
    it('returns error for empty name', () => {
      const list = useEntityList(makeConfig())
      list.newItemName.value = ''
      list.newItemVersion.value = '1.0.0'

      const error = list.validateCreate()
      expect(error).toBeTruthy()
      expect(error).toContain('название')
    })

    it('returns error for empty version', () => {
      const list = useEntityList(makeConfig())
      list.newItemName.value = 'Test'
      list.newItemVersion.value = ''

      const error = list.validateCreate()
      expect(error).toBeTruthy()
      expect(error).toContain('версию')
    })

    it('returns error for invalid version format', () => {
      const list = useEntityList(makeConfig())
      list.newItemName.value = 'Test'
      list.newItemVersion.value = 'abc'

      const error = list.validateCreate()
      expect(error).toBeTruthy()
      expect(error).toContain('X.Y.Z')
    })

    it('returns null for valid name and version', () => {
      const list = useEntityList(makeConfig())
      list.newItemName.value = 'Test'
      list.newItemVersion.value = '1.0.0'

      expect(list.validateCreate()).toBeNull()
    })
  })

  describe('handleVersionChange', () => {
    it('updates selectedVersionByName', () => {
      const list = useEntityList(makeConfig())
      list.handleVersionChange('Alpha', '2.0.0')
      expect(list.selectedVersionByName.value['Alpha']).toBe('2.0.0')
    })
  })

  describe('getSelectedItem', () => {
    it('returns item matching selected version', async () => {
      const items = [makeItem('1', 'Alpha', '1.0.0'), makeItem('2', 'Alpha', '2.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()
      await nextTick()

      list.handleVersionChange('Alpha', '1.0.0')

      const group = list.filteredItems.value.find((g) => g.name === 'Alpha')!
      const selected = list.getSelectedItem(group)
      expect(selected?.version).toBe('1.0.0')
    })

    it('returns first version when no selection exists', async () => {
      const items = [makeItem('1', 'Alpha', '1.0.0'), makeItem('2', 'Alpha', '2.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()
      await nextTick()

      // Clear selection to force fallback
      list.selectedVersionByName.value = {}
      const group = list.filteredItems.value.find((g) => g.name === 'Alpha')!
      const selected = list.getSelectedItem(group)
      // Falls back to first in sorted list (2.0.0 is first since sorted desc)
      expect(selected).toBeDefined()
    })
  })

  describe('itemCount', () => {
    it('returns count of filtered groups', async () => {
      const items = [
        makeItem('1', 'Alpha', '1.0.0'),
        makeItem('2', 'Beta', '1.0.0'),
        makeItem('3', 'Gamma', '1.0.0'),
      ]
      mockApiGet.mockResolvedValue({ success: true, data: { content: items } })

      const list = useEntityList(makeConfig())
      await list.loadItems()
      await nextTick()

      expect(list.itemCount.value).toBe(3)

      list.searchQuery.value = 'alpha'
      await nextTick()
      expect(list.itemCount.value).toBe(1)
    })
  })
})
