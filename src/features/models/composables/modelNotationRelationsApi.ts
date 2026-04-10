import { apiGet } from "@/composables/useApi"
import { pagedListParams } from "@/api/queryHelpers"
import type { RelationResponse, RelationRuleResponse } from "@/types/api"
import type { PaginatedResponse } from "@/types/entities"
import { paginatedIsLastPage } from "@/utils/paginatedResponse"

const RELATION_RULES_FETCH_SIZE = 5000
const RELATIONS_FETCH_SIZE = 5000

export async function fetchAllRelationRulesByNotationIds(
  notationIds: string[],
  options?: { includeAttrs?: boolean; modelId?: string }
): Promise<RelationRuleResponse[]> {
  if (notationIds.length === 0) return []
  const includeAttrs = options?.includeAttrs ?? true
  const modelId = options?.modelId

  const collected: RelationRuleResponse[] = []

  for (const notationId of notationIds) {
    let page = 0
    while (true) {
      const query = pagedListParams(page, RELATION_RULES_FETCH_SIZE)
      query.set('notationId', notationId)
      query.set('includeAttrs', String(includeAttrs))
      if (modelId) {
        query.set('modelId', modelId)
      }
      const result = await apiGet<PaginatedResponse<RelationRuleResponse>>(
        `/relation-rules?${query.toString()}`
      )
      if (!result.success) {
        throw new Error(`Ошибка загрузки правил связей: ${result.error.message}`)
      }
      const batch = result.data.content ?? []
      collected.push(...batch)
      if (paginatedIsLastPage(result.data, page)) break
      page += 1
    }
  }

  return collected
}

export async function fetchAllRelationsByNotationId(
  notationId: string,
  options?: { modelId?: string }
): Promise<RelationResponse[]> {
  const collected: RelationResponse[] = []
  let page = 0
  const modelId = options?.modelId

  while (true) {
    const query = pagedListParams(page, RELATIONS_FETCH_SIZE)
    query.set('notationId', notationId)
    if (modelId) {
      query.set('modelId', modelId)
    }
    const result = await apiGet<PaginatedResponse<RelationResponse>>(`/relations?${query.toString()}`)
    if (!result.success) {
      throw new Error(`Ошибка загрузки relations: ${result.error.message}`)
    }
    const batch = result.data.content ?? []
    collected.push(...batch)
    if (paginatedIsLastPage(result.data, page)) break
    page += 1
  }

  return collected
}
