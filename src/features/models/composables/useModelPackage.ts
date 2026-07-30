import { apiDownload, apiUpload } from '@/api/apiClient'

export type ModelPackageImportResult =
  | { ok: true; modelId: string; modelName: string; modelVersion: string; warnings: string[] }
  | {
      ok: false
      status: number
      message: string
      code?: 'CONFLICT' | 'PAYLOAD_TOO_LARGE' | 'BAD_REQUEST'
    }

type ModelPackageImportResponse = {
  modelId: string
  modelName: string
  modelVersion: string
  warnings?: string[]
}

function mapImportError(
  status: number,
  message: string
): Extract<ModelPackageImportResult, { ok: false }> {
  if (status === 409) {
    return { ok: false, status, message, code: 'CONFLICT' }
  }
  if (status === 413) {
    return { ok: false, status, message, code: 'PAYLOAD_TOO_LARGE' }
  }
  if (status === 400) {
    return { ok: false, status, message, code: 'BAD_REQUEST' }
  }
  // nginx/HTML gateway pages are not useful in the UI toast
  if (status === 502 || status === 504 || /<\s*html[\s>]/i.test(message)) {
    return { ok: false, status, message: 'Gateway timeout' }
  }
  return { ok: false, status, message }
}

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

export async function downloadModelPackage(modelId: string, fileName?: string): Promise<void> {
  const result = await apiDownload(`/models/${encodeURIComponent(modelId)}/package`)
  if (!result.success) {
    throw new Error(result.error.message)
  }
  const resolvedName = fileName ?? result.data.fileName ?? `${modelId}.zip`
  triggerBlobDownload(result.data.blob, resolvedName)
}

export async function uploadModelPackage(
  file: File,
  onProgress?: (pct: number) => void
): Promise<ModelPackageImportResult> {
  const body = new FormData()
  body.append('file', file)

  const result = await apiUpload<ModelPackageImportResponse>('/models/package', body, {
    onProgress: progress => onProgress?.(progress.percent),
  })

  if (!result.success) {
    return mapImportError(result.error.status, result.error.message)
  }

  const data = result.data
  if (!data?.modelId) {
    return { ok: false, status: 0, message: 'Invalid response' }
  }

  return {
    ok: true,
    modelId: data.modelId,
    modelName: data.modelName,
    modelVersion: data.modelVersion,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  }
}

export async function downloadNotationExport(notationId: string): Promise<void> {
  const result = await apiDownload(`/notations/${encodeURIComponent(notationId)}/export`)
  if (!result.success) {
    throw new Error(result.error.message)
  }
  const resolvedName = result.data.fileName ?? `${notationId}-export.json`
  triggerBlobDownload(result.data.blob, resolvedName)
}
