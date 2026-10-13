import type { EditorDiagram } from '../types'

/**
 * Collects diagram ids per model node across non-deleted diagrams.
 * Usage counting is a pure function: no Vue reactivity, no component state.
 */
export function collectNodeDiagramUsage(
  diagrams: EditorDiagram[],
  nodeIds: string[]
): Map<string, string[]> {
  const wanted = new Set(nodeIds)
  const usage = new Map<string, string[]>()
  for (const id of nodeIds) usage.set(id, [])

  for (const diagram of diagrams) {
    if (diagram._isDeleted) continue
    for (const instance of diagram.parsedAttrs?.instances?.nodes ?? []) {
      const modelNodeId = instance.modelNodeId
      if (modelNodeId && wanted.has(modelNodeId)) {
        usage.get(modelNodeId)!.push(diagram.id)
      }
    }
  }
  return usage
}

export function countNodeUsage(diagrams: EditorDiagram[], nodeId: string): number {
  return collectNodeDiagramUsage(diagrams, [nodeId]).get(nodeId)!.length
}
