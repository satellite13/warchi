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

export function buildResolutionsFromPreview(
  preview: DiagramCopyPreviewResponse,
  overrides: Map<string, DiagramCopyResolution>
): DiagramCopyResolution[] {
  return [...preview.nodes, ...preview.links].map(entity => {
    const override = overrides.get(entity.sourceId)
    if (override) return override

    if (entity.effectiveAction === 'MATCH' && entity.effectiveTargetId) {
      return {
        sourceId: entity.sourceId,
        action: 'MATCH',
        targetId: entity.effectiveTargetId,
        kind: entity.kind,
      }
    }
    if (entity.effectiveAction === 'CREATE') {
      return { sourceId: entity.sourceId, action: 'CREATE', kind: entity.kind }
    }
    if (entity.effectiveAction === 'SKIP') {
      return { sourceId: entity.sourceId, action: 'SKIP', kind: entity.kind }
    }
    return { sourceId: entity.sourceId, action: 'CREATE', kind: entity.kind }
  })
}
