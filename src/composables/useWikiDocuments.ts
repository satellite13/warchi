import { ref, type Ref } from "vue"
import { apiGet } from "./useApi"
import { fetchFileContent } from "../api/fileApi"

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

  return { list, isLoading, error, fetchList, fetchFileContent }
}
