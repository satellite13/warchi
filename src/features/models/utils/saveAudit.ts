import type { EditorDiagram, EditorLink, EditorNode, ModelEditorState } from '../types'
import { isDiagramOnlyEdgeModelLinkId, isDiagramOnlyVisualInstance } from './diagramOnlyInstances'

/**
 * Pre-save audit of the model graph. Runs after the canvas and tree are flushed,
 * before the batch-save request is sent. Blocking issues keep the editor from
 * saving until the user resolves them in the SaveAuditModal; warnings may be
 * saved anyway.
 *
 * Checks:
 *  - duplicate node names among siblings (same parent)
 *  - auto-created conflict (a manual node caught the name of an auto-created one)
 *  - duplicate links (parallel edges: same source+target+type)
 *  - tree cycles (a node is its own ancestor via parentNodeId)
 *  - broken link refs (link endpoint is deleted / missing)
 *  - stale diagram instances (instance points to a deleted / missing entity)
 *
 * The auto-created conflict keeps the auto-created (sync-owned) node as the
 * canonical element and drops the manual duplicate, re-binding its links and
 * diagram instances to the auto-created node.
 */

export type SaveAuditSeverity = 'block' | 'warn'

export type SaveAuditFix =
  | { kind: 'deleteNodes'; nodeIds: string[] }
  | { kind: 'deleteLinks'; linkIds: string[] }
  | { kind: 'renameNode'; nodeId: string; toName: string }
  | { kind: 'reuseAutoCreated'; keepNodeId: string; dropNodeId: string }
  | { kind: 'reparentNode'; nodeId: string; newParentNodeId: string | null }
  | {
      kind: 'dropStaleInstances'
      diagramId: string
      nodeInstanceIds: string[]
      edgeInstanceIds: string[]
    }

export type SaveAuditIssue = {
  id: string
  kind:
    | 'duplicateNodeName'
    | 'autoCreatedConflict'
    | 'duplicateLink'
    | 'treeCycle'
    | 'brokenLinkRef'
    | 'staleDiagramInstance'
  severity: SaveAuditSeverity
  messageKey: string
  params?: Record<string, unknown>
  entityIds: string[]
  fix: SaveAuditFix | null
}

export type SaveAuditResult = {
  issues: SaveAuditIssue[]
  blocked: boolean
  blockingCount: number
}

const normalizeName = (name: string): string =>
  String(name ?? '')
    .trim()
    .toLocaleLowerCase()

export const isAutoCreatedNode = (node: EditorNode | null | undefined): boolean => {
  if (!node) return false
  const dpc = node.parsedAttrs.dpc as { autoCreated?: boolean } | undefined
  if (dpc?.autoCreated === true) return true
  const typeProperties = node.parsedAttrs.typeProperties as { autoCreated?: boolean } | undefined
  return typeProperties?.autoCreated === true
}

let idCounter = 0
const nextId = (): string => `audit-${Date.now()}-${idCounter++}`

const issue = (
  partial: Omit<SaveAuditIssue, 'id' | 'severity'>,
  severity: SaveAuditSeverity
): SaveAuditIssue => ({ id: nextId(), ...partial, severity })

const collectDuplicateNodeNameIssues = (
  nodes: EditorNode[],
  conflictManualIds: ReadonlySet<string>,
  touchedNodeIds: ReadonlySet<string>
): SaveAuditIssue[] => {
  const live = nodes.filter(n => !n._isDeleted && !conflictManualIds.has(n.id))
  const issues: SaveAuditIssue[] = []
  for (const node of live) {
    if (!touchedNodeIds.has(node.id)) continue
    const norm = normalizeName(node.name)
    if (!norm) continue
    const peers = live.filter(
      o =>
        o.id !== node.id &&
        (o.parentNodeId ?? null) === (node.parentNodeId ?? null) &&
        normalizeName(o.name) === norm
    )
    if (peers.length === 0) continue
    issues.push(
      issue(
        {
          kind: 'duplicateNodeName',
          messageKey: 'models.saveAudit.duplicateNodeName',
          params: { name: node.name, count: peers.length + 1 },
          entityIds: [node.id],
          fix: { kind: 'deleteNodes', nodeIds: [node.id] },
        },
        'block'
      )
    )
  }
  return issues
}

/**
 * True when the node sits under an "Archive" folder along its ancestor chain.
 * The org-tree-sync parks stale auto-created elements in an "Archive" folder, so
 * an auto-created survivor candidate that lives in Archive is a stale copy and
 * must not win over a live (non-archived) sibling.
 */
