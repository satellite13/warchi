import { apiGet, apiPost, type ApiResult } from '@/composables/useApi'
import type {
  MergeLinksPreview,
  MergeLinksRequest,
  MergeNodesPreview,
  MergeNodesRequest,
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
