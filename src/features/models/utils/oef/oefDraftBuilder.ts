import type { ImportDraft, ImportDraftDiagram, OefParsedModel, OefViewConnection, OefViewNode } from './types'

function isOefDiagramNoteNode(node: OefViewNode): boolean {
  return node.type === 'Label' || node.type === 'Note'
}

function isOefDiagramNoteConnection(connection: OefViewConnection): boolean {
  return connection.type === 'Line' && !connection.relationshipId
}

function toUniqueSorted(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  )
}

export function buildImportDraft(parsed: OefParsedModel): ImportDraft {
  const diagrams: ImportDraftDiagram[] = parsed.views.map(view => ({
    sourceViewId: view.id,
    sourceType: view.type,
    name: view.name || `View ${view.id}`,
    nodeInstances: view.nodes.map(node => {
      const isNote = isOefDiagramNoteNode(node)
      return {
        sourceNodeId: node.id,
        sourceElementId: node.elementId,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        ...(isNote
          ? {
              isNote: true,
              noteText: node.labelText?.trim() || 'Заметка',
            }
          : {}),
      }
    }),
    connectionInstances: view.connections.map(connection => ({
      sourceConnectionId: connection.id,
      sourceRelationshipId: connection.relationshipId,
      sourceNodeId: connection.sourceNodeId,
      targetNodeId: connection.targetNodeId,
      ...(isOefDiagramNoteConnection(connection) ? { isNoteLink: true } : {}),
    })),
  }))

  return {
    sourceModelId: parsed.model.id,
    sourceModelName: parsed.model.name || 'Imported model',
    nodes: parsed.elements.map(element => ({
      sourceElementId: element.id,
      sourceType: element.type,
      name: element.name || `Element ${element.id}`,
    })),
    links: parsed.relationships.map(relationship => ({
      sourceRelationshipId: relationship.id,
      sourceType: relationship.type,
      sourceElementId: relationship.sourceElementId,
      targetElementId: relationship.targetElementId,
    })),
    diagrams,
    sourceElementTypes: toUniqueSorted(parsed.elements.map(element => element.type)),
    sourceRelationshipTypes: toUniqueSorted(parsed.relationships.map(relationship => relationship.type)),
  }
}
