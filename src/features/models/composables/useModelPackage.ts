import { apiDownload, apiGet, apiUpload } from '@/api/apiClient'

export type ModelPackageImportStage =
  | 'UPLOADING'
  | 'QUEUED'
  | 'VALIDATING'
  | 'IMPORTING_NOTATIONS'
  | 'IMPORTING_FILES'
  | 'CREATING_MODEL'
  | 'DOCUMENT_REFS'
  | 'DONE'
  | string

export type ModelPackageImportProgress = {
  phase: 'uploading' | 'processing'
  /** Upload bytes percent while uploading; server job progress while processing */
  percent: number
  stage?: ModelPackageImportStage
  message?: string | null
}

export type ModelPackageImportResult =
  | { ok: true; modelId: string; modelName: string; modelVersion: string; warnings: string[] }
  | {
      ok: false
      status: number
      message: string
      code?: 'CONFLICT' | 'PAYLOAD_TOO_LARGE' | 'BAD_REQUEST' | 'TIMEOUT'
    }

type ModelPackageImportAcceptedResponse = {
  jobId: string
  status: string
}

type ModelPackageImportJobStatusResponse = {
  jobId: string
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | string
  stage: string
  progress: number
  message?: string | null
  result?: {
    modelId: string
    modelName: string
    modelVersion: string
    warnings?: string[]
  } | null
  error?: {
    status: number
    message: string
    code?: string | null
  } | null
}

const DEFAULT_POLL_INTERVAL_MS = 1000
const DEFAULT_POLL_TIMEOUT_MS = 60 * 60 * 1000

function mapImportError(
  status: number,
  message: string,
  code?: string | null
): Extract<ModelPackageImportResult, { ok: false }> {
  const normalizedCode = code?.trim().toUpperCase()
  if (status === 409 || normalizedCode === 'CONFLICT') {
    return { ok: false, status, message, code: 'CONFLICT' }
  }
  if (status === 413 || normalizedCode === 'PAYLOAD_TOO_LARGE') {
    return { ok: false, status, message, code: 'PAYLOAD_TOO_LARGE' }
  }
  if (status === 400 || normalizedCode === 'BAD_REQUEST') {
    return { ok: false, status, message, code: 'BAD_REQUEST' }
  }
  if (status === 504 || status === 502 || normalizedCode === 'TIMEOUT' || /<\s*html[\s>]/i.test(message)) {
    return {
      ok: false,
      status: status || 504,
      message: /<\s*html[\s>]/i.test(message) ? 'Gateway timeout' : message || 'Gateway timeout',
      code: 'TIMEOUT',
    }
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function pollImportJob(
  jobId: string,
  onProgress?: (progress: ModelPackageImportProgress) => void,
  options?: { pollIntervalMs?: number; pollTimeoutMs?: number }
): Promise<ModelPackageImportResult> {
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const pollTimeoutMs = options?.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS
  const deadline = Date.now() + pollTimeoutMs

  while (Date.now() < deadline) {
    const statusResult = await apiGet<ModelPackageImportJobStatusResponse>(
      `/models/package/jobs/${encodeURIComponent(jobId)}`
    )
    if (!statusResult.success) {
      return mapImportError(statusResult.error.status, statusResult.error.message)
    }

    const job = statusResult.data
    onProgress?.({
      phase: 'processing',
      percent: Math.max(0, Math.min(100, Number(job.progress) || 0)),
      stage: job.stage,
      message: job.message ?? null,
    })

    if (job.status === 'SUCCEEDED') {
      const result = job.result
      if (!result?.modelId) {
        return { ok: false, status: 0, message: 'Invalid import job result' }
      }
      return {
        ok: true,
        modelId: result.modelId,
        modelName: result.modelName,
        modelVersion: result.modelVersion,
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
      }
    }

    if (job.status === 'FAILED') {
      const error = job.error
      return mapImportError(
        error?.status ?? 500,
        error?.message || job.message || 'Import failed',
        error?.code
      )
    }

    await sleep(pollIntervalMs)
  }

  return mapImportError(504, 'Import job timed out', 'TIMEOUT')
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
  onProgress?: (progress: ModelPackageImportProgress) => void,
  options?: { pollIntervalMs?: number; pollTimeoutMs?: number }
): Promise<ModelPackageImportResult> {
  const body = new FormData()
  body.append('file', file)

  const result = await apiUpload<ModelPackageImportAcceptedResponse | Record<string, unknown>>(
    '/models/package',
    body,
    {
      onProgress: progress =>
        onProgress?.({
          phase: 'uploading',
          percent: progress.percent,
          stage: 'UPLOADING',
          message: null,
        }),
    }
  )

  if (!result.success) {
    return mapImportError(result.error.status, result.error.message)
  }

  const data = result.data as ModelPackageImportAcceptedResponse
  if (data && typeof data.jobId === 'string' && data.jobId.length > 0) {
    onProgress?.({
      phase: 'processing',
      percent: 0,
      stage: 'QUEUED',
      message: 'Queued',
    })
    return pollImportJob(data.jobId, onProgress, options)
  }

  // Backward-compatible sync response (should not happen with current API).
  const sync = result.data as {
    modelId?: string
    modelName?: string
    modelVersion?: string
    warnings?: string[]
  }
  if (!sync?.modelId) {
    return { ok: false, status: 0, message: 'Invalid response' }
  }

  return {
    ok: true,
    modelId: sync.modelId,
    modelName: sync.modelName ?? '',
    modelVersion: sync.modelVersion ?? '',
    warnings: Array.isArray(sync.warnings) ? sync.warnings : [],
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
