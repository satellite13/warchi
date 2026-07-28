import type { EditorRelationRule } from '../types'

export type CopyRelationRulesMode = 'merge' | 'replace'

const uniqueIds = (ids: string[]): string[] => Array.from(new Set(ids))

export function copyRelationRulesFromComponent(
  rules: EditorRelationRule[],
  sourceComponentId: string,
  targetComponentId: string,
  mode: CopyRelationRulesMode,
  createId: () => string,
): { changed: boolean } {
  if (sourceComponentId === targetComponentId) {
    return { changed: false }
  }

  const sourceOutbound = rules.filter(
    r => r.fromComponentId === sourceComponentId && !r._isDeleted,
  )
  if (sourceOutbound.length === 0) {
    return { changed: false }
  }

  const candidatesByTo = new Map<string, string[]>()
  for (const src of sourceOutbound) {
    const toId =
      src.toComponentId === sourceComponentId ? targetComponentId : src.toComponentId
    const existing = candidatesByTo.get(toId) ?? []
    candidatesByTo.set(toId, uniqueIds([...existing, ...src.allowedRelationIds]))
  }

  if (mode === 'replace') {
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i]
      if (!r || r.fromComponentId !== targetComponentId || r._isDeleted) continue
      if (r._isNew) {
        rules.splice(i, 1)
      } else {
        r._isDeleted = true
        r._isDirty = true
      }
    }
    for (const [toId, relationIds] of candidatesByTo) {
      rules.push({
        id: createId(),
        fromComponentId: targetComponentId,
        toComponentId: toId,
        allowedRelationIds: relationIds,
        _isNew: true,
      })
    }
    return { changed: true }
  }

  // merge
  for (const [toId, relationIds] of candidatesByTo) {
    const existing = rules.find(
      r =>
        r.fromComponentId === targetComponentId &&
        r.toComponentId === toId &&
        !r._isDeleted,
    )
    if (existing) {
      const merged = uniqueIds([...existing.allowedRelationIds, ...relationIds])
      const same =
        merged.length === existing.allowedRelationIds.length &&
        merged.every(id => existing.allowedRelationIds.includes(id))
      if (!same) {
        existing.allowedRelationIds = merged
        if (!existing._isNew) existing._isDirty = true
      }
    } else {
      rules.push({
        id: createId(),
        fromComponentId: targetComponentId,
        toComponentId: toId,
        allowedRelationIds: relationIds,
        _isNew: true,
      })
    }
  }

  return { changed: true }
}
