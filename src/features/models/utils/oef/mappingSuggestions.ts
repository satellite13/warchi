import type {
  ComponentResponse,
  LinkTypeResponse,
  NodeTypeResponse,
  RelationResponse,
} from '@/types/api'

type SuggestionKind = 'element' | 'relationship'

export type MappingSuggestion = {
  sourceType: string
  kind: SuggestionKind
  score: number
  reason: 'exact' | 'token-overlap' | 'partial'
  nodeTypeId?: string
  componentId?: string
  linkTypeId?: string
  relationId?: string
}

export type ImportMappingSuggestions = {
  elementBySourceType: Record<string, MappingSuggestion[]>
  relationshipBySourceType: Record<string, MappingSuggestion[]>
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function tokenize(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
}

function tokenOverlapScore(a: string, b: string): number {
  const aTokens = new Set(tokenize(a))
  const bTokens = new Set(tokenize(b))
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  let matches = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) matches += 1
  }
  return matches / Math.max(aTokens.size, bTokens.size)
}

function scoreCandidate(sourceType: string, candidateTexts: string[]): { score: number; reason: MappingSuggestion['reason'] } {
  const sourceNorm = normalize(sourceType)
  const candidateNorms = candidateTexts.map(normalize)
  if (candidateNorms.some(item => item === sourceNorm)) {
    return { score: 1, reason: 'exact' }
  }

  const tokenScores = candidateTexts.map(text => tokenOverlapScore(sourceType, text))
  const maxToken = tokenScores.length > 0 ? Math.max(...tokenScores) : 0
  if (maxToken >= 0.99) return { score: 0.9, reason: 'token-overlap' }
  if (maxToken >= 0.5) return { score: 0.6 + maxToken * 0.25, reason: 'token-overlap' }

  const partial = candidateNorms.some(item => item.includes(sourceNorm) || sourceNorm.includes(item))
  if (partial) return { score: 0.55, reason: 'partial' }
  return { score: 0, reason: 'partial' }
}

export function buildImportMappingSuggestions(params: {
  sourceElementTypes: string[]
  sourceRelationshipTypes: string[]
  notationId: string
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
  components: ComponentResponse[]
  relations: RelationResponse[]
  minScore?: number
}): ImportMappingSuggestions {
  const minScore = params.minScore ?? 0.35
  const nodeTypesById = new Map(params.nodeTypes.map(item => [item.id, item]))
  const linkTypesById = new Map(params.linkTypes.map(item => [item.id, item]))

  const elementCandidates = params.components
    .filter(item => item.notationId === params.notationId)
    .map(component => {
      const nodeType = nodeTypesById.get(component.nodeTypeId)
      return {
        component,
        nodeType,
        texts: [component.name, nodeType?.name ?? ''].filter(Boolean),
      }
    })

  const relationshipCandidates = params.relations
    .filter(item => item.notationId === params.notationId)
    .map(relation => {
      const linkType = linkTypesById.get(relation.linkTypeId)
      return {
        relation,
        linkType,
        texts: [relation.name, linkType?.name ?? ''].filter(Boolean),
      }
    })

  const elementBySourceType: Record<string, MappingSuggestion[]> = {}
  const relationshipBySourceType: Record<string, MappingSuggestion[]> = {}

  for (const sourceType of params.sourceElementTypes) {
    const scored = elementCandidates
      .map(candidate => {
        const { score, reason } = scoreCandidate(sourceType, candidate.texts)
        return {
          sourceType,
          kind: 'element' as const,
          score,
          reason,
          nodeTypeId: candidate.component.nodeTypeId,
          componentId: candidate.component.id,
        }
      })
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
    elementBySourceType[sourceType] = scored
  }

  for (const sourceType of params.sourceRelationshipTypes) {
    const scored = relationshipCandidates
      .map(candidate => {
        const { score, reason } = scoreCandidate(sourceType, candidate.texts)
        return {
          sourceType,
          kind: 'relationship' as const,
          score,
          reason,
          linkTypeId: candidate.relation.linkTypeId,
          relationId: candidate.relation.id,
        }
      })
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
    relationshipBySourceType[sourceType] = scored
  }

  return {
    elementBySourceType,
    relationshipBySourceType,
  }
}
