import { ref, type Ref } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from './useApi'
import { pagedListParams } from '../api/queryHelpers'
import type { PaginatedResponse } from '../types/entities'
import { paginatedContent, paginatedTotalElements } from '../utils/paginatedResponse'

export type PagedListParams = {
  ownerId?: string
  page?: number
  size?: number
}

export type UsePagedResourceCrudOptions<TListItem, TDetail> = {
  basePath: string
  beforeUpdate?: () => boolean
  /** Called after a successful list fetch, before returning true. */
  onListLoaded?: (items: TListItem[]) => void
  /** Called after successful create/update/remove. */
  afterMutation?: (kind: 'create' | 'update' | 'remove', item?: TDetail | null) => void
}

export function usePagedResourceCrud<TListItem, TDetail, TCreate, TUpdate>(
  options: UsePagedResourceCrudOptions<TListItem, TDetail>
) {
  const list: Ref<TListItem[]> = ref([])
  const totalElements = ref(0)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { basePath, beforeUpdate, onListLoaded, afterMutation } = options

  async function fetchList(params?: PagedListParams): Promise<boolean> {
    isLoading.value = true
    error.value = null
    const searchParams = pagedListParams(params?.page ?? 0, params?.size ?? 50)
    if (params?.ownerId) searchParams.set('ownerId', params.ownerId)
    const query = searchParams.toString()
    const path = query ? `${basePath}?${query}` : basePath
    const result = await apiGet<PaginatedResponse<TListItem>>(path)
    isLoading.value = false
    if (beforeUpdate && !beforeUpdate()) return false
    if (!result.success) {
      error.value = result.error.message
      return false
    }
    list.value = paginatedContent(result.data)
    totalElements.value = paginatedTotalElements(result.data)
    onListLoaded?.(list.value)
    return true
  }

  async function fetchById(id: string): Promise<TDetail | null> {
    error.value = null
    const result = await apiGet<TDetail>(`${basePath}/${id}`)
    if (!result.success) {
      error.value = result.error.message
      return null
    }
    return result.data
  }

  async function create(request: TCreate): Promise<TDetail | null> {
    error.value = null
    const result = await apiPost<TDetail>(basePath, request)
    if (!result.success) {
      error.value = result.error.message
      return null
    }
    afterMutation?.('create', result.data)
    return result.data
  }

  async function update(id: string, request: TUpdate): Promise<TDetail | null> {
    error.value = null
    const result = await apiPut<TDetail>(`${basePath}/${id}`, request)
    if (!result.success) {
      error.value = result.error.message
      return null
    }
    afterMutation?.('update', result.data)
    return result.data
  }

  async function remove(id: string): Promise<boolean> {
    error.value = null
    const result = await apiDelete<unknown>(`${basePath}/${id}`)
    if (!result.success) {
      error.value = result.error.message
      return false
    }
    afterMutation?.('remove', null)
    return true
  }

  return {
    list,
    totalElements,
    isLoading,
    error,
    fetchList,
    fetchById,
    create,
    update,
    remove,
  }
}
