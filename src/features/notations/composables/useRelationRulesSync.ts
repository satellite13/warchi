import { apiPut } from '@/composables/useApi'
import type { EditorRelationRule } from '../types'

interface SyncRuleItem {
  fromComponentId: string
  toComponentId: string
  allowedRelationIds: string[]
}

interface SyncResponse {
  created: number
  deleted: number
  total: number
}

function isValidSyncResponse(data: unknown): data is SyncResponse {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.created === 'number' &&
    typeof d.deleted === 'number' &&
    typeof d.total === 'number'
  )
}

export async function syncRelationRulesViaApi(
  notationId: string,
  rules: EditorRelationRule[],
  activeComponentIds: Set<string>,
  activeRelationIds: Set<string>
): Promise<SyncResponse | null> {
  const syncRules: SyncRuleItem[] = rules
    .filter(
      r =>
        !r._isDeleted &&
        activeComponentIds.has(r.fromComponentId) &&
        activeComponentIds.has(r.toComponentId)
    )
    .map(r => ({
      fromComponentId: r.fromComponentId,
      toComponentId: r.toComponentId,
      allowedRelationIds: Array.from(new Set(r.allowedRelationIds)).filter(id =>
        activeRelationIds.has(id)
      ),
    }))
    .filter(r => r.allowedRelationIds.length > 0)

  const result = await apiPut<SyncResponse>(
    `/notations/${encodeURIComponent(notationId)}/relation-rules/sync`,
    { rules: syncRules }
  )
  if (!result.success) return null
  if (!isValidSyncResponse(result.data)) return null
  return result.data
}
