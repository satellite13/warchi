import { apiFetch, type ApiResult } from '@/api/apiClient'
import type { ImportIssue, OefParsedModel } from './types'

export type OefNormalizeResponse = OefParsedModel & {
  issues: ImportIssue[]
}

export async function normalizeOefFile(
  modelId: string,
  file: File
): Promise<ApiResult<OefNormalizeResponse>> {
  const body = new FormData()
  body.append('file', file)
  return apiFetch<OefNormalizeResponse>(`/models/${encodeURIComponent(modelId)}/oef/normalize`, {
    method: 'POST',
    body,
  })
}

export function toOefParsedModel(response: OefNormalizeResponse): OefParsedModel {
  return {
    model: response.model,
    elements: response.elements,
    relationships: response.relationships,
    views: response.views,
  }
}