const isNodeInArchive = (node: EditorNode, byId: Map<string, EditorNode>): boolean => {
  const visited = new Set<string>()
  let cur: EditorNode | undefined = node
  while (cur?.parentNodeId) {
    if (visited.has(cur.id)) return false
    visited.add(cur.id)
    cur = byId.get(cur.parentNodeId)
    if (cur && normalizeName(cur.name) === normalizeName('Archive')) return true
  }
  return false
}

const pickCanonicalAutoCreated = (
  auto: EditorNode[],
  byId: Map<string, EditorNode>
): EditorNode => {
  const live = auto.find(n => !isNodeInArchive(n, byId))
  return live ?? auto[0]!
}

/** Collapses case/separators: "P0860 - QCMS" / "p0860 qcms" -> "p0860 qcms". */
const normalizeForMatch = (value: string): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenSetOf = (value: string): Set<string> => new Set(normalizeForMatch(value).split(' '))

type AutoCreatedIdentity = {
  /** Normalized sync id, e.g. 'p0860'. */
  id: string
  /** Display-name tokens without the id token, e.g. { 'qcms' }. */
  namePart: Set<string>
}

const autoCreatedIdentity = (node: EditorNode): AutoCreatedIdentity => {
  const dpc = node.parsedAttrs.dpc as { kind?: string; id?: string } | undefined
  const id = dpc?.id ? normalizeForMatch(String(dpc.id)) : ''
  const nameTokens = tokenSetOf(node.name)
  const namePart = new Set([...nameTokens].filter(t => t !== id))
  return { id, namePart }
}

/**
 * A manual node matches an auto-created element when it means the same thing:
 *  - the full name matches after normalization ("P0860 - QCMS" ~ "p0860 qcms"), or
 *  - it is named after the sync id ("p0860"), or
 *  - it is named after the display-name part ("QCMS", "P0860 - QCMS").
 */
const autoCreatedMatchesNode = (auto: EditorNode, manual: EditorNode): boolean => {
  const manualNorm = normalizeForMatch(manual.name)
  if (!manualNorm) return false
  const autoNorm = normalizeForMatch(auto.name)
  if (manualNorm === autoNorm) return true

  const autoIdentity = autoCreatedIdentity(auto)
  const manualTokens = tokenSetOf(manual.name)
  // Match by the sync id ("p0860").
  if (autoIdentity.id && manualTokens.has(autoIdentity.id)) return true

  // Match by the display name: "QCMS" alone, or "p0860 qcms" (id + name).
  const namePart = autoIdentity.namePart
  const sameTokens = (expected: Set<string>): boolean =>
    expected.size > 0 &&
    expected.size === manualTokens.size &&
    [...expected].every(t => manualTokens.has(t))
  if (sameTokens(namePart)) return true
  const expected = new Set([...namePart, autoIdentity.id].filter(Boolean))
  return sameTokens(expected)
}

const collectAutoCreatedConflictIssues = (
  nodes: EditorNode[],
  touchedNodeIds: ReadonlySet<string>
): { issues: SaveAuditIssue[]; manualIds: Set<string> } => {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const autoNodes = nodes.filter(isAutoCreatedNode)
  const manualNodes = nodes.filter(
    n => !isAutoCreatedNode(n) && !n._isDeleted && touchedNodeIds.has(n.id)
  )

  const issues: SaveAuditIssue[] = []
  const manualIds = new Set<string>()
  for (const manual of manualNodes) {
    const matches = autoNodes.filter(auto => autoCreatedMatchesNode(auto, manual))
    if (matches.length === 0) continue
    const canonical = pickCanonicalAutoCreated(matches, byId)
    manualIds.add(manual.id)
    issues.push(
      issue(
        {
          kind: 'autoCreatedConflict',
          messageKey: 'models.saveAudit.autoCreatedConflict',
          params: { name: manual.name, keepName: canonical.name },
          entityIds: [manual.id, canonical.id],
          fix: { kind: 'reuseAutoCreated', keepNodeId: canonical.id!, dropNodeId: manual.id },
        },
        'block'
      )
    )
  }
  return { issues, manualIds }
}

const collectDuplicateLinkIssues = (
  links: EditorLink[],
  touchedLinkIds: ReadonlySet<string>
): SaveAuditIssue[] => {
  const live = links.filter(l => !l._isDeleted)
  const issues: SaveAuditIssue[] = []
  for (const link of live) {
    if (!touchedLinkIds.has(link.id)) continue
    const key = `${link.sourceId}::${link.targetId}::${link.linkTypeId}`
    const peers = live.filter(
      l => l.id !== link.id && `${l.sourceId}::${l.targetId}::${l.linkTypeId}` === key
    )
    if (peers.length === 0) continue
    issues.push(
      issue(
        {
          kind: 'duplicateLink',
          messageKey: 'models.saveAudit.duplicateLink',
          params: { count: peers.length + 1 },
          entityIds: [link.id],
          fix: { kind: 'deleteLinks', linkIds: [link.id] },
        },
        'block'
      )
    )
  }
  return issues
}

