import { ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiPost, apiPut, apiFetch } from '../../../composables/useApi'
import { buildApiUrl } from '../../../api/config'
import { getAccessToken } from '../../../composables/authStorage'
import type { FileUploadResponse, FileVersionResponse } from '../../../types/api'

export interface DocumentState {
  content: string
  fileId: string | null
  isLoading: boolean
  isSaving: boolean
  error: string | null
  versions: FileVersionResponse[]
  isLoadingVersions: boolean
}

export function useTypeDocument() {
  const { t } = useI18n()

  const documentContent: Ref<string> = ref('')
  const savedContent: Ref<string> = ref('')
  const documentFileId: Ref<string | null> = ref(null)
  const isDocLoading = ref(false)
  const isDocSaving = ref(false)
  const docError: Ref<string | null> = ref(null)
  const docVersions: Ref<FileVersionResponse[]> = ref([])
  const isLoadingVersions = ref(false)

  const isDocDirty = ref(false)

  function updateDocDirty() {
    isDocDirty.value = documentContent.value !== savedContent.value
  }

  function setDocumentContent(value: string) {
    documentContent.value = value
    updateDocDirty()
  }

  /** Fetches raw markdown content from /files/{id} */
  async function fetchFileContent(fileId: string): Promise<string | null> {
    const url = buildApiUrl(`/files/${fileId}`)
    const headers: Record<string, string> = {
      Accept: 'text/markdown, text/plain, */*',
    }
    const accessToken = getAccessToken()
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    try {
      const response = await fetch(url, { method: 'GET', headers })
      if (!response.ok) {
        return null
      }
      return await response.text()
    } catch {
      return null
    }
  }

  /** Loads document content for a given fileId */
  async function loadDocument(fileId: string | undefined | null) {
    documentContent.value = ''
    savedContent.value = ''
    documentFileId.value = null
    docError.value = null
    isDocDirty.value = false

    if (!fileId) return

    isDocLoading.value = true
    documentFileId.value = fileId

    try {
      const content = await fetchFileContent(fileId)
      if (content !== null) {
        documentContent.value = content
        savedContent.value = content
      } else {
        docError.value = t('types.docLoadError')
      }
    } finally {
      isDocLoading.value = false
    }
  }

  /** Creates a new markdown file and returns the file ID */
  async function createDocument(content: string, filename?: string): Promise<string | null> {
    isDocSaving.value = true
    docError.value = null

    try {
      const body = {
        content,
        filename: filename ?? 'documentation.md',
      }
      const result = await apiPost<FileUploadResponse>('/files/upload-markdown', body)
      if (result.success) {
        savedContent.value = content
        documentFileId.value = result.data.id
        isDocDirty.value = false
        return result.data.id
      }
      docError.value = t('types.docSaveError', { message: result.error.message })
      return null
    } finally {
      isDocSaving.value = false
    }
  }

  /** Updates an existing markdown file (creates a new version) */
  async function updateDocument(
    fileId: string,
    content: string,
    filename?: string
  ): Promise<boolean> {
    isDocSaving.value = true
    docError.value = null

    try {
      const body = {
        content,
        filename: filename ?? 'documentation.md',
      }
      const result = await apiPut<FileUploadResponse>(`/files/${fileId}/markdown`, body)
      if (result.success) {
        savedContent.value = content
        isDocDirty.value = false
        return true
      }
      docError.value = t('types.docSaveError', { message: result.error.message })
      return false
    } finally {
      isDocSaving.value = false
    }
  }

  /** Saves document: creates new file or updates existing */
  async function saveDocument(): Promise<string | null> {
    const content = documentContent.value

    if (documentFileId.value) {
      const ok = await updateDocument(documentFileId.value, content)
      return ok ? documentFileId.value : null
    }

    return await createDocument(content)
  }

  /** Loads version history for the document */
  async function loadVersions(fileId: string | null) {
    docVersions.value = []
    if (!fileId) return

    isLoadingVersions.value = true
    try {
      const result = await apiFetch<FileVersionResponse[]>(`/files/${fileId}/versions`, {
        method: 'GET',
      })
      if (result.success) {
        docVersions.value = result.data ?? []
      }
    } finally {
      isLoadingVersions.value = false
    }
  }

  /** Loads a specific version's content */
  async function loadVersion(fileId: string, versionNumber: number) {
    isDocLoading.value = true
    docError.value = null

    try {
      const url = buildApiUrl(`/files/${fileId}/versions/${versionNumber}`)
      const headers: Record<string, string> = {
        Accept: 'text/markdown, text/plain, */*',
      }
      const accessToken = getAccessToken()
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }

      const response = await fetch(url, { method: 'GET', headers })
      if (response.ok) {
        const content = await response.text()
        documentContent.value = content
        updateDocDirty()
      } else {
        docError.value = t('types.docLoadVersionError')
      }
    } finally {
      isDocLoading.value = false
    }
  }

  function resetDocument() {
    documentContent.value = ''
    savedContent.value = ''
    documentFileId.value = null
    isDocDirty.value = false
    docError.value = null
    docVersions.value = []
  }

  return {
    documentContent,
    documentFileId,
    isDocLoading,
    isDocSaving,
    docError,
    docVersions,
    isLoadingVersions,
    isDocDirty,
    setDocumentContent,
    loadDocument,
    saveDocument,
    loadVersions,
    loadVersion,
    resetDocument,
  }
}
