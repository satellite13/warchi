import type { ImportIssue, ImportValidationResult, OefParsedModel, OefView, OefViewConnection, OefViewNode } from './types'

function isOefDiagramNoteNode(node: OefViewNode): boolean {
  return node.type === 'Label' || node.type === 'Note'
}

function isOefDiagramContainerNode(node: OefViewNode): boolean {
  return node.type === 'Container'
}

function isOefDiagramOnlyViewNode(node: OefViewNode): boolean {
  return isOefDiagramNoteNode(node) || isOefDiagramContainerNode(node)
}

function isOefDiagramNoteConnection(connection: OefViewConnection): boolean {
  return connection.type === 'Line' && !connection.relationshipId
}

function validateDuplicates(
  ids: string[],
  code: ImportIssue['code'],
  messageFactory: (id: string) => string
): ImportIssue[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const id of ids) {
    if (!id) continue
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  return [...duplicates].map(id => ({
    code,
    level: 'error',
    entityId: id,
    message: messageFactory(id),
  }))
}

function validateView(view: OefView, relationshipIds: Set<string>): ImportIssue[] {
  const issues: ImportIssue[] = []
  const nodeIds = new Set(view.nodes.map(node => node.id))
  const connectionIds = new Set(view.connections.map(connection => connection.id))

  for (const node of view.nodes) {
    if (!isOefDiagramOnlyViewNode(node) && !node.elementId) {
      issues.push({
        code: 'viewNodeMissingElementRef',
        level: 'error',
        viewId: view.id,
        entityId: node.id,
        message: `View node "${node.id}" has no elementRef`,
      })
    }
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      issues.push({
        code: 'viewNodeMissingCoordinates',
        level: 'warning',
        viewId: view.id,
        entityId: node.id,
        message: `View node "${node.id}" has invalid coordinates`,
      })
    }
  }

  for (const connection of view.connections) {
    if (
      !isOefDiagramNoteConnection(connection) &&
      (!connection.relationshipId || !relationshipIds.has(connection.relationshipId))
    ) {
      issues.push({
        code: 'viewConnectionMissingRelationshipRef',
        level: 'error',
        viewId: view.id,
        entityId: connection.id,
        message: `View connection "${connection.id}" points to missing relationship "${connection.relationshipId}"`,
      })
    }
    const sourceOk = nodeIds.has(connection.sourceNodeId) || connectionIds.has(connection.sourceNodeId)
    const targetOk = nodeIds.has(connection.targetNodeId) || connectionIds.has(connection.targetNodeId)
    if (!sourceOk) {
      issues.push({
        code: 'viewConnectionMissingSourceNode',
        level: 'error',
        viewId: view.id,
        entityId: connection.id,
        message: `View connection "${connection.id}" points to missing source node "${connection.sourceNodeId}"`,
      })
    }
    if (!targetOk) {
      issues.push({
        code: 'viewConnectionMissingTargetNode',
        level: 'error',
        viewId: view.id,
        entityId: connection.id,
        message: `View connection "${connection.id}" points to missing target node "${connection.targetNodeId}"`,
      })
    }
  }

  return issues
}

export function validateParsedOefModel(parsed: OefParsedModel): ImportValidationResult {
  const issues: ImportIssue[] = []

  issues.push(
    ...validateDuplicates(
      parsed.elements.map(element => element.id),
      'duplicateElementId',
      id => `Duplicate element identifier "${id}"`
    )
  )
  issues.push(
    ...validateDuplicates(
      parsed.relationships.map(relationship => relationship.id),
      'duplicateRelationshipId',
      id => `Duplicate relationship identifier "${id}"`
    )
  )
  issues.push(
    ...validateDuplicates(
      parsed.views.map(view => view.id),
      'duplicateViewId',
      id => `Duplicate view identifier "${id}"`
    )
  )

  const elementIds = new Set(parsed.elements.map(element => element.id))
  const relationshipIds = new Set(parsed.relationships.map(relationship => relationship.id))

  for (const element of parsed.elements) {
    if (!element.type) {
      issues.push({
        code: 'missingElementType',
        level: 'warning',
        entityId: element.id,
        message: `Element "${element.id}" has no xsi:type`,
      })
    }
  }

  for (const relationship of parsed.relationships) {
    if (!relationship.type) {
      issues.push({
        code: 'missingRelationshipType',
        level: 'warning',
        entityId: relationship.id,
        message: `Relationship "${relationship.id}" has no xsi:type`,
      })
    }

    const sourceIsElement = !!relationship.sourceElementId && elementIds.has(relationship.sourceElementId)
    const targetIsElement = !!relationship.targetElementId && elementIds.has(relationship.targetElementId)
    const sourceIsRelationship =
      !!relationship.sourceElementId && relationshipIds.has(relationship.sourceElementId)
    const targetIsRelationship =
      !!relationship.targetElementId && relationshipIds.has(relationship.targetElementId)

    if (sourceIsRelationship || targetIsRelationship) {
      issues.push({
        code: 'relationshipEndpointIsRelationship',
        level: 'warning',
        entityId: relationship.id,
        message: `Relationship "${relationship.id}" attaches to another relationship and will be imported as diagram-only`,
      })
    }

    if (!sourceIsElement && !sourceIsRelationship) {
      issues.push({
        code: 'relationshipMissingSource',
        level: 'error',
        entityId: relationship.id,
        message: `Relationship "${relationship.id}" points to missing source element "${relationship.sourceElementId}"`,
      })
    }
    if (!targetIsElement && !targetIsRelationship) {
      issues.push({
        code: 'relationshipMissingTarget',
        level: 'error',
        entityId: relationship.id,
        message: `Relationship "${relationship.id}" points to missing target element "${relationship.targetElementId}"`,
      })
    }
  }

  for (const view of parsed.views) {
    issues.push(
      ...validateDuplicates(
        view.nodes.map(node => node.id),
        'duplicateViewNodeId',
        id => `View "${view.id}" contains duplicate node identifier "${id}"`
      ).map(issue => ({ ...issue, viewId: view.id }))
    )
    issues.push(
      ...validateDuplicates(
        view.connections.map(connection => connection.id),
        'duplicateViewConnectionId',
        id => `View "${view.id}" contains duplicate connection identifier "${id}"`
      ).map(issue => ({ ...issue, viewId: view.id }))
    )
    for (const node of view.nodes) {
      if (isOefDiagramOnlyViewNode(node)) continue
      if (!node.elementId || !elementIds.has(node.elementId)) {
        issues.push({
          code: 'viewNodeMissingElementRef',
          level: 'error',
          viewId: view.id,
          entityId: node.id,
          message: `View node "${node.id}" points to missing element "${node.elementId}"`,
        })
      }
    }
    issues.push(...validateView(view, relationshipIds))
  }

  return {
    issues,
    hasErrors: issues.some(issue => issue.level === 'error'),
  }
}
