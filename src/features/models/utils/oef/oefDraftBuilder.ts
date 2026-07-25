import type {
  ImportDraft,
  ImportDraftDiagram,
  ImportDraftDiagramConnectionInstance,
  OefParsedModel,
  OefViewConnection,
  OefViewNode,
} from './types'

function isOefDiagramNoteNode(node: OefViewNode): boolean {
  return node.type === 'Label' || node.type === 'Note'
}

function isOefDiagramContainerNode(node: OefViewNode): boolean {
  return node.type === 'Container'
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
  const elementIds = new Set(parsed.elements.map(element => element.id))
  const relationshipIds = new Set(parsed.relationships.map(relationship => relationship.id))

  const diagrams: ImportDraftDiagram[] = parsed.views.map(view => {
    const connectionIds = new Set(view.connections.map(connection => connection.id))

    const connectionInstances: ImportDraftDiagramConnectionInstance[] = view.connections.map(
      connection => {
        const sourceIsConnection = connectionIds.has(connection.sourceNodeId)
        const targetIsConnection = connectionIds.has(connection.targetNodeId)
        const attachesToConnectionId = sourceIsConnection
          ? connection.sourceNodeId
          : targetIsConnection
            ? connection.targetNodeId
            : undefined
        const attachEndpoint: 'source' | 'target' | undefined = sourceIsConnection
          ? 'source'
          : targetIsConnection
            ? 'target'
            : undefined

        const relationship = parsed.relationships.find(
          item => item.id === connection.relationshipId
        )
        const relToRel =
          !!relationship &&
          ((!elementIds.has(relationship.sourceElementId) &&
            relationshipIds.has(relationship.sourceElementId)) ||
            (!elementIds.has(relationship.targetElementId) &&
              relationshipIds.has(relationship.targetElementId)))

        const isNoteLink = isOefDiagramNoteConnection(connection)
        const isDiagramOnlyLink = isNoteLink || relToRel || !!attachesToConnectionId

        return {
          sourceConnectionId: connection.id,
          sourceRelationshipId: connection.relationshipId,
          sourceNodeId: connection.sourceNodeId,
          targetNodeId: connection.targetNodeId,
          ...(isNoteLink ? { isNoteLink: true } : {}),
          ...(isDiagramOnlyLink ? { isDiagramOnlyLink: true } : {}),
          ...(attachesToConnectionId
            ? { attachesToConnectionId, attachEndpoint }
            : {}),
        }
      }
    )

    return {
      sourceViewId: view.id,
      sourceType: view.type,
      name: view.name || `View ${view.id}`,
      nodeInstances: view.nodes.map(node => {
        const isNote = isOefDiagramNoteNode(node)
        const isContainer = isOefDiagramContainerNode(node)
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
          ...(isContainer
            ? {
                isContainer: true,
                containerLabel: node.labelText?.trim() || '',
              }
            : {}),
        }
      }),
      connectionInstances,
    }
  })

  return {
    sourceModelId: parsed.model.id,
    sourceModelName: parsed.model.name || 'Imported model',
    nodes: parsed.elements.map(element => ({
      sourceElementId: element.id,
      sourceType: element.type,
      name: element.name || `Element ${element.id}`,
    })),
    links: parsed.relationships.map(relationship => {
      const name = (relationship.name ?? '').trim()
      return {
        sourceRelationshipId: relationship.id,
        sourceType: relationship.type,
        sourceElementId: relationship.sourceElementId,
        targetElementId: relationship.targetElementId,
        ...(name ? { name } : {}),
      }
    }),
    diagrams,
    organizations: Array.isArray(parsed.organizations) ? parsed.organizations : [],
    sourceElementTypes: toUniqueSorted(parsed.elements.map(element => element.type)),
    sourceRelationshipTypes: toUniqueSorted(parsed.relationships.map(relationship => relationship.type)),
  }
}
