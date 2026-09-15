import { apiDelete, apiGet, apiPost, apiPut, type ApiResult } from '@/composables/useApi'
import type {
  DeleteUnusedRequest,
  DeleteUnusedResponse,
  MergeLinksPreview,
  MergeLinksRequest,
  MergeNodesPreview,
  MergeNodesRequest,
  OefMergeDecision,
  OefMergeDecisionSaveRequest,
  OefMergeDecisionSaveResponse,
  ValidationReport,
} from './types'

const encodePath = (value: string): string => encodeURIComponent(value)

export type MergePairIds = {
  keepId: string
  dropId: string
}

export function fetchValidationReport(modelId: string): Promise<ApiResult<ValidationReport>> {
  return apiGet<ValidationReport>(`/models/${encodePath(modelId)}/validation-report`)
}

export type AutoMergeLock = {
  locked: boolean
  lockedBy?: string | null
  lockedByName?: string | null
  lockedAt?: string | null
}

export function fetchAutoMergeLock(modelId: string): Promise<ApiResult<AutoMergeLock>> {
  return apiGet<AutoMergeLock>(`/models/${encodePath(modelId)}/validation/auto-merge/lock`)
}

export function acquireAutoMergeLock(modelId: string): Promise<ApiResult<AutoMergeLock>> {
  return apiPost<AutoMergeLock>(`/models/${encodePath(modelId)}/validation/auto-merge/lock`, null)
}

export function releaseAutoMergeLock(modelId: string): Promise<ApiResult<void>> {
  return apiDelete(`/models/${encodePath(modelId)}/validation/auto-merge/lock`)
}

export function fetchMergeNodesPreview(
  modelId: string,
  pair: { keepId: string; dropId: string }
): Promise<ApiResult<MergeNodesPreview>> {
  const query = new URLSearchParams({
    keepId: pair.keepId,
    dropId: pair.dropId,
  })
  return apiGet<MergeNodesPreview>(
    `/models/${encodePath(modelId)}/validation/merge-nodes-preview?${query.toString()}`
  )
}

export function fetchMergeLinksPreview(
  modelId: string,
  pair: { keepId: string; dropId: string }
): Promise<ApiResult<MergeLinksPreview>> {
  const query = new URLSearchParams({
    keepId: pair.keepId,
    dropId: pair.dropId,
  })
  return apiGet<MergeLinksPreview>(
    `/models/${encodePath(modelId)}/validation/merge-links-preview?${query.toString()}`
  )
}

export function mergeNodes(
  modelId: string,
  body: MergeNodesRequest
): Promise<ApiResult<MergePairIds>> {
  return apiPost<MergePairIds>(`/models/${encodePath(modelId)}/validation/merge-nodes`, body)
}

export function mergeLinks(
  modelId: string,
  body: MergeLinksRequest
): Promise<ApiResult<MergePairIds>> {
  return apiPost<MergePairIds>(`/models/${encodePath(modelId)}/validation/merge-links`, body)
}

export function deleteUnused(
  modelId: string,
  body: DeleteUnusedRequest
): Promise<ApiResult<DeleteUnusedResponse>> {
  return apiPost<DeleteUnusedResponse>(
    `/models/${encodePath(modelId)}/validation/unused/delete`,
    body
  )
}

export function fetchOefMergeDecisions(modelId: string): Promise<ApiResult<OefMergeDecision[]>> {
  return apiGet<OefMergeDecision[]>(`/models/${encodePath(modelId)}/oef/merge-decisions`)
}

export function saveOefMergeDecisions(
  modelId: string,
  body: OefMergeDecisionSaveRequest
): Promise<ApiResult<OefMergeDecisionSaveResponse>> {
  return apiPut<OefMergeDecisionSaveResponse>(
    `/models/${encodePath(modelId)}/oef/merge-decisions`,
    body
  )
}

export function deleteOefMergeDecision(
  modelId: string,
  oefEntityId: string
): Promise<ApiResult<void>> {
  return apiDelete(
    `/models/${encodePath(modelId)}/oef/merge-decisions/${encodeURIComponent(oefEntityId)}`
  )
}