const collectTreeCycleIssues = (
  nodes: EditorNode[],
  touchedNodeIds: ReadonlySet<string>
): SaveAuditIssue[] => {
  const live = nodes.filter(n => !n._isDeleted)
  const byId = new Map(live.map(n => [n.id, n]))
  const issues: SaveAuditIssue[] = []
  const globalSeen = new Set<string>()

  for (const start of live) {
    if (globalSeen.has(start.id)) continue
    const path: string[] = []
    const localSeen = new Set<string>()
    let current: EditorNode | undefined = start
    let cycleNode: EditorNode | null = null

    while (current) {
      if (localSeen.has(current.id)) {
        cycleNode = current
        break
      }
      localSeen.add(current.id)
      path.push(current.id)
      current = current.parentNodeId ? byId.get(current.parentNodeId) : undefined
    }

    for (const id of path) globalSeen.add(id)
    if (!cycleNode) continue

    const closing = live.find(n => n.id === cycleNode!.id) ?? start
    // Only surface a cycle the user actually touched — an untouched inherited
    // cycle must not block a save that is unrelated to it.
    if (![...path, closing.id].some(id => touchedNodeIds.has(id))) continue
    issues.push(
      issue(
        {
          kind: 'treeCycle',
          messageKey: 'models.saveAudit.treeCycle',
          params: { name: closing.name },
          entityIds: [...path, closing.id],
          fix: { kind: 'reparentNode', nodeId: closing.id, newParentNodeId: null },
        },
        'block'
      )
    )
  }
  return issues
}

const collectBrokenLinkIssues = (
  links: EditorLink[],
  liveNodeIds: ReadonlySet<string>,
  touchedLinkIds: ReadonlySet<string>
): SaveAuditIssue[] => {
  const issues: SaveAuditIssue[] = []
  for (const link of links) {
    if (link._isDeleted) continue
    if (!touchedLinkIds.has(link.id)) continue
    if (liveNodeIds.has(link.sourceId) && liveNodeIds.has(link.targetId)) continue
    issues.push(
      issue(
        {
          kind: 'brokenLinkRef',
          messageKey: 'models.saveAudit.brokenLinkRef',
          params: {
            name: link.linkTypeId,
            hasSource: liveNodeIds.has(link.sourceId),
            hasTarget: liveNodeIds.has(link.targetId),
          },
          entityIds: [link.id],
          fix: { kind: 'deleteLinks', linkIds: [link.id] },
        },
        'block'
      )
    )
  }
  return issues
}

const collectStaleInstanceIssues = (
  diagrams: EditorDiagram[],
  liveNodeIds: ReadonlySet<string>,
  liveLinkIds: ReadonlySet<string>,
  touchedDiagramIds: ReadonlySet<string>
): SaveAuditIssue[] => {
  const issues: SaveAuditIssue[] = []
  for (const diagram of diagrams) {
    if (diagram._isDeleted || diagram._attrsPending) continue
    if (!touchedDiagramIds.has(diagram.id)) continue
    const nodeInstances = diagram.parsedAttrs.instances.nodes
    const edgeInstances = diagram.parsedAttrs.instances.edges
    const staleNodes = nodeInstances.filter(
      inst => !isDiagramOnlyVisualInstance(inst) && !liveNodeIds.has(inst.modelNodeId)
    )
    const staleEdges = edgeInstances.filter(
      inst =>
        !(inst.attrs?.isDiagramOnly === true || isDiagramOnlyEdgeModelLinkId(inst.modelLinkId)) &&
        !liveLinkIds.has(inst.modelLinkId)
    )
    if (staleNodes.length === 0 && staleEdges.length === 0) continue
    issues.push(
      issue(
        {
          kind: 'staleDiagramInstance',
          messageKey: 'models.saveAudit.staleDiagramInstance',
          params: { name: diagram.name, count: staleNodes.length + staleEdges.length },
          entityIds: [diagram.id],
          fix: {
            kind: 'dropStaleInstances',
            diagramId: diagram.id,
            nodeInstanceIds: staleNodes.map(i => i.id),
            edgeInstanceIds: staleEdges.map(i => i.id),
          },
        },
        'block'
      )
    )
  }
  return issues
}

