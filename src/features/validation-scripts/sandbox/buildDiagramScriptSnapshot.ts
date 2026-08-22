import type { EditorDiagram, ModelEditorState } from '@/features/models/types'
import type {
  SnapshotDiagram,
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

function toOpenSnapshotDiagram(diagram: EditorDiagram): SnapshotDiagram {
  const instances = diagram.parsedAttrs?.instances
  const instanceNodes = (instances?.nodes ?? []).map((n) => ({
    id: n.id,
    modelNodeId: n.modelNodeId,
    x: n.x,
    y: n.y,
    ...(n.width != null ? { width: n.width } : {}),
    ...(n.height != null ? { height: n.height } : {}),
  }))
  const instanceEdges = (instances?.edges ?? []).map((e) => ({
    id: e.id,
    modelLinkId: e.modelLinkId,
    sourceInstanceId: e.sourceInstanceId,
    targetInstanceId: e.targetInstanceId,
  }))
  const nodeIds = [
    ...new Set(
      instanceNodes
        .map((n) => n.modelNodeId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]
  const linkIds = [
    ...new Set(
      instanceEdges
        .map((e) => e.modelLinkId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]
  return {
    id: diagram.id,
    name: diagram.name,
    version: diagram.version,
    notationId: diagram.notationId,
    nodeIds,
    linkIds,
    instances: instanceNodes,
    edges: instanceEdges,
  }
}

export function buildDiagramScriptSnapshot(input: {
  state: ModelEditorState
  modelName: string
  modelVersion: string
  openDiagramId: string | null
}): { snapshot: ValidationSnapshot; openDiagramId: string | null } {
  const { state, modelName, modelVersion, openDiagramId } = input
  const openDiagram =
    openDiagramId == null
      ? undefined
      : state.diagrams.find((d) => d.id === openDiagramId && !d._isDeleted)

  if (!openDiagram) {
    const empty: ValidationSnapshot = {
      model: {
        id: state.modelId,
        name: modelName,
        version: modelVersion,
        nodes: [],
        links: [],
        folders: [],
        diagrams: [],
      },
      notations: [],
      types: { nodeTypes: [], linkTypes: [] },
    }
    return {
      snapshot: JSON.parse(JSON.stringify(empty)) as ValidationSnapshot,
      openDiagramId: null,
    }
  }

  const diagram = toOpenSnapshotDiagram(openDiagram)
  const nodeIdSet = new Set(diagram.nodeIds)
  const linkIdSet = new Set(diagram.linkIds)

  const nodes: SnapshotNode[] = state.nodes
    .filter((n) => !n._isDeleted && nodeIdSet.has(n.id))
    .map((n) => ({
      id: n.id,
      name: n.name,
      parentId: n.parentNodeId ?? null,
      nodeTypeId: n.nodeTypeId,
      attrs: toPlainRecord(n.parsedAttrs),
    }))

  const links: SnapshotLink[] = state.links
    .filter((l) => !l._isDeleted && linkIdSet.has(l.id))
    .map((l) => ({
      id: l.id,
      name: '',
      sourceId: l.sourceId,
      targetId: l.targetId,
      linkTypeId: l.linkTypeId,
      attrs: toPlainRecord(l.parsedAttrs),
    }))

  const notations: SnapshotNotation[] = state.notations
    .filter((n) => n.id === diagram.notationId)
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

  const snapshot: ValidationSnapshot = {
    model: {
      id: state.modelId,
      name: modelName,
      version: modelVersion,
      nodes,
      links,
      folders: [],
      diagrams: [diagram],
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
  return { snapshot: plain, openDiagramId: diagram.id }
}
