import { apiGet } from "../../../composables/useApi"
import type { RelationResponse, RelationRuleResponse } from "../../../types/api"
import type { PaginatedResponse } from "../../../types/entities"
import { paginatedIsLastPage } from "../../../utils/paginatedResponse"

const RELATION_RULES_FETCH_SIZE = 5000
const RELATIONS_FETCH_SIZE = 5000

export async function fetchAllRelationRulesByNotationIds(
  notationIds: string[],
  options?: { includeAttrs?: boolean }
): Promise<RelationRuleResponse[]> {
  if (notationIds.length === 0) return []
  const includeAttrs = options?.includeAttrs ?? true

  const collected: RelationRuleResponse[] = []

  for (const notationId of notationIds) {
    let page = 0
    while (true) {
      const query = new URLSearchParams({
        notationId,
        page: String(page),
        size: String(RELATION_RULES_FETCH_SIZE),
        includeAttrs: String(includeAttrs),
      })
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
  notationId: string
): Promise<RelationResponse[]> {
  const collected: RelationResponse[] = []
  let page = 0

  while (true) {
    const query = new URLSearchParams({
      notationId,
      page: String(page),
      size: String(RELATIONS_FETCH_SIZE),
    })
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
