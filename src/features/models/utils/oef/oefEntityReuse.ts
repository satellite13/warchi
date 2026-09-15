import type { EditorDiagram, EditorLink, EditorNode } from '../../types'
import { normalizeOefNodeName } from './oefEntityName'
import type { ImportMappingState } from './mappingState'
import type { OefReuseSettings } from './reuseSettings'
import type { ImportDraft } from './types'

export type OefResolvedAction = 'create' | 'reuse' | 'update'

export type OefNodeResolution = { action: OefResolvedAction; id?: string }
export type OefLinkResolution = { action: OefResolvedAction; id?: string }

export type OefReuseWarningCode =
  | 'nodeMatchAmbiguous'
  | 'linkMatchAmbiguous'
  | 'linkLabelConflict'
  | 'linkMatchedIgnoringLabel'
  | 'nodeAutoMergedFromDecision'

export type OefReuseWarning = {
  code: OefReuseWarningCode
  sourceId: string
  message: string
  candidateIds?: string[]
}

export type OefReuseSummary = {
  nodes: { create: number; reuse: number; update: number; ambiguous: number }
  links: { create: number; reuse: number; update: number; ambiguous: number }
}

export type OefEntityMatchResult = {
  nodes: Record<string, OefNodeResolution>
  links: Record<string, OefLinkResolution>
  warnings: OefReuseWarning[]
  summary: OefReuseSummary
}

function emptySummary(): OefReuseSummary {
  return {
    nodes: { create: 0, reuse: 0, update: 0, ambiguous: 0 },
    links: { create: 0, reuse: 0, update: 0, ambiguous: 0 },
  }
}

function bump(summary: OefReuseSummary, kind: 'nodes' | 'links', action: OefResolvedAction): void {
  summary[kind][action] += 1
}

function compareIdAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Effective edge label for a model link; null means conflicting non-empty labels. */
export function effectiveLinkLabel(
  linkId: string,
  diagrams: EditorDiagram[]
): { label: string | null; conflict: boolean; samples: string[] } {
  const nonEmpty = new Set<string>()
  for (const diagram of diagrams) {
    if (diagram._isDeleted || diagram._attrsPending) continue
    for (const edge of diagram.parsedAttrs.instances.edges) {
      if (edge.modelLinkId !== linkId) continue
      const label = typeof edge.attrs?.label === 'string' ? edge.attrs.label.trim() : ''
      if (label) nonEmpty.add(label)
    }
  }
  if (nonEmpty.size === 0) return { label: '', conflict: false, samples: [] }
  const samples = [...nonEmpty].sort()
  if (nonEmpty.size > 1) return { label: null, conflict: true, samples }
  return { label: samples[0]!, conflict: false, samples }
}

function actionFromPolicy(policy: 'reuseId' | 'updateFromOef'): 'reuse' | 'update' {
  return policy === 'updateFromOef' ? 'update' : 'reuse'
}

