import { apiFetchText } from './apiClient'

/** Fetches raw file content (markdown/text) from /files/{id} */
export async function fetchFileContent(fileId: string): Promise<string | null> {
  const result = await apiFetchText(`/files/${fileId}`)
  if (!result.success) {
    console.warn(`[fileApi] Failed to fetch file ${fileId}: ${result.error.message}`)
    return null
  }
  return result.data
}
