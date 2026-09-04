import { computed, ref } from 'vue'
import { apiDelete, apiGet, apiPut } from './useApi'
import { AUTH_CLEARED_EVENT, AUTH_UPDATED_EVENT } from './authStorage'
import { paginatedContent, paginatedTotalElements } from '../utils/paginatedResponse'
import type { PaginatedResponse } from '../types/entities'

export interface FavoriteDiagramItem {
  id: string
  name: string
  version: string
  modelId: string
  modelName: string
  updatedAt: string | null
}

interface FavoriteDiagramIdsResponse {
  ids: string[]
}

export interface FavoriteDiagramsPage {
  items: FavoriteDiagramItem[]
  total: number
}

const DEFAULT_PAGE_SIZE = 5
const MAX_PAGE_SIZE = 100

const favoriteIds = ref<Set<string>>(new Set())
const isLoaded = ref(false)
const isLoading = ref(false)

const loadFavoriteIds = async (): Promise<void> => {
  isLoading.value = true
  const result = await apiGet<FavoriteDiagramIdsResponse>('/users/me/favorite-diagram-ids')
  isLoading.value = false
  if (!result.success) return
  favoriteIds.value = new Set(result.data.ids ?? [])
  isLoaded.value = true
}

const clearFavorites = (): void => {
  favoriteIds.value = new Set()
  isLoaded.value = false
}

const AUTH_LISTENERS_FLAG = '__warchiFavoritesListenersAttached__'
type WindowWithFavoritesFlag = Window & { [AUTH_LISTENERS_FLAG]?: boolean }

if (typeof window !== 'undefined' && !(window as WindowWithFavoritesFlag)[AUTH_LISTENERS_FLAG]) {
  ;(window as WindowWithFavoritesFlag)[AUTH_LISTENERS_FLAG] = true

  window.addEventListener(AUTH_UPDATED_EVENT, () => {
    void loadFavoriteIds()
  })

  window.addEventListener(AUTH_CLEARED_EVENT, () => {
    clearFavorites()
  })
}

export function useFavorites() {
  const isFavorite = (diagramId: string): boolean => favoriteIds.value.has(diagramId)

  const favoriteCount = computed(() => favoriteIds.value.size)

  const loadFavorites = async (): Promise<void> => {
    await loadFavoriteIds()
  }

  const addFavorite = async (diagramId: string): Promise<boolean> => {
    const result = await apiPut<void>(`/diagrams/${encodeURIComponent(diagramId)}/favorite`, {})
    if (!result.success) return false
    const next = new Set(favoriteIds.value)
    next.add(diagramId)
    favoriteIds.value = next
    return true
  }

  const removeFavorite = async (diagramId: string): Promise<boolean> => {
    const result = await apiDelete<void>(`/diagrams/${encodeURIComponent(diagramId)}/favorite`)
    if (!result.success) return false
    const next = new Set(favoriteIds.value)
    next.delete(diagramId)
    favoriteIds.value = next
    return true
  }

  /** Optimistic toggle: local state updates immediately, rolled back on API failure. */
  const toggleFavorite = async (diagramId: string): Promise<boolean> => {
    const wasFavorite = favoriteIds.value.has(diagramId)
    const next = new Set(favoriteIds.value)
    if (wasFavorite) {
      next.delete(diagramId)
    } else {
      next.add(diagramId)
    }
    favoriteIds.value = next

    const result = wasFavorite ? await removeFavorite(diagramId) : await addFavorite(diagramId)
    if (!result) {
      const rollback = new Set(favoriteIds.value)
      if (wasFavorite) {
        rollback.add(diagramId)
      } else {
        rollback.delete(diagramId)
      }
      favoriteIds.value = rollback
    }
    return result
  }

  const loadFavoriteDiagrams = async (
    page = 0,
    size = DEFAULT_PAGE_SIZE
  ): Promise<FavoriteDiagramsPage> => {
    const query = new URLSearchParams({
      page: String(Math.max(page, 0)),
      size: String(Math.min(Math.max(size, 1), MAX_PAGE_SIZE)),
    })
    const result = await apiGet<PaginatedResponse<FavoriteDiagramItem>>(
      `/users/me/favorite-diagrams?${query.toString()}`
    )
    if (!result.success) return { items: [], total: 0 }
    return { items: paginatedContent(result.data), total: paginatedTotalElements(result.data) }
  }

  return {
    favoriteIds,
    isLoaded,
    isLoading,
    favoriteCount,
    isFavorite,
    loadFavorites,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    loadFavoriteDiagrams,
  }
}
