import type { EditorRelationRule } from '../types'

const uniqueIds = (ids: string[]): string[] => Array.from(new Set(ids))

export function applyRelationRuleCell(
  rules: EditorRelationRule[],
  fromComponentId: string,
  toComponentId: string,
  allowedRelationIds: string[],
  createId: () => string,
): void {
  const uniqueAllowed = uniqueIds(allowedRelationIds)
  const existingIndex = rules.findIndex(
    r =>
      r.fromComponentId === fromComponentId &&
      r.toComponentId === toComponentId &&
      !r._isDeleted,
  )
  const existing = existingIndex >= 0 ? rules[existingIndex] : undefined

  if (uniqueAllowed.length === 0) {
    if (!existing || existingIndex < 0) return
    if (existing._isNew) {
      rules.splice(existingIndex, 1)
      return
    }
    existing._isDeleted = true
    existing._isDirty = true
    return
  }

  if (existing) {
    existing.allowedRelationIds = uniqueAllowed
    if (!existing._isNew) existing._isDirty = true
    return
  }

  rules.push({
    id: createId(),
    fromComponentId,
    toComponentId,
    allowedRelationIds: uniqueAllowed,
    _isNew: true,
  })
}