export function runModelSaveAudit(state: ModelEditorState): SaveAuditResult {
  const liveNodes = state.nodes.filter(n => !n._isDeleted)
  const liveLinks = state.links.filter(l => !l._isDeleted)
  const liveNodeIds = new Set(liveNodes.map(n => n.id))
  const liveLinkIds = new Set(liveLinks.map(l => l.id))

  // Only entities the user changed in this session are audited, so e.g. adding a
  // node does not get blocked by pre-existing issues elsewhere in the model.
  const touchedNodeIds = new Set(
    state.nodes.filter(n => (n._isNew || n._isDirty) && !n._isDeleted).map(n => n.id)
  )
  const touchedLinkIds = new Set(
    state.links.filter(l => (l._isNew || l._isDirty) && !l._isDeleted).map(l => l.id)
  )
  const touchedDiagramIds = new Set(
    state.diagrams.filter(d => (d._isNew || d._isDirty) && !d._isDeleted).map(d => d.id)
  )

  const { issues: autoConflictIssues, manualIds } = collectAutoCreatedConflictIssues(
    liveNodes,
    touchedNodeIds
  )
  const issues: SaveAuditIssue[] = [
    ...autoConflictIssues,
    ...collectDuplicateNodeNameIssues(liveNodes, manualIds, touchedNodeIds),
    ...collectDuplicateLinkIssues(liveLinks, touchedLinkIds),
    ...collectTreeCycleIssues(liveNodes, touchedNodeIds),
    ...collectBrokenLinkIssues(state.links, liveNodeIds, touchedLinkIds),
    ...collectStaleInstanceIssues(state.diagrams, liveNodeIds, liveLinkIds, touchedDiagramIds),
  ]

  const blockingCount = issues.filter(i => i.severity === 'block').length
  return { issues, blocked: blockingCount > 0, blockingCount }
}

const setNodeDirty = (node: EditorNode): void => {
  if (!node._isNew) node._isDirty = true
}

const rebindNodeId = (state: ModelEditorState, toId: string, fromId: string): void => {
  for (const link of state.links) {
    if (link._isDeleted) continue
    let changed = false
    if (link.sourceId === fromId) {
      link.sourceId = toId
      changed = true
    }
    if (link.targetId === fromId) {
      link.targetId = toId
      changed = true
    }
    if (changed) setNodeLinkDirty(link)
  }
  for (const diagram of state.diagrams) {
    if (diagram._isDeleted) continue
    let changed = false
    for (const inst of diagram.parsedAttrs.instances.nodes) {
      if (inst.modelNodeId === fromId) {
        inst.modelNodeId = toId
        changed = true
      }
    }
    if (changed) diagram._isDirty = true
  }
}

const setNodeLinkDirty = (link: EditorLink): void => {
  if (!link._isNew) link._isDirty = true
}

export function applySaveAuditFix(state: ModelEditorState, fix: SaveAuditFix): void {
  switch (fix.kind) {
    case 'deleteNodes': {
      for (const nodeId of fix.nodeIds) {
        const node = state.nodes.find(n => n.id === nodeId)
        if (node) node._isDeleted = true
      }
      break
    }
    case 'deleteLinks': {
      for (const linkId of fix.linkIds) {
        const link = state.links.find(l => l.id === linkId)
        if (link) link._isDeleted = true
      }
      break
    }
    case 'renameNode': {
      const node = state.nodes.find(n => n.id === fix.nodeId)
      if (node && node.name !== fix.toName) {
        node.name = fix.toName
        setNodeDirty(node)
      }
      break
    }
    case 'reuseAutoCreated': {
      rebindNodeId(state, fix.keepNodeId, fix.dropNodeId)
      const drop = state.nodes.find(n => n.id === fix.dropNodeId)
      if (drop) drop._isDeleted = true
      break
    }
    case 'reparentNode': {
      const node = state.nodes.find(n => n.id === fix.nodeId)
      if (node && node.parentNodeId !== fix.newParentNodeId) {
        node.parentNodeId = fix.newParentNodeId
        setNodeDirty(node)
      }
      break
    }
    case 'dropStaleInstances': {
      const diagram = state.diagrams.find(d => d.id === fix.diagramId)
      if (!diagram) break
      const nodeKeep = new Set(fix.nodeInstanceIds)
      const edgeKeep = new Set(fix.edgeInstanceIds)
      const nodesBefore = diagram.parsedAttrs.instances.nodes.length
      const edgesBefore = diagram.parsedAttrs.instances.edges.length
      diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
        inst => !nodeKeep.has(inst.id)
      )
      diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
        inst => !edgeKeep.has(inst.id)
      )
      if (
        diagram.parsedAttrs.instances.nodes.length !== nodesBefore ||
        diagram.parsedAttrs.instances.edges.length !== edgesBefore
      ) {
        diagram._isDirty = true
      }
      break
    }
  }
}
