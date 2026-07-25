import { apiUpload, type ApiResult, type ApiUploadProgress } from '@/api/apiClient'
import type { ImportIssue, OefParsedModel } from './types'

export type OefNormalizeResponse = OefParsedModel & {
  issues: ImportIssue[]
  organizations?: OefParsedModel['organizations']
}

export type OefNormalizeProgress = ApiUploadProgress & {
  /** `uploading` while bytes go to the server; `processing` after upload while waiting for JSON */
  phase: 'uploading' | 'processing'
}

export async function normalizeOefFile(
  modelId: string,
  file: File,
  onProgress?: (progress: OefNormalizeProgress) => void
): Promise<ApiResult<OefNormalizeResponse>> {
  const body = new FormData()
  body.append('file', file)

  return apiUpload<OefNormalizeResponse>(
    `/models/${encodeURIComponent(modelId)}/oef/normalize`,
    body,
    {
      onProgress: progress => {
        const phase: OefNormalizeProgress['phase'] =
          progress.percent >= 100 ? 'processing' : 'uploading'
        onProgress?.({
          loaded: progress.total > 0 ? progress.loaded : file.size,
          total: progress.total > 0 ? progress.total : file.size,
          percent: progress.percent,
          phase,
        })
      },
    }
  )
}

export function toOefParsedModel(response: OefNormalizeResponse): OefParsedModel {
  return {
    model: response.model,
    elements: response.elements,
    relationships: response.relationships.map(relationship => ({
      ...relationship,
      name: typeof relationship.name === 'string' ? relationship.name : '',
    })),
    views: response.views,
    organizations: Array.isArray(response.organizations) ? response.organizations : [],
  }
}

export function formatUploadBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
