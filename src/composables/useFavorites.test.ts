import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/composables/useApi', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}))

import { useFavorites } from '@/composables/useFavorites'

describe('useFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ success: true, data: { ids: ['d1', 'd2'] } })
    mockApiPut.mockResolvedValue({ success: true, data: null })
    mockApiDelete.mockResolvedValue({ success: true, data: null })
  })

  it('loads favorite ids from the API', async () => {
    const { favoriteIds, isLoaded, loadFavorites, isFavorite } = useFavorites()

    await loadFavorites()

    expect(mockApiGet).toHaveBeenCalledWith('/users/me/favorite-diagram-ids')
    expect(isLoaded.value).toBe(true)
    expect(favoriteIds.value.has('d1')).toBe(true)
    expect(favoriteIds.value.has('d2')).toBe(true)
    expect(isFavorite('d1')).toBe(true)
    expect(isFavorite('missing')).toBe(false)
  })

  it('toggleFavorite adds an id and updates the set', async () => {
    const { favoriteIds, loadFavorites, toggleFavorite, isFavorite } = useFavorites()
    await loadFavorites()
    expect(isFavorite('d3')).toBe(false)

    const result = await toggleFavorite('d3')

    expect(result).toBe(true)
    expect(mockApiPut).toHaveBeenCalledWith('/diagrams/d3/favorite', {})
    expect(favoriteIds.value.has('d3')).toBe(true)
  })

  it('toggleFavorite removes an existing favorite', async () => {
    const { favoriteIds, loadFavorites, toggleFavorite, isFavorite } = useFavorites()
    await loadFavorites()
    expect(isFavorite('d1')).toBe(true)

    const result = await toggleFavorite('d1')

    expect(result).toBe(true)
    expect(mockApiDelete).toHaveBeenCalledWith('/diagrams/d1/favorite')
    expect(favoriteIds.value.has('d1')).toBe(false)
  })

  it('rolls back the local set when the API call fails', async () => {
    const { favoriteIds, loadFavorites, toggleFavorite, isFavorite } = useFavorites()
    await loadFavorites()
    mockApiPut.mockResolvedValue({
      success: false,
      error: { status: 403, message: 'Access denied' },
    })

    const result = await toggleFavorite('d3')

    expect(result).toBe(false)
    expect(favoriteIds.value.has('d3')).toBe(false)
    expect(isFavorite('d3')).toBe(false)
  })

  it('rolls back removal when the API call fails', async () => {
    const { favoriteIds, loadFavorites, toggleFavorite } = useFavorites()
    await loadFavorites()
    mockApiDelete.mockResolvedValue({
      success: false,
      error: { status: 403, message: 'Access denied' },
    })

    const result = await toggleFavorite('d1')

    expect(result).toBe(false)
    expect(favoriteIds.value.has('d1')).toBe(true)
  })

  it('loadFavoriteDiagrams returns the paginated response', async () => {
    const items = [
      {
        id: 'd1',
        name: 'Diagram',
        version: '1.0.0',
        modelId: 'm1',
        modelName: 'Model',
        updatedAt: null,
      },
    ]
    mockApiGet.mockResolvedValue({
      success: true,
      data: { content: items, page: { size: 5, number: 0, totalElements: 3, totalPages: 1 } },
    })

    const { loadFavoriteDiagrams } = useFavorites()
    const result = await loadFavoriteDiagrams(0, 5)

    expect(mockApiGet).toHaveBeenCalledWith('/users/me/favorite-diagrams?page=0&size=5')
    expect(result.items).toEqual(items)
    expect(result.total).toBe(3)
  })

  it('loadFavoriteDiagrams caps the page size at 100', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: { content: [], page: { size: 100, number: 0, totalElements: 0, totalPages: 0 } },
    })

    const { loadFavoriteDiagrams } = useFavorites()
    await loadFavoriteDiagrams(0, 500)

    expect(mockApiGet).toHaveBeenCalledWith('/users/me/favorite-diagrams?page=0&size=100')
  })

  it('loadFavoriteDiagrams returns an empty page on API failure', async () => {
    mockApiGet.mockResolvedValue({
      success: false,
      error: { status: 500, message: 'Internal error' },
    })

    const { loadFavoriteDiagrams } = useFavorites()
    const result = await loadFavoriteDiagrams(0, 5)

    expect(result).toEqual({ items: [], total: 0 })
  })
})
