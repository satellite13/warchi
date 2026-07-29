import { ref, type Ref } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from './useApi'
import { pagedListParams } from '../api/queryHelpers'
import type { PaginatedResponse } from '../types/entities'
import { paginatedContent, paginatedTotalElements } from '../utils/paginatedResponse'
import type {
  ValidationScriptResponse,
  ValidationScriptRequest,
  ValidationScriptUpdateRequest,
} from '../types/api'

const validationScriptsPath = '/validation-scripts'

export function useValidationScripts(options?: { beforeUpdate?: () => boolean }) {
  const list: Ref<ValidationScriptResponse[]> = ref([])
  const totalElements = ref(0)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const beforeUpdate = options?.beforeUpdate

  async function fetchList(params?: {
    ownerId?: string
    page?: number
    size?: number
  }): Promise<boolean> {
    isLoading.value = true
    error.value = null
    const searchParams = pagedListParams(params?.page ?? 0, params?.size ?? 50)
    if (params?.ownerId) searchParams.set('ownerId', params.ownerId)
    const query = searchParams.toString()
    const path = query ? `${validationScriptsPath}?${query}` : validationScriptsPath
    const result = await apiGet<PaginatedResponse<ValidationScriptResponse>>(path)
    isLoading.value = false
    if (beforeUpdate && !beforeUpdate()) return false
    if (!result.success) {
      error.value = result.error.message
      return false
    }
    list.value = paginatedContent(result.data)
    totalElements.value = paginatedTotalElements(result.data)
    return true
  }

  async function fetchById(id: string): Promise<ValidationScriptResponse | null> {
    error.value = null
    const result = await apiGet<ValidationScriptResponse>(`${validationScriptsPath}/${id}`)
    if (!result.success) {
      error.value = result.error.message
      return null
    }
    return result.data
  }

  async function create(
    request: ValidationScriptRequest,
  ): Promise<ValidationScriptResponse | null> {
    error.value = null
    const result = await apiPost<ValidationScriptResponse>(validationScriptsPath, request)
    if (!result.success) {
      error.value = result.error.message
      return null
    }
    return result.data
  }

  async function update(
    id: string,
    request: ValidationScriptUpdateRequest,
  ): Promise<ValidationScriptResponse | null> {
    error.value = null
    const result = await apiPut<ValidationScriptResponse>(
      `${validationScriptsPath}/${id}`,
      request,
    )
    if (!result.success) {
      error.value = result.error.message
      return null
    }
    return result.data
  }

  async function remove(id: string): Promise<boolean> {
    error.value = null
    const result = await apiDelete<unknown>(`${validationScriptsPath}/${id}`)
    if (!result.success) {
      error.value = result.error.message
      return false
    }
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
