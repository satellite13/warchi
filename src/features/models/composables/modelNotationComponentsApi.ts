import { fetchAllPages } from '@/api/fetchAllPages'
import type { ComponentResponse } from '@/types/api'

const COMPONENTS_FETCH_SIZE = 5000

export async function fetchAllComponentsByNotationId(
  notationId: string,
  options?: { modelId?: string },
): Promise<ComponentResponse[]> {
  return fetchAllPages<ComponentResponse>(
    '/components',
    {
      notationId,
      modelId: options?.modelId,
    },
    {
      pageSize: COMPONENTS_FETCH_SIZE,
      errorLabel: 'components',
    },
  )
}

export async function fetchAllComponentsByNotationIds(
  notationIds: string[],
  options?: { modelId?: string },
): Promise<ComponentResponse[]> {
  if (notationIds.length === 0) return []
  const batches = await Promise.all(
    notationIds.map(notationId => fetchAllComponentsByNotationId(notationId, options)),
  )
  const byId = new Map<string, ComponentResponse>()
  for (const batch of batches) {
    for (const item of batch) {
      byId.set(item.id, item)
    }
  }
  return [...byId.values()]
}
