import { apiDownload, apiGet, apiPost, apiUpload } from '@/api/apiClient'

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

export type ModelPackageImportConflict = {
  entity: 'model' | 'notation' | string
  name: string
  version: string
  suggestedVersion?: string | null
  details?: string[]
}

export type ModelPackageImportErrorCode =
  | 'CONFLICT'
  | 'MODEL_EXISTS'
  | 'NOTATION_EXISTS_FORBIDDEN'
  | 'NOTATION_INCOMPATIBLE'
  | 'PAYLOAD_TOO_LARGE'
  | 'BAD_REQUEST'
  | 'TIMEOUT'

export type ModelPackageImportResult =
  | { ok: true; modelId: string; modelName: string; modelVersion: string; warnings: string[] }
  | {
      ok: false
      status: number
      message: string
      code?: ModelPackageImportErrorCode
      jobId?: string
      conflict?: ModelPackageImportConflict
    }

export type ModelPackageImportOverrides = {
  targetModelName?: string
  targetModelVersion?: string
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
    conflict?: ModelPackageImportConflict | null
  } | null
}

const DEFAULT_POLL_INTERVAL_MS = 1000
const DEFAULT_POLL_TIMEOUT_MS = 60 * 60 * 1000

function normalizeConflict(
  conflict: ModelPackageImportConflict | null | undefined
): ModelPackageImportConflict | undefined {
  if (!conflict || typeof conflict !== 'object') return undefined
  const name = typeof conflict.name === 'string' ? conflict.name : ''
  const version = typeof conflict.version === 'string' ? conflict.version : ''
  if (!name || !version) return undefined
  return {
    entity: typeof conflict.entity === 'string' ? conflict.entity : 'model',
    name,
    version,
    suggestedVersion:
      typeof conflict.suggestedVersion === 'string' ? conflict.suggestedVersion : null,
    details: Array.isArray(conflict.details)
      ? conflict.details.filter((d): d is string => typeof d === 'string')
      : [],
  }
}

function mapImportError(
  status: number,
  message: string,
  code?: string | null,
  options?: { jobId?: string; conflict?: ModelPackageImportConflict | null }
): Extract<ModelPackageImportResult, { ok: false }> {
  const normalizedCode = code?.trim().toUpperCase()
  const conflict = normalizeConflict(options?.conflict)
  const jobId = options?.jobId

  if (status === 409 || normalizedCode === 'CONFLICT' || normalizedCode === 'MODEL_EXISTS') {
    if (normalizedCode === 'MODEL_EXISTS' || conflict?.entity === 'model') {
      return {
        ok: false,
        status,
        message,
        code: 'MODEL_EXISTS',
        jobId,
        conflict,
      }
    }
    if (normalizedCode === 'NOTATION_EXISTS_FORBIDDEN') {
      return {
        ok: false,
        status,
        message,
        code: 'NOTATION_EXISTS_FORBIDDEN',
        jobId,
        conflict,
      }
    }
    if (normalizedCode === 'NOTATION_INCOMPATIBLE') {
      return {
        ok: false,
        status,
        message,
        code: 'NOTATION_INCOMPATIBLE',
        jobId,
        conflict,
      }
    }
    return { ok: false, status, message, code: 'CONFLICT', jobId, conflict }
  }
  if (normalizedCode === 'NOTATION_EXISTS_FORBIDDEN') {
    return {
      ok: false,
      status,
      message,
      code: 'NOTATION_EXISTS_FORBIDDEN',
      jobId,
      conflict,
    }
  }
  if (normalizedCode === 'NOTATION_INCOMPATIBLE') {
    return {
      ok: false,
      status,
      message,
      code: 'NOTATION_INCOMPATIBLE',
      jobId,
      conflict,
    }
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
  return { ok: false, status, message, jobId, conflict }
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
        error?.code,
        { jobId, conflict: error?.conflict }
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

export async function retryModelPackageImport(
  jobId: string,
  overrides: ModelPackageImportOverrides,
  onProgress?: (progress: ModelPackageImportProgress) => void,
  options?: { pollIntervalMs?: number; pollTimeoutMs?: number }
): Promise<ModelPackageImportResult> {
  const result = await apiPost<ModelPackageImportAcceptedResponse>(
    `/models/package/jobs/${encodeURIComponent(jobId)}/retry`,
    {
      targetModelName: overrides.targetModelName,
      targetModelVersion: overrides.targetModelVersion,
    }
  )
  if (!result.success) {
    return mapImportError(result.error.status, result.error.message, undefined, { jobId })
  }

  onProgress?.({
    phase: 'processing',
    percent: 0,
    stage: 'QUEUED',
    message: 'Queued',
  })
  return pollImportJob(result.data.jobId || jobId, onProgress, options)
}
