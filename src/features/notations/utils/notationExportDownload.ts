import { apiDownload } from '@/api/apiClient'

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function downloadNotationExport(notationId: string): Promise<void> {
  const result = await apiDownload(`/notations/${encodeURIComponent(notationId)}/export`)
  if (!result.success) {
    throw new Error(result.error.message)
  }
  const resolvedName = result.data.fileName ?? `${notationId}-export.json`
  triggerBlobDownload(result.data.blob, resolvedName)
}