export function resolveOefEntityMatches(params: {
  draft: ImportDraft
  mapping: ImportMappingState
  notationId: string
  existingNodes: EditorNode[]
  existingLinks: EditorLink[]
  existingDiagrams: EditorDiagram[]
  settings: OefReuseSettings
  /** Persisted duplicate-merge decisions (OEF entity id → target node id). */
  mergeDecisions?: Record<string, string>
}): OefEntityMatchResult {
  const warnings: OefReuseWarning[] = []
  const summary = emptySummary()
  const nodes: Record<string, OefNodeResolution> = {}
  const links: Record<string, OefLinkResolution> = {}

  const activeNodes = params.existingNodes.filter(node => !node._isDeleted)
  const activeLinks = params.existingLinks.filter(link => !link._isDeleted)
  const activeDiagrams = params.existingDiagrams.filter(diagram => !diagram._isDeleted)

  const activeNodeById = new Map(activeNodes.map(node => [node.id, node]))
  // OEF identity (attrs.oef.entityId) → existing node id: set by previous OEF imports.
  const oefEntityIdByNodeId = new Map<string, string>()
  for (const node of activeNodes) {
    const entityId = node.parsedAttrs.oef?.entityId
    if (entityId) oefEntityIdByNodeId.set(entityId, node.id)
  }

  const activeLinkById = new Map(activeLinks.map(link => [link.id, link]))
  // OEF identity (attrs.oef.entityId) → existing link id: set by previous OEF imports.
  const oefLinkEntityIdToLinkId = new Map<string, string>()
  for (const link of activeLinks) {
    const entityId = link.parsedAttrs.oef?.entityId
    if (entityId && !oefLinkEntityIdToLinkId.has(entityId)) {
      oefLinkEntityIdToLinkId.set(entityId, link.id)
    }
  }

  const resolvedNodeRealIds = new Map<string, string>()

  for (const draftNode of params.draft.nodes) {
    const mapped = params.mapping.elementTypeMap[draftNode.sourceType]
    if (!mapped?.nodeTypeId || !mapped.componentId) {
      // Unmapped — build path skips; no resolution entry needed for reuse.
      continue
    }

    // 1. Persisted merge decision wins unconditionally (even when reuse is disabled):
    //    this entity was already merged into an existing node by a previous validation
    //    run — never create a duplicate again.
    // 2. OEF identity (attrs.oef.entityId from a previous import) beats name matching
    //    but only when the user opted into reuse.
    const decisionTarget = params.mergeDecisions?.[draftNode.sourceElementId]
    if (decisionTarget != null && activeNodeById.has(decisionTarget)) {
      const action = actionFromPolicy(params.settings.onNodeMatch)
      nodes[draftNode.sourceElementId] = { action, id: decisionTarget }
      resolvedNodeRealIds.set(draftNode.sourceElementId, decisionTarget)
      bump(summary, 'nodes', action)
      warnings.push({
        code: 'nodeAutoMergedFromDecision',
        sourceId: draftNode.sourceElementId,
        message: `Entity "${draftNode.sourceElementId}" merged into existing node by a saved decision`,
        candidateIds: [decisionTarget],
      })
      continue
    }

    if (params.settings.nodesMode !== 'reuseMatching') {
      nodes[draftNode.sourceElementId] = { action: 'create' }
      bump(summary, 'nodes', 'create')
      continue
    }

    const identityTarget = oefEntityIdByNodeId.get(draftNode.sourceElementId)
    if (identityTarget != null && activeNodeById.has(identityTarget)) {
      const action = actionFromPolicy(params.settings.onNodeMatch)
      nodes[draftNode.sourceElementId] = { action, id: identityTarget }
      resolvedNodeRealIds.set(draftNode.sourceElementId, identityTarget)
      bump(summary, 'nodes', action)
      continue
    }

    const normalizedName = normalizeOefNodeName(draftNode.name)
    if (!normalizedName) {
      nodes[draftNode.sourceElementId] = { action: 'create' }
      bump(summary, 'nodes', 'create')
      continue
    }

    const candidates = activeNodes
      .filter(candidate => {
        if (trimName(candidate.name) !== normalizedName) return false
        if (candidate.nodeTypeId !== mapped.nodeTypeId) return false
        const binding = candidate.parsedAttrs.notationComponents[params.notationId]?.componentId
        if (binding && binding !== mapped.componentId) return false
        return true
      })
      .map(candidate => candidate.id)
      .sort(compareIdAsc)

    if (candidates.length === 0) {
      nodes[draftNode.sourceElementId] = { action: 'create' }
      bump(summary, 'nodes', 'create')
      continue
    }

    if (candidates.length > 1) {
      summary.nodes.ambiguous += 1
      warnings.push({
        code: 'nodeMatchAmbiguous',
        sourceId: draftNode.sourceElementId,
        message: `Multiple existing nodes match "${normalizedName}"; using ${candidates[0]}`,
        candidateIds: candidates,
      })
    }

    const id = candidates[0]!
    const action = actionFromPolicy(params.settings.onNodeMatch)
    nodes[draftNode.sourceElementId] = { action, id }
    resolvedNodeRealIds.set(draftNode.sourceElementId, id)
    bump(summary, 'nodes', action)
  }

  for (const draftLink of params.draft.links) {
    const mapped = params.mapping.relationshipTypeMap[draftLink.sourceType]
    if (!mapped?.linkTypeId || !mapped.relationId) {
      continue
    }

    if (params.settings.linksMode !== 'reuseMatching') {
      links[draftLink.sourceRelationshipId] = { action: 'create' }
      bump(summary, 'links', 'create')
      continue
    }

    // 1. Saved merge decision wins unconditionally (like nodes).
    const decisionTarget = params.mergeDecisions?.[draftLink.sourceRelationshipId]
    if (decisionTarget != null && activeLinkById.has(decisionTarget)) {
      const action = actionFromPolicy(params.settings.onLinkMatch)
      links[draftLink.sourceRelationshipId] = { action, id: decisionTarget }
      bump(summary, 'links', action)
      warnings.push({
        code: 'nodeAutoMergedFromDecision',
        sourceId: draftLink.sourceRelationshipId,
        message: `Relationship "${draftLink.sourceRelationshipId}" merged into existing link by a saved decision`,
        candidateIds: [decisionTarget],
      })
      continue
    }

    // 2. OEF identity (attrs.oef.entityId from a previous import) beats endpoint matching
    //    and survives endpoint drift between exports.
    const identityTarget = oefLinkEntityIdToLinkId.get(draftLink.sourceRelationshipId)
    if (identityTarget != null && activeLinkById.has(identityTarget)) {
      const action = actionFromPolicy(params.settings.onLinkMatch)
      links[draftLink.sourceRelationshipId] = { action, id: identityTarget }
      bump(summary, 'links', action)
      continue
    }

    const sourceRealId = resolvedNodeRealIds.get(draftLink.sourceElementId)
    const targetRealId = resolvedNodeRealIds.get(draftLink.targetElementId)
    if (!sourceRealId || !targetRealId) {
      // At least one endpoint is create/unmapped — cannot reuse existing link.
      links[draftLink.sourceRelationshipId] = { action: 'create' }
      bump(summary, 'links', 'create')
      continue
    }

    const oefLabel = (draftLink.name ?? '').trim()
    const collectCandidates = (
      requireLabelMatch: boolean
    ): { ids: string[]; conflicts: Array<{ id: string; samples: string[] }> } => {
      const ids: string[] = []
      const conflicts: Array<{ id: string; samples: string[] }> = []
      for (const candidate of activeLinks) {
        if (candidate.sourceId !== sourceRealId || candidate.targetId !== targetRealId) continue
        if (candidate.linkTypeId !== mapped.linkTypeId) continue
        const relationBinding =
          candidate.parsedAttrs.notationRelations[params.notationId]?.relationId
        if (relationBinding && relationBinding !== mapped.relationId) continue

        if (params.settings.linkMatchCriterion === 'endpointsTypeAndLabel' && requireLabelMatch) {
          const effective = effectiveLinkLabel(candidate.id, activeDiagrams)
          if (effective.conflict) {
            conflicts.push({ id: candidate.id, samples: effective.samples })
            continue
          }
          if (oefLabel !== (effective.label ?? '')) continue
        }

        ids.push(candidate.id)
      }
      return { ids, conflicts }
    }

    const strict = collectCandidates(true)
    for (const conflict of strict.conflicts) {
      warnings.push({
        code: 'linkLabelConflict',
        sourceId: draftLink.sourceRelationshipId,
        message: `Existing link ${conflict.id} has conflicting edge labels: ${conflict.samples.join(', ')}`,
        candidateIds: [conflict.id],
      })
    }

    // Legacy links created before edge labels were persisted carry no label on
    // their diagram edges. Fall back to endpoints+type matching so such links
    // are reused (and their canvases refreshed) instead of re-created forever.
    let candidates = strict.ids
    if (candidates.length === 0 && strict.conflicts.length === 0) {
      const fallback = collectCandidates(false)
      if (fallback.ids.length > 0) {
        warnings.push({
          code: 'linkMatchedIgnoringLabel',
          sourceId: draftLink.sourceRelationshipId,
          message: `Link "${draftLink.sourceRelationshipId}" matched by endpoints ignoring label (existing edge label differs)`,
          candidateIds: fallback.ids,
        })
        candidates = fallback.ids
      }
    }

    candidates.sort(compareIdAsc)

    if (candidates.length === 0) {
      links[draftLink.sourceRelationshipId] = { action: 'create' }
      bump(summary, 'links', 'create')
      continue
    }

    if (candidates.length > 1) {
      summary.links.ambiguous += 1
      warnings.push({
        code: 'linkMatchAmbiguous',
        sourceId: draftLink.sourceRelationshipId,
        message: `Multiple existing links match; using ${candidates[0]}`,
        candidateIds: candidates,
      })
    }

    const id = candidates[0]!
    const action = actionFromPolicy(params.settings.onLinkMatch)
    links[draftLink.sourceRelationshipId] = { action, id }
    bump(summary, 'links', action)
  }

  return { nodes, links, warnings, summary }
}

function trimName(name: string): string {
  return name.trim()
}
