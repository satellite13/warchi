import type { ImportMappingState } from './mappingState'
import type { ImportDraft } from './types'

export type OefRelationRuleDecision = 'skip' | 'import'

export type OefRelationRuleRef = {
  relationId: string
  fromComponentId: string
  toComponentId: string
}

export type DisallowedOefLinkGroup = {
  key: string
  count: number
  sourceRelationshipIds: string[]
  relationshipType: string
  sourceElementType: string
  targetElementType: string
  relationId: string
  fromComponentId: string
  toComponentId: string
}

const GROUP_KEY_SEP = '\u001f'

export function buildDisallowedOefLinkGroupKey(parts: {
  sourceElementType: string
  targetElementType: string
  relationshipType: string
  relationId: string
  fromComponentId: string
  toComponentId: string
}): string {
  return [
    parts.sourceElementType,
    parts.targetElementType,
    parts.relationshipType,
    parts.relationId,
    parts.fromComponentId,
    parts.toComponentId,
  ].join(GROUP_KEY_SEP)
}

export function isOefLinkAllowedByRelationRules(params: {
  fromComponentId: string
  toComponentId: string
  relationId: string
  relationRules: OefRelationRuleRef[]
}): boolean {
  return params.relationRules.some(
    rule =>
      rule.relationId === params.relationId &&
      rule.fromComponentId === params.fromComponentId &&
      rule.toComponentId === params.toComponentId
  )
}

export function collectDisallowedOefLinkGroups(params: {
  draft: ImportDraft
  mapping: ImportMappingState
  relationRules: OefRelationRuleRef[]
}): DisallowedOefLinkGroup[] {
  const nodeTypeByElementId = new Map(
    params.draft.nodes.map(node => [node.sourceElementId, node.sourceType])
  )
  const relationshipIds = new Set(params.draft.links.map(link => link.sourceRelationshipId))
  const groups = new Map<string, DisallowedOefLinkGroup>()

  for (const link of params.draft.links) {
    if (relationshipIds.has(link.sourceElementId) || relationshipIds.has(link.targetElementId)) {
      continue
    }
    const sourceElementType = nodeTypeByElementId.get(link.sourceElementId)
    const targetElementType = nodeTypeByElementId.get(link.targetElementId)
    if (!sourceElementType || !targetElementType) continue

    const sourceMapped = params.mapping.elementTypeMap[sourceElementType]
    const targetMapped = params.mapping.elementTypeMap[targetElementType]
    const relMapped = params.mapping.relationshipTypeMap[link.sourceType]
    if (
      !sourceMapped?.componentId ||
      !targetMapped?.componentId ||
      !relMapped?.relationId ||
      !relMapped.linkTypeId
    ) {
      continue
    }

    if (
      isOefLinkAllowedByRelationRules({
        fromComponentId: sourceMapped.componentId,
        toComponentId: targetMapped.componentId,
        relationId: relMapped.relationId,
        relationRules: params.relationRules,
      })
    ) {
      continue
    }

    const key = buildDisallowedOefLinkGroupKey({
      sourceElementType,
      targetElementType,
      relationshipType: link.sourceType,
      relationId: relMapped.relationId,
      fromComponentId: sourceMapped.componentId,
      toComponentId: targetMapped.componentId,
    })
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      existing.sourceRelationshipIds.push(link.sourceRelationshipId)
      continue
    }
    groups.set(key, {
      key,
      count: 1,
      sourceRelationshipIds: [link.sourceRelationshipId],
      relationshipType: link.sourceType,
      sourceElementType,
      targetElementType,
      relationId: relMapped.relationId,
      fromComponentId: sourceMapped.componentId,
      toComponentId: targetMapped.componentId,
    })
  }

  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
}
