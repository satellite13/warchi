import { loadJson, saveJson } from '@/utils/localStorage'
import type { ImportMappingSuggestions } from './mappingSuggestions'

export type ElementTypeMapping = {
  nodeTypeId: string | null
  componentId: string | null
  score?: number
}

export type RelationshipTypeMapping = {
  linkTypeId: string | null
  relationId: string | null
  score?: number
}

export type ImportMappingState = {
  elementTypeMap: Record<string, ElementTypeMapping>
  relationshipTypeMap: Record<string, RelationshipTypeMapping>
}

type CachedImportMappingState = {
  version: 1
  notationId: string
  elementTypeMap: Record<string, ElementTypeMapping>
  relationshipTypeMap: Record<string, RelationshipTypeMapping>
}

const STORAGE_PREFIX = 'warchi:model-import:oef-mapping'

function storageKey(notationId: string): string {
  return `${STORAGE_PREFIX}:${notationId}`
}

function sanitizeElementMap(
  source: Record<string, ElementTypeMapping> | undefined
): Record<string, ElementTypeMapping> {
  const out: Record<string, ElementTypeMapping> = {}
  if (!source) return out
  for (const [sourceType, mapping] of Object.entries(source)) {
    out[sourceType] = {
      nodeTypeId: typeof mapping.nodeTypeId === 'string' && mapping.nodeTypeId ? mapping.nodeTypeId : null,
      componentId: typeof mapping.componentId === 'string' && mapping.componentId ? mapping.componentId : null,
      score: typeof mapping.score === 'number' && Number.isFinite(mapping.score) ? mapping.score : undefined,
    }
  }
  return out
}

function sanitizeRelationshipMap(
  source: Record<string, RelationshipTypeMapping> | undefined
): Record<string, RelationshipTypeMapping> {
  const out: Record<string, RelationshipTypeMapping> = {}
  if (!source) return out
  for (const [sourceType, mapping] of Object.entries(source)) {
    out[sourceType] = {
      linkTypeId: typeof mapping.linkTypeId === 'string' && mapping.linkTypeId ? mapping.linkTypeId : null,
      relationId: typeof mapping.relationId === 'string' && mapping.relationId ? mapping.relationId : null,
      score: typeof mapping.score === 'number' && Number.isFinite(mapping.score) ? mapping.score : undefined,
    }
  }
  return out
}

export function createInitialImportMappingState(params: {
  sourceElementTypes: string[]
  sourceRelationshipTypes: string[]
  suggestions: ImportMappingSuggestions
  autoSelectThreshold?: number
}): ImportMappingState {
  const threshold = params.autoSelectThreshold ?? 0.85
  const elementTypeMap: Record<string, ElementTypeMapping> = {}
  const relationshipTypeMap: Record<string, RelationshipTypeMapping> = {}

  for (const sourceType of params.sourceElementTypes) {
    const best = params.suggestions.elementBySourceType[sourceType]?.[0]
    if (best && best.score >= threshold && best.nodeTypeId && best.componentId) {
      elementTypeMap[sourceType] = {
        nodeTypeId: best.nodeTypeId,
        componentId: best.componentId,
        score: best.score,
      }
      continue
    }
    elementTypeMap[sourceType] = {
      nodeTypeId: null,
      componentId: null,
    }
  }

  for (const sourceType of params.sourceRelationshipTypes) {
    const best = params.suggestions.relationshipBySourceType[sourceType]?.[0]
    if (best && best.score >= threshold && best.linkTypeId && best.relationId) {
      relationshipTypeMap[sourceType] = {
        linkTypeId: best.linkTypeId,
        relationId: best.relationId,
        score: best.score,
      }
      continue
    }
    relationshipTypeMap[sourceType] = {
      linkTypeId: null,
      relationId: null,
    }
  }

  return { elementTypeMap, relationshipTypeMap }
}

export function loadCachedImportMappingState(notationId: string): ImportMappingState | null {
  const raw = loadJson<CachedImportMappingState>(storageKey(notationId))
  if (!raw || raw.version !== 1 || raw.notationId !== notationId) return null
  return {
    elementTypeMap: sanitizeElementMap(raw.elementTypeMap),
    relationshipTypeMap: sanitizeRelationshipMap(raw.relationshipTypeMap),
  }
}

export function saveCachedImportMappingState(notationId: string, state: ImportMappingState): void {
  const payload: CachedImportMappingState = {
    version: 1,
    notationId,
    elementTypeMap: sanitizeElementMap(state.elementTypeMap),
    relationshipTypeMap: sanitizeRelationshipMap(state.relationshipTypeMap),
  }
  saveJson(storageKey(notationId), payload)
}

export function mergeImportMappingState(
  initial: ImportMappingState,
  cached: ImportMappingState | null
): ImportMappingState {
  if (!cached) return initial
  const elementTypeMap: Record<string, ElementTypeMapping> = {}
  const relationshipTypeMap: Record<string, RelationshipTypeMapping> = {}

  for (const sourceType of Object.keys(initial.elementTypeMap)) {
    elementTypeMap[sourceType] = cached.elementTypeMap[sourceType] ?? initial.elementTypeMap[sourceType]!
  }
  for (const sourceType of Object.keys(initial.relationshipTypeMap)) {
    relationshipTypeMap[sourceType] =
      cached.relationshipTypeMap[sourceType] ?? initial.relationshipTypeMap[sourceType]!
  }

  return { elementTypeMap, relationshipTypeMap }
}
