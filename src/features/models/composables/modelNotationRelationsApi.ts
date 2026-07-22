import { fetchAllPages } from '@/api/fetchAllPages'
import type { RelationResponse, RelationRuleResponse } from '@/types/api'

const RELATION_RULES_FETCH_SIZE = 5000
const RELATIONS_FETCH_SIZE = 5000

export async function fetchAllRelationRulesByNotationIds(
  notationIds: string[],
  options?: { includeAttrs?: boolean; modelId?: string },
): Promise<RelationRuleResponse[]> {
  if (notationIds.length === 0) return []
  const includeAttrs = options?.includeAttrs ?? true
  const modelId = options?.modelId

  const batches = await Promise.all(
    notationIds.map(notationId =>
      fetchAllPages<RelationRuleResponse>(
        '/relation-rules',
        {
          notationId,
          includeAttrs: String(includeAttrs),
          modelId,
        },
        {
          pageSize: RELATION_RULES_FETCH_SIZE,
          errorLabel: 'правил связей',
        },
      ),
    ),
  )
  return batches.flat()
}

export async function fetchAllRelationsByNotationId(
  notationId: string,
  options?: { modelId?: string },
): Promise<RelationResponse[]> {
  return fetchAllPages<RelationResponse>(
    '/relations',
    {
      notationId,
      modelId: options?.modelId,
    },
    {
      pageSize: RELATIONS_FETCH_SIZE,
      errorLabel: 'relations',
    },
  )
}
