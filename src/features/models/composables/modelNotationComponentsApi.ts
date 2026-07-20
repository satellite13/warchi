import { apiGet } from '@/composables/useApi'
import { pagedListParams } from '@/api/queryHelpers'
import type { ComponentResponse } from '@/types/api'
import type { PaginatedResponse } from '@/types/entities'
import { paginatedIsLastPage } from '@/utils/paginatedResponse'

const COMPONENTS_FETCH_SIZE = 5000

export async function fetchAllComponentsByNotationId(
  notationId: string,
  options?: { modelId?: string }
): Promise<ComponentResponse[]> {
  const collected: ComponentResponse[] = []
  let page = 0
  const modelId = options?.modelId

  while (true) {
    const query = pagedListParams(page, COMPONENTS_FETCH_SIZE)
    query.set('notationId', notationId)
    if (modelId) {
      query.set('modelId', modelId)
    }
    const result = await apiGet<PaginatedResponse<ComponentResponse>>(
      `/components?${query.toString()}`
    )
    if (!result.success) {
      throw new Error(`Ошибка загрузки components: ${result.error.message}`)
    }
    const batch = result.data.content ?? []
    collected.push(...batch)
    if (paginatedIsLastPage(result.data, page)) break
    page += 1
  }

  return collected
}

export async function fetchAllComponentsByNotationIds(
  notationIds: string[],
  options?: { modelId?: string }
): Promise<ComponentResponse[]> {
  if (notationIds.length === 0) return []
  const batches = await Promise.all(
    notationIds.map(notationId => fetchAllComponentsByNotationId(notationId, options))
  )
  const byId = new Map<string, ComponentResponse>()
  for (const batch of batches) {
    for (const item of batch) {
      byId.set(item.id, item)
    }
  }
  return [...byId.values()]
}
