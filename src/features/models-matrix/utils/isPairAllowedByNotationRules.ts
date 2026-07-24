export type NotationRuleCatalogs = {
  notationId: string
  fromNodeTypeId: string
  toNodeTypeId: string
  linkTypeId: string
  components: Array<{ id: string; notationId: string; nodeTypeId: string }>
  relations: Array<{ id: string; notationId: string; linkTypeId: string }>
  relationRules: Array<{ relationId: string; fromComponentId: string; toComponentId: string }>
}

export function isPairAllowedByNotationRules(input: NotationRuleCatalogs): boolean {
  const fromIds = new Set(
    input.components
      .filter(c => c.notationId === input.notationId && c.nodeTypeId === input.fromNodeTypeId)
      .map(c => c.id)
  )
  const toIds = new Set(
    input.components
      .filter(c => c.notationId === input.notationId && c.nodeTypeId === input.toNodeTypeId)
      .map(c => c.id)
  )
  const relationIds = new Set(
    input.relations
      .filter(r => r.notationId === input.notationId && r.linkTypeId === input.linkTypeId)
      .map(r => r.id)
  )
  if (fromIds.size === 0 || toIds.size === 0 || relationIds.size === 0) return false
  return input.relationRules.some(
    rule =>
      relationIds.has(rule.relationId) &&
      fromIds.has(rule.fromComponentId) &&
      toIds.has(rule.toComponentId)
  )
}
