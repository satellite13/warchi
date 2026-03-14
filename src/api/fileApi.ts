import { buildApiUrl } from "./config"
import { getAccessToken } from "../composables/authStorage"

/** Fetches raw file content (markdown/text) from /files/{id} */
export async function fetchFileContent(fileId: string): Promise<string | null> {
  const url = buildApiUrl(`/files/${fileId}`)
  const headers: Record<string, string> = {
    Accept: "text/markdown, text/plain, */*",
  }
  const token = getAccessToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const response = await fetch(url, { method: "GET", headers, cache: "no-store" })
    if (!response.ok) {
      console.warn(`[fileApi] Failed to fetch file ${fileId}: ${response.status}`)
      return null
    }
    return await response.text()
  } catch (error) {
    console.warn(`[fileApi] Error fetching file ${fileId}:`, error)
    return null
  }
}
