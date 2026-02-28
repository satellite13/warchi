import { ref, type Ref } from "vue"
import { apiGet, apiPost, apiPut, apiDelete } from "./useApi"
import type { PaginatedResponse } from "../types/entities"
import type {
  NodeShapeResponse,
  NodeShapeRequest,
  NodeShapeUpdateRequest
} from "../types/api"

const nodeShapesPath = "/node-shapes"

export function useNodeShapes() {
  const list: Ref<NodeShapeResponse[]> = ref([])
  const totalElements = ref(0)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchList(params?: { ownerId?: string; page?: number; size?: number }): Promise<boolean> {
    isLoading.value = true
    error.value = null
    const searchParams = new URLSearchParams()
    if (params?.page != null) searchParams.set("page", String(params.page))
    if (params?.size != null) searchParams.set("size", String(params.size))
    if (params?.ownerId) searchParams.set("ownerId", params.ownerId)
    const query = searchParams.toString()
    const path = query ? `${nodeShapesPath}?${query}` : nodeShapesPath
    const result = await apiGet<PaginatedResponse<NodeShapeResponse>>(path)
    isLoading.value = false
    if (!result.success) {
      error.value = result.error.message
      return false
    }
    list.value = result.data.content ?? []
    totalElements.value = result.data.totalElements ?? 0
    return true
  }

  async function fetchById(id: string): Promise<NodeShapeResponse | null> {
    error.value = null
    const result = await apiGet<NodeShapeResponse>(`${nodeShapesPath}/${id}`)
    if (!result.success) {
      error.value = result.error.message
      return null
    }
    return result.data
  }

  async function create(request: NodeShapeRequest): Promise<NodeShapeResponse | null> {
    error.value = null
    const result = await apiPost<NodeShapeResponse>(nodeShapesPath, request)
    if (!result.success) {
      error.value = result.error.message
      return null
    }
    return result.data
  }

  async function update(id: string, request: NodeShapeUpdateRequest): Promise<NodeShapeResponse | null> {
    error.value = null
    const result = await apiPut<NodeShapeResponse>(`${nodeShapesPath}/${id}`, request)
    if (!result.success) {
      error.value = result.error.message
      return null
    }
    return result.data
  }

  async function remove(id: string): Promise<boolean> {
    error.value = null
    const result = await apiDelete<unknown>(`${nodeShapesPath}/${id}`)
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
    remove
  }
}
