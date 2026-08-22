import type { ApiResult } from '@/composables/useApi'
import {
  fetchDiagramReferences,
  type FetchDiagramReferencesOptions,
} from '@/features/models/composables/modelScopedApi'
import type { DiagramReferenceResponse } from '@/types/api'
import type { PaginatedResponse } from '@/types/entities'
import { paginatedContent, paginatedIsLastPage } from '@/utils/paginatedResponse'

export type DiagramReferencesTarget = { nodeId: string } | { linkId: string }

export type FetchAllDiagramReferences = (
  modelId: string,
  target: DiagramReferencesTarget,
  options?: FetchDiagramReferencesOptions
) => Promise<ApiResult<PaginatedResponse<DiagramReferenceResponse>>>

function isLastDiagramPage(
  data: Pick<PaginatedResponse<unknown>, 'page' | 'totalPages' | 'totalElements' | 'last'>,
  pageIndex: number
): boolean {
  if (data.last === false) return false
  return paginatedIsLastPage(data, pageIndex)
}

export async function loadAllDiagramReferences(
  modelId: string,
  target: DiagramReferencesTarget,
  fetchFn: FetchAllDiagramReferences = fetchDiagramReferences
): Promise<DiagramReferenceResponse[]> {
  const rows: DiagramReferenceResponse[] = []
  let page = 0

  while (true) {
    const result = await fetchFn(modelId, target, { page })
    if (!result.success) {
      throw new Error(result.error.message)
    }
    rows.push(...paginatedContent(result.data))
    if (isLastDiagramPage(result.data, page)) break
    page += 1
  }

  return rows
}
