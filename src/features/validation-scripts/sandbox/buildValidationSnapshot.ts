import type { ScriptEditorDiagram, ScriptEditorState } from './editorStateContract'
import type {
  SnapshotDiagram,
  SnapshotFolder,
  SnapshotLink,
  SnapshotNode,
  SnapshotNotation,
  ValidationSnapshot,
} from './types'

function toPlainRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  } catch {
    return null
  }
}

function toSnapshotDiagram(diagram: ScriptEditorDiagram): SnapshotDiagram {
  const instances = diagram.parsedAttrs?.instances
  const nodeIds = (instances?.nodes ?? [])
    .map((n) => n.modelNodeId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const linkIds = (instances?.edges ?? [])
    .map((e) => e.modelLinkId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return {
    id: diagram.id,
    name: diagram.name,
    version: diagram.version,
    notationId: diagram.notationId,
    nodeIds: [...new Set(nodeIds)],
    linkIds: [...new Set(linkIds)],
  }
}

export function buildValidationSnapshot(input: {
  state: ScriptEditorState
  modelName: string
  modelVersion: string
  openDiagramId: string | null
}): { snapshot: ValidationSnapshot; openDiagramId: string | null } {
  const { state, modelName, modelVersion, openDiagramId } = input
  const activeNodes = state.nodes.filter((n) => !n._isDeleted)
  const activeLinks = state.links.filter((l) => !l._isDeleted)
  const activeDiagrams = state.diagrams.filter((d) => !d._isDeleted)

  const directoryTypeIds = new Set(
    state.nodeTypes.filter((t) => t.name.trim().toLowerCase() === 'directory').map((t) => t.id)
  )

  const folders: SnapshotFolder[] = []
  const nodes: SnapshotNode[] = []
  for (const node of activeNodes) {
    if (directoryTypeIds.has(node.nodeTypeId)) {
      folders.push({
        id: node.id,
        name: node.name,
        parentId: node.parentNodeId ?? null,
      })
      continue
    }
    nodes.push({
      id: node.id,
      name: node.name,
      parentId: node.parentNodeId ?? null,
      nodeTypeId: node.nodeTypeId,
      attrs: toPlainRecord(node.parsedAttrs),
    })
  }

  const links: SnapshotLink[] = activeLinks.map((link) => ({
    id: link.id,
    name: '',
    sourceId: link.sourceId,
    targetId: link.targetId,
    linkTypeId: link.linkTypeId,
    attrs: toPlainRecord(link.parsedAttrs),
  }))

  const diagrams = activeDiagrams.map(toSnapshotDiagram)
  const notationIds = new Set(diagrams.map((d) => d.notationId).filter(Boolean))

  const notations: SnapshotNotation[] = state.notations
    .filter((n) => notationIds.has(n.id))
    .map((notation) => {
      const components = state.components
        .filter((c) => c.notationId === notation.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          notationId: c.notationId,
          nodeTypeId: c.nodeTypeId,
        }))
      const relations = state.relations
        .filter((r) => r.notationId === notation.id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          notationId: r.notationId,
          linkTypeId: r.linkTypeId,
        }))
      const relationIds = new Set(relations.map((r) => r.id))
      const relationRules = state.relationRules
        .filter((rr) => relationIds.has(rr.relationId))
        .map((rr) => ({
          id: rr.id,
          relationId: rr.relationId,
          fromComponentId: rr.fromComponentId,
          toComponentId: rr.toComponentId,
        }))
      return {
        id: notation.id,
        name: notation.name,
        version: notation.version,
        components,
        relations,
        relationRules,
      }
    })

  const nodeTypeIds = new Set(nodes.map((n) => n.nodeTypeId))
  const linkTypeIds = new Set(links.map((l) => l.linkTypeId))
  for (const notation of notations) {
    for (const c of notation.components) nodeTypeIds.add(c.nodeTypeId)
    for (const r of notation.relations) linkTypeIds.add(r.linkTypeId)
  }

  const snapshot: ValidationSnapshot = {
    model: {
      id: state.modelId,
      name: modelName,
      version: modelVersion,
      nodes,
      links,
      folders,
      diagrams,
    },
    notations,
    types: {
      nodeTypes: state.nodeTypes
        .filter((t) => nodeTypeIds.has(t.id))
        .map((t) => ({ id: t.id, name: t.name, attrs: t.attrs ?? null })),
      linkTypes: state.linkTypes
        .filter((t) => linkTypeIds.has(t.id))
        .map((t) => ({ id: t.id, name: t.name, attrs: t.attrs ?? null })),
    },
  }

  const plain = JSON.parse(JSON.stringify(snapshot)) as ValidationSnapshot
  const resolvedOpen =
    openDiagramId && plain.model.diagrams.some((d) => d.id === openDiagramId)
      ? openDiagramId
      : null

  return { snapshot: plain, openDiagramId: resolvedOpen }
}
