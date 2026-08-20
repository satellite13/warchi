import type { ApiResult } from '@/composables/useApi'
import { apiPost } from '@/composables/useApi'
import type { DiagramResponse } from '@/types/api'

export type DiagramCopyMatchReason = 'STABLE_ID' | 'NAME_AND_TYPE' | 'ENDPOINTS_AND_TYPE'

export type DiagramCopyResolutionAction = 'MATCH' | 'CREATE' | 'SKIP'

export type DiagramCopyEntityKind = 'NODE' | 'LINK'

export interface DiagramCopyResolution {
  sourceId: string
  action: DiagramCopyResolutionAction
  targetId?: string | null
  kind: DiagramCopyEntityKind
}

export interface DiagramCopyPreviewRequest {
  sourceDiagramId: string
  targetNotationId: string
  resolutions?: DiagramCopyResolution[]
}

export interface DiagramCopyCommitRequest {
  sourceDiagramId: string
  targetNotationId: string
  name: string
  version: string
  nodeId?: string | null
  createParentNodeId?: string | null
  resolutions: DiagramCopyResolution[]
}

export interface DiagramCopyCandidate {
  id: string
  label: string
  stableId: string | null
  typeId: string | null
}

export interface DiagramCopyEntityPreview {
  sourceId: string
  kind: DiagramCopyEntityKind
  label: string
  stableId: string | null
  typeId: string | null
  autoMatchTargetId: string | null
  autoMatchReason: DiagramCopyMatchReason | null
  candidates: DiagramCopyCandidate[]
  effectiveAction: DiagramCopyResolutionAction | null
  effectiveTargetId: string | null
  isEndpointOfEdge: boolean
}

export interface DiagramCopyEdgeBlocker {
  edgeInstanceId: string
  modelLinkId: string | null
  sourceModelNodeId: string | null
  targetModelNodeId: string | null
  code?: string | null
  reason: string
}

export interface DiagramCopyNotationRemapReport {
  mappedComponents: number
  unmappedComponents: string[]
  mappedRelations: number
  unmappedRelations: string[]
}

export interface DiagramCopyWarning {
  code: string
  message: string
}

export interface DiagramCopyPreviewResponse {
  sourceDiagramId: string
  sourceDiagramName: string
  sourceDiagramVersion: string
  suggestedName: string
  suggestedVersion: string
  nodes: DiagramCopyEntityPreview[]
  links: DiagramCopyEntityPreview[]
  blockers: DiagramCopyEdgeBlocker[]
  notationRemap: DiagramCopyNotationRemapReport
  warnings: DiagramCopyWarning[]
  canCommit: boolean
}

export interface DiagramCopyCommitResponse {
  diagram: DiagramResponse
  createdNodeIds: string[]
  createdLinkIds: string[]
}

export async function previewDiagramCopy(
  targetModelId: string,
  body: DiagramCopyPreviewRequest
): Promise<ApiResult<DiagramCopyPreviewResponse>> {
  return apiPost<DiagramCopyPreviewResponse>(
    `/models/${encodeURIComponent(targetModelId)}/diagram-copies/preview`,
    body
  )
}

export async function commitDiagramCopy(
  targetModelId: string,
  body: DiagramCopyCommitRequest
): Promise<ApiResult<DiagramCopyCommitResponse>> {
  return apiPost<DiagramCopyCommitResponse>(
    `/models/${encodeURIComponent(targetModelId)}/diagram-copies/commit`,
    body
  )
}

/** Prefer the source diagram's notation when it is still in the catalog. */
export function canMatchDiagramCopyEntity(
  entity: Pick<DiagramCopyEntityPreview, 'candidates' | 'autoMatchTargetId'>
): boolean {
  return entity.candidates.length > 0 || entity.autoMatchTargetId != null
}

export function diagramCopyMatchCandidates(
  entity: DiagramCopyEntityPreview
): DiagramCopyCandidate[] {
  if (entity.candidates.length > 0) return entity.candidates
  if (!entity.autoMatchTargetId) return []
  return [
    {
      id: entity.autoMatchTargetId,
      label: entity.label,
      stableId: entity.stableId,
      typeId: entity.typeId,
    },
  ]
}

export function pickDefaultTargetNotationId(
  availableNotations: ReadonlyArray<{ id: string }>,
  sourceNotationId: string | null | undefined
): string {
  if (sourceNotationId && availableNotations.some(notation => notation.id === sourceNotationId)) {
    return sourceNotationId
  }
  return availableNotations[0]?.id ?? ''
}

export function buildResolutionsFromPreview(
  preview: DiagramCopyPreviewResponse,
  overrides: Map<string, DiagramCopyResolution>,
  options?: { fillUnresolvedWithCreate?: boolean }
): DiagramCopyResolution[] {
  const fillUnresolvedWithCreate = options?.fillUnresolvedWithCreate ?? true
  return [...preview.nodes, ...preview.links].flatMap(entity => {
    const override = overrides.get(entity.sourceId)
    if (override) return [override]

    if (entity.effectiveAction === 'MATCH' && entity.effectiveTargetId) {
      return [
        {
          sourceId: entity.sourceId,
          action: 'MATCH' as const,
          targetId: entity.effectiveTargetId,
          kind: entity.kind,
        },
      ]
    }
    if (entity.effectiveAction === 'CREATE') {
      return [{ sourceId: entity.sourceId, action: 'CREATE' as const, kind: entity.kind }]
    }
    if (entity.effectiveAction === 'SKIP') {
      return [{ sourceId: entity.sourceId, action: 'SKIP' as const, kind: entity.kind }]
    }
    if (!fillUnresolvedWithCreate) return []
    return [{ sourceId: entity.sourceId, action: 'CREATE' as const, kind: entity.kind }]
  })
}
