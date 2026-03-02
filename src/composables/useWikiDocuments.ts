import { ref, type Ref } from "vue"
import { apiGet } from "./useApi"
import { buildApiUrl } from "../api/config"
import { getAccessToken } from "./authStorage"

export interface DocumentWikiItem {
  fileId: string
  label: string
  entityType?: string | null
  entityId?: string | null
  entityName?: string | null
  parentName?: string | null
}

export function useWikiDocuments() {
  const list: Ref<DocumentWikiItem[]> = ref([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchList(): Promise<boolean> {
    isLoading.value = true
    error.value = null
    const result = await apiGet<DocumentWikiItem[]>(`/documents`)
    isLoading.value = false
    if (!result.success) {
      error.value = result.error.message
      return false
    }
    list.value = result.data ?? []
    return true
  }

  async function fetchFileContent(fileId: string): Promise<string | null> {
    const url = buildApiUrl(`/files/${fileId}`)
    const headers: Record<string, string> = {
      Accept: "text/markdown, text/plain, */*"
    }
    const token = getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
    try {
      const response = await fetch(url, { method: "GET", headers, cache: "no-store" })
      if (!response.ok) return null
      return await response.text()
    } catch {
      return null
    }
  }

  return { list, isLoading, error, fetchList, fetchFileContent }
}
