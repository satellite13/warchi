import type { DiagramReferenceResponse } from '@/types/api'
import type { EditorDiagram } from '../types'

const isChangedLocally = (diagram: EditorDiagram): boolean =>
  diagram._isNew === true || diagram._isDirty === true || diagram._isDeleted === true

const toReference = (diagram: EditorDiagram): DiagramReferenceResponse => ({
  id: diagram.id,
  name: diagram.name,
  version: diagram.version,
  notationId: diagram.notationId,
  nodeId: diagram.nodeId ?? null,
})

const compareReferences = (
  left: DiagramReferenceResponse,
  right: DiagramReferenceResponse
): number => {
  if (left.name < right.name) return -1
  if (left.name > right.name) return 1
  return left.id.localeCompare(right.id)
}

export function resolveTraceabilityDiagramReferences(
  remoteRows: readonly DiagramReferenceResponse[],
  localDiagrams: readonly EditorDiagram[],
  selectedNodeId: string
): DiagramReferenceResponse[] {
  const rows = new Map(remoteRows.map(row => [row.id, row]))
  const changed = localDiagrams
    .filter(isChangedLocally)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))

  for (const diagram of changed) {
    if (diagram._isDeleted) {
      rows.delete(diagram.id)
      continue
    }
    if (diagram._attrsPending) continue
    const containsNode = diagram.parsedAttrs.instances.nodes.some(
      instance => instance.modelNodeId === selectedNodeId
    )
    if (containsNode) rows.set(diagram.id, toReference(diagram))
    else rows.delete(diagram.id)
  }

  return [...rows.values()].sort(compareReferences)
}
